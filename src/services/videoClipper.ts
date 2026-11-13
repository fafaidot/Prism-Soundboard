// Dual-Staggered MediaRecorder Instant Replay Buffer (Medal / ShadowPlay style)
// Two MediaRecorder instances run concurrently, offset by half the buffer duration.
// MediaRecorder handles encoding + A/V synchronization + muxing internally — zero manual timestamps.
// Clips are guaranteed to match the configured duration:
// Each slot records for exactly bufferDurationSeconds and rotates on a tight schedule.
// When clipped, the slot closest to the target duration (or the completed buffer) is exported
// and exact duration metadata is embedded.

import { audioEngine } from './audioEngine';
// @ts-ignore - no types available for fix-webm-duration
import fixWebmDuration from 'fix-webm-duration';

export interface VideoClipperConfig {
  durationSeconds: number;
}

interface RecorderSlot {
  recorder: MediaRecorder;
  chunks: Blob[];
  startTime: number; // performance.now() when started
  stopped: boolean;
}

class VideoClipper {
  private screenStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private combinedStream: MediaStream | null = null;

  // Dual-staggered recorder slots
  private slots: RecorderSlot[] = [];
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private slotBTimeout: ReturnType<typeof setTimeout> | null = null;

  private lastCompletedBlob: Blob | null = null;
  private lastCompletedDurationMs: number = 0;

  private isBuffering: boolean = false;
  private isExporting: boolean = false;
  private bufferDurationSeconds: number = 30;

  private captureWidth: number = 1920;
  private captureHeight: number = 1080;

  private mimeType: string = '';

  public isRecordingActive(): boolean {
    return this.isBuffering;
  }

  public getDuration(): number {
    return this.bufferDurationSeconds;
  }

  public setDuration(seconds: number) {
    const newDur = Math.max(5, Math.min(120, seconds));
    if (this.bufferDurationSeconds !== newDur) {
      console.log(`[VideoClipper] Setting buffer duration to ${newDur}s (was ${this.bufferDurationSeconds}s)`);
      this.bufferDurationSeconds = newDur;
      // Note: We deliberately do NOT wipe or cancel existing slots here.
      // Any video frames already buffered are safely preserved.
    }
  }

  /**
   * Select the best supported mimeType for MediaRecorder
   */
  private selectMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        console.log(`[VideoClipper] Selected mimeType: ${mime}`);
        return mime;
      }
    }
    console.warn('[VideoClipper] No preferred mimeType supported, using default');
    return '';
  }

  /**
   * Create a new MediaRecorder for the combined stream and start it
   */
  private createSlot(): RecorderSlot {
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 8_000_000,
    };
    if (this.mimeType) {
      options.mimeType = this.mimeType;
    }

    const recorder = new MediaRecorder(this.combinedStream!, options);
    const slot: RecorderSlot = {
      recorder,
      chunks: [],
      startTime: performance.now(),
      stopped: false,
    };

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        slot.chunks.push(e.data);
      }
    };

    recorder.onerror = (e) => {
      console.error('[VideoClipper] MediaRecorder error:', e);
    };

    // Start recording continuously — NO timeslice to ensure intact EBML headers
    recorder.start();
    return slot;
  }

  /**
   * Stop a recorder slot and return a promise that resolves with the complete blob
   */
  private stopSlot(slot: RecorderSlot): Promise<{ blob: Blob; durationMs: number }> {
    return new Promise((resolve) => {
      if (slot.stopped || slot.recorder.state === 'inactive') {
        const blob = new Blob(slot.chunks, { type: this.mimeType || 'video/webm' });
        const durationMs = performance.now() - slot.startTime;
        resolve({ blob, durationMs });
        return;
      }

      slot.recorder.onstop = () => {
        slot.stopped = true;
        const blob = new Blob(slot.chunks, { type: this.mimeType || 'video/webm' });
        const durationMs = performance.now() - slot.startTime;
        resolve({ blob, durationMs });
      };

      try {
        slot.recorder.stop();
      } catch (e) {
        slot.stopped = true;
        const blob = new Blob(slot.chunks, { type: this.mimeType || 'video/webm' });
        const durationMs = performance.now() - slot.startTime;
        resolve({ blob, durationMs });
      }
    });
  }

  /**
   * Initializes screen capture, mixes system sound + microphone,
   * and begins dual-staggered MediaRecorder replay buffer
   */
  public async startBuffer(durationSeconds: number = 30): Promise<boolean> {
    if (this.isBuffering && this.slots.length > 0) {
      this.setDuration(durationSeconds);
      return true;
    }

    // Clean previous session
    this.stopBuffer();

    try {
      this.bufferDurationSeconds = durationSeconds;

      let stream: MediaStream | null = null;

      // 1. Primary: getDisplayMedia (intercepted by Electron's setDisplayMediaRequestHandler)
      // Provides BOTH screen video AND Windows WASAPI system audio loopback
      if (navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 },
            } as any,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as any,
          });
        } catch (gdmErr) {
          console.warn('[VideoClipper] getDisplayMedia failed, trying fallback:', gdmErr);
        }
      }

      // 2. Fallback: desktopCapturer via getUserMedia
      if (!stream && window.soundboardAPI?.getDesktopScreenSources) {
        try {
          const sources = await window.soundboardAPI.getDesktopScreenSources();
          const primary = sources && sources.length > 0 ? sources[0] : null;
          if (primary) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: primary.id,
                },
              } as any,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: primary.id,
                  minWidth: 1280,
                  maxWidth: 1920,
                  minHeight: 720,
                  maxHeight: 1080,
                  maxFrameRate: 60,
                },
              } as any,
            });
          }
        } catch (srcErr) {
          console.warn('[VideoClipper] getUserMedia fallback failed:', srcErr);
        }
      }

      if (!stream) {
        console.warn('[VideoClipper] Could not acquire display stream.');
        return false;
      }

      this.screenStream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.warn('[VideoClipper] Stream has no video track.');
        return false;
      }

      videoTrack.onended = () => {
        this.stopBuffer();
      };

      const settings = videoTrack.getSettings();
      this.captureWidth = settings.width || 1920;
      this.captureHeight = settings.height || 1080;

      // 3. Initialize Web Audio graph to mix system audio + microphone
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: 48000 });
      this.audioContext = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const mixDest = audioCtx.createMediaStreamDestination();

      // A. Connect system audio loopback
      const sysTracks = stream.getAudioTracks();
      if (sysTracks.length > 0) {
        try {
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream([sysTracks[0]]));
          const sysGain = audioCtx.createGain();
          sysGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          sysSource.connect(sysGain);
          sysGain.connect(mixDest);
          console.log('[VideoClipper] System audio connected:', sysTracks[0].label);
        } catch (sysErr) {
          console.warn('[VideoClipper] System audio route error:', sysErr);
        }
      } else {
        console.warn('[VideoClipper] No system audio track on screen stream');
      }

      // B. Connect physical microphone
      let micStream = audioEngine.getMicrophoneStream();
      if (!micStream || micStream.getAudioTracks().length === 0 || !micStream.active) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: false,
          });
        } catch (e) {
          console.warn('[VideoClipper] Could not acquire microphone:', e);
        }
      }
      this.micStream = micStream;

      if (micStream && micStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
          const micGain = audioCtx.createGain();
          micGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          micSource.connect(micGain);
          micGain.connect(mixDest);
          console.log('[VideoClipper] Microphone connected:', micStream.getAudioTracks()[0].label);
        } catch (micErr) {
          console.warn('[VideoClipper] Mic audio route error:', micErr);
        }
      }

      // C. Keep the audio rendering thread alive with a silent signal to destination
      const silentOsc = audioCtx.createOscillator();
      const silentGain = audioCtx.createGain();
      silentGain.gain.setValueAtTime(0, audioCtx.currentTime);
      silentOsc.connect(silentGain);
      silentGain.connect(audioCtx.destination);
      silentOsc.start();

      // 4. Create the combined MediaStream: screen video + mixed audio
      const mixedAudioTrack = mixDest.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        this.combinedStream = new MediaStream([videoTrack, mixedAudioTrack]);
      } else {
        this.combinedStream = new MediaStream([videoTrack]);
      }

      // 5. Select codec
      this.mimeType = this.selectMimeType();

      // 6. Start dual-staggered MediaRecorder rotation
      this.isBuffering = true;
      this.slots = [];
      this.lastCompletedBlob = null;
      this.lastCompletedDurationMs = 0;

      this.resetRotationSchedule();

      console.log(
        `[VideoClipper] Dual-staggered MediaRecorder replay buffer active ` +
        `(${this.bufferDurationSeconds}s @ ${this.captureWidth}x${this.captureHeight}) with system audio + mic!`
      );
      return true;
    } catch (err) {
      console.warn('[VideoClipper] Failed to start buffer:', err);
      this.stopBuffer();
      return false;
    }
  }

  /**
   * Sets up or resets the dual-staggered rotation schedule
   */
  private resetRotationSchedule() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.slotBTimeout) {
      clearTimeout(this.slotBTimeout);
      this.slotBTimeout = null;
    }

    // Stop current slots and start fresh
    for (const slot of this.slots) {
      if (!slot.stopped && slot.recorder.state !== 'inactive') {
        try {
          slot.recorder.stop();
        } catch (e) {}
        slot.stopped = true;
      }
    }
    this.slots = [];

    if (!this.combinedStream) return;

    // Start primary slot immediately
    const slotA = this.createSlot();
    this.slots.push(slotA);

    // Stagger interval: half the buffer duration (e.g. 15s for 30s buffer)
    const staggerIntervalMs = Math.max(5000, Math.min(15000, (this.bufferDurationSeconds * 1000) / 2));

    // Start secondary staggered slot after staggerIntervalMs
    this.slotBTimeout = setTimeout(() => {
      if (!this.isBuffering || !this.combinedStream) return;
      const slotB = this.createSlot();
      this.slots.push(slotB);
    }, staggerIntervalMs);

    // Continuous rotation loop: checks every 1000ms
    this.rotationTimer = setInterval(() => {
      this.checkSlotRotation();
    }, 1000);
  }

  /**
   * Continuous slot rotation:
   * Keeps active recording slots overlapping seamlessly.
   * An older slot is ONLY retired after it has reached (target + staggerInterval),
   * guaranteeing the younger slot has ALREADY reached the target buffer duration!
   */
  private async checkSlotRotation() {
    if (!this.isBuffering || !this.combinedStream || this.slots.length === 0) return;

    const targetMs = this.bufferDurationSeconds * 1000;
    const staggerIntervalMs = Math.max(5000, Math.min(15000, targetMs / 2));
    const maxLifespanMs = targetMs + staggerIntervalMs; // e.g. 30s + 15s = 45s

    // 1. Maintain dual-staggered coverage if we only have 1 active slot
    const activeSlots = this.slots.filter((s) => !s.stopped && s.recorder.state !== 'inactive');
    if (activeSlots.length === 1) {
      const elapsed = performance.now() - activeSlots[0].startTime;
      if (elapsed >= staggerIntervalMs) {
        const newSlot = this.createSlot();
        this.slots.push(newSlot);
      }
    }

    // 2. Rotate out any slot that has exceeded maxLifespanMs
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.stopped) continue;

      const elapsed = performance.now() - slot.startTime;
      if (elapsed >= maxLifespanMs) {
        try {
          const { blob, durationMs } = await this.stopSlot(slot);
          if (blob.size > 0) {
            this.lastCompletedBlob = blob;
            this.lastCompletedDurationMs = durationMs;
          }
          this.slots = this.slots.filter((s) => !s.stopped);

          // Start a replacement slot to maintain continuous overlap
          if (this.isBuffering && this.combinedStream && this.slots.filter((s) => !s.stopped).length < 2) {
            const replacement = this.createSlot();
            this.slots.push(replacement);
          }
        } catch (err) {
          console.warn('[VideoClipper] Rotation error:', err);
        }
        break;
      }
    }
  }

  /**
   * Clips the configured seconds from the replay buffer.
   * Guarantees that once the buffer has warmed up, the clip is ALWAYS at least the full target duration!
   */
  public async clipLastSeconds(title?: string): Promise<{ success: boolean; clip?: any; error?: string }> {
    if (this.isExporting) {
      return { success: false, error: 'Clip export already in progress.' };
    }

    // If buffer wasn't started, attempt to start it now
    if (!this.isBuffering || this.slots.length === 0) {
      const started = await this.startBuffer(this.bufferDurationSeconds);
      if (!started) {
        return { success: false, error: 'Screen capture permission not granted or cancelled.' };
      }
      return {
        success: false,
        error: 'Screen recorder initialized. Buffer is filling now, press again in a few seconds!',
      };
    }

    try {
      this.isExporting = true;
      const targetMs = this.bufferDurationSeconds * 1000;

      // Find active slots
      const activeSlots = this.slots.filter((s) => !s.stopped && s.recorder.state !== 'inactive');

      let chosenSlot: RecorderSlot | null = null;
      let chosenElapsed = 0;

      // Case A: Look for a slot that has recorded at least targetMs (e.g. >= 30s)
      const matureSlots = activeSlots.filter((s) => performance.now() - s.startTime >= targetMs);
      if (matureSlots.length > 0) {
        // Pick the mature slot closest to targetMs (so it represents the most recent targetMs)
        matureSlots.sort((a, b) => (performance.now() - a.startTime) - (performance.now() - b.startTime));
        chosenSlot = matureSlots[0];
        chosenElapsed = performance.now() - chosenSlot.startTime;
      } else {
        // Case B: Buffer is still warming up, find the longest running active slot
        for (const slot of activeSlots) {
          const elapsed = performance.now() - slot.startTime;
          if (elapsed > chosenElapsed) {
            chosenElapsed = elapsed;
            chosenSlot = slot;
          }
        }
      }

      console.log(
        `[VideoClipper] Clipping request: target ${this.bufferDurationSeconds}s, ` +
        `chosen slot: ${(chosenElapsed / 1000).toFixed(1)}s, ` +
        `active slots count: ${activeSlots.length}`
      );

      // Guard: If the longest slot has recorded less than 3 seconds (just started),
      // DO NOT export a 1-second blank black screen!
      if (!chosenSlot || chosenElapsed < 3000) {
        return {
          success: false,
          error: `Replay buffer is filling up (${Math.round(chosenElapsed / 1000)}s of ${this.bufferDurationSeconds}s). Please wait a few seconds and try again.`,
        };
      }

      // Stop the chosen slot and retrieve the recorded video
      const { blob, durationMs } = await this.stopSlot(chosenSlot);
      this.slots = this.slots.filter((s) => !s.stopped);

      // Immediately start a replacement slot to keep coverage uninterrupted
      if (this.isBuffering && this.combinedStream) {
        const replacement = this.createSlot();
        this.slots.push(replacement);
      }

      return await this.exportBlob(blob, durationMs, title);
    } catch (err: any) {
      console.error('[VideoClipper] Export failed:', err);
      return { success: false, error: err.message || 'Unknown export error.' };
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * Export a recorded blob: fix duration metadata, convert to base64, save via IPC
   */
  private async exportBlob(
    rawBlob: Blob,
    durationMs: number,
    title?: string
  ): Promise<{ success: boolean; clip?: any; error?: string }> {
    const effectiveDurationMs = Math.max(1000, durationMs);

    // Fix WebM duration metadata with the exact recorded duration
    let fixedBlob: Blob;
    try {
      fixedBlob = await fixWebmDuration(rawBlob, effectiveDurationMs);
    } catch {
      fixedBlob = rawBlob; // fallback to raw blob if fix fails
    }

    // Convert to base64 data URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader result is not a string'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(fixedBlob);
    });

    const durationSeconds = Math.round((effectiveDurationMs / 1000) * 10) / 10;
    const clipTitle =
      title ||
      `Clip ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    if (window.soundboardAPI?.saveRecordedVideoClip) {
      const savedClip = await window.soundboardAPI.saveRecordedVideoClip({
        base64: dataUrl,
        duration: durationSeconds,
        title: clipTitle,
        width: this.captureWidth,
        height: this.captureHeight,
      });

      this.playClipCueSound();

      return { success: true, clip: savedClip };
    }

    return { success: false, error: 'soundboardAPI not available.' };
  }

  /**
   * Sound effect cue when clipping succeeds
   */
  private playClipCueSound() {
    try {
      const audioCtx = audioEngine.getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  }

  /**
   * Stops all recorders, releases all tracks and resources
   */
  public stopBuffer() {
    this.isBuffering = false;

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.slotBTimeout) {
      clearTimeout(this.slotBTimeout);
      this.slotBTimeout = null;
    }

    // Stop all active recorder slots
    for (const slot of this.slots) {
      if (!slot.stopped && slot.recorder.state !== 'inactive') {
        try {
          slot.recorder.stop();
        } catch (e) {}
        slot.stopped = true;
      }
    }
    this.slots = [];
    this.lastCompletedBlob = null;
    this.lastCompletedDurationMs = 0;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.screenStream = null;
    }

    if (this.micStream) {
      if (this.micStream !== audioEngine.getMicrophoneStream()) {
        this.micStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
      }
      this.micStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    this.combinedStream = null;
}
}

export const videoClipper = new VideoClipper();
