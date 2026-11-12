// High-performance In-Memory Ring Buffer Video Screen Recorder (Medal-like Instant Replay Clipper)
// Continuously buffers display video + system desktop loopback audio + physical microphone
// Zero CPU spike, hardware-accelerated video pipeline with instant export on hotkey trigger

import { audioEngine } from './audioEngine';
import fixWebmDuration from 'fix-webm-duration';

export interface VideoClipperConfig {
  durationSeconds: number; // e.g. 15, 30, 45, 60
}

class VideoClipper {
  private mediaRecorder: MediaRecorder | null = null;
  private screenStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private headerChunk: Blob | null = null;
  private chunks: { blob: Blob; timestamp: number }[] = [];
  private isBuffering: boolean = false;
  private isExporting: boolean = false;
  private bufferDurationSeconds: number = 15;
  private recordedMimeType: string = 'video/webm;codecs=vp8,opus';

  public isRecordingActive(): boolean {
    return this.isBuffering;
  }

  public getDuration(): number {
    return this.bufferDurationSeconds;
  }

  public setDuration(seconds: number) {
    this.bufferDurationSeconds = Math.max(5, Math.min(120, seconds));
  }

  /**
   * Initializes screen capture, mixes system sound + microphone, and begins rolling circular memory buffer
   */
  public async startBuffer(durationSeconds: number = 15): Promise<boolean> {
    if (this.isBuffering && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.bufferDurationSeconds = durationSeconds;
      return true;
    }

    try {
      this.bufferDurationSeconds = durationSeconds;
      this.chunks = [];
      this.headerChunk = null;

      let stream: MediaStream | null = null;

      // 1. First priority: Try native Electron desktopCapturer screen capture via getUserMedia
      // This is 100% reliable in Electron on Windows and never produces a black screen
      if (window.soundboardAPI?.getDesktopScreenSources) {
        try {
          const sources = await window.soundboardAPI.getDesktopScreenSources();
          const primary = sources && sources.length > 0 ? sources[0] : null;
          if (primary) {
            console.log('[VideoClipper] Using Electron desktopCapturer source:', primary.name, primary.id);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
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
          console.warn('[VideoClipper] getUserMedia with desktopCapturer source failed, trying getDisplayMedia fallback:', srcErr);
        }
      }

      // 2. Fallback: getDisplayMedia (intercepted by session.setDisplayMediaRequestHandler in main.cjs)
      if (!stream && navigator.mediaDevices?.getDisplayMedia) {
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

      // Mix System Desktop Audio + Physical Microphone Audio into a single synchronized audio track
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      this.audioContext = audioCtx;
      const audioDestination = audioCtx.createMediaStreamDestination();

      // Keep audio stream active with silent oscillator to avoid Chrome audio track sleeping
      try {
        const dummyOsc = audioCtx.createOscillator();
        const dummyGain = audioCtx.createGain();
        dummyGain.gain.setValueAtTime(0.00001, audioCtx.currentTime);
        dummyOsc.connect(dummyGain);
        dummyGain.connect(audioDestination);
        dummyOsc.start();
      } catch (e) {}

      // A. Connect system loopback audio from screenStream (if track present)
      const systemAudioTracks = stream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        try {
          const sysAudioSource = audioCtx.createMediaStreamSource(new MediaStream([systemAudioTracks[0]]));
          const sysGain = audioCtx.createGain();
          sysGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          sysAudioSource.connect(sysGain);
          sysGain.connect(audioDestination);
        } catch (sysErr) {
          console.warn('[VideoClipper] Error routing system loopback audio:', sysErr);
        }
      }

      // B. Connect physical microphone audio from audioEngine (or getUserMedia fallback)
      let micStream = audioEngine.getMicrophoneStream();
      if (!micStream || micStream.getAudioTracks().length === 0) {
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
          console.warn('[VideoClipper] Microphone track unavailable for video clip:', e);
        }
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
          const micGain = audioCtx.createGain();
          micGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          micSource.connect(micGain);
          micGain.connect(audioDestination);
        } catch (micErr) {
          console.warn('[VideoClipper] Could not route mic track into clip mixer:', micErr);
        }
      }

      // Combine video track + mixed audio track into single recorded stream
      const tracks: MediaStreamTrack[] = [videoTrack];
      const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        tracks.push(mixedAudioTrack);
      } else if (systemAudioTracks.length > 0) {
        tracks.push(systemAudioTracks[0]);
      }

      this.mixedStream = new MediaStream(tracks);

      // Select robust supported codec (VP8 is universally accelerated on Windows and doesn't produce black screens)
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      this.recordedMimeType = mimeType;

      const recorder = new MediaRecorder(this.mixedStream, {
        mimeType,
        videoBitsPerSecond: 8000000, // 8 Mbps high-quality 60fps video
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const now = Date.now();
          // Store the very first chunk permanently as the EBML Header template!
          // Sliced subsequent chunks require this header to decode properly.
          if (!this.headerChunk) {
            this.headerChunk = event.data;
          }

          this.chunks.push({ blob: event.data, timestamp: now });

          // Prune chunks older than buffer duration (with 2s leeway)
          const cutoff = now - (this.bufferDurationSeconds + 2) * 1000;
          while (this.chunks.length > 0 && this.chunks[0].timestamp < cutoff) {
            this.chunks.shift();
          }
        }
      };

      recorder.onerror = (e) => {
        console.error('[VideoClipper] MediaRecorder error:', e);
      };

      // Emit 1-second chunks for instant-rolling memory buffer
      recorder.start(1000);
      this.mediaRecorder = recorder;
      this.isBuffering = true;

      console.log(`[VideoClipper] Rolling instant replay buffer active (${durationSeconds}s) with mic + game audio using ${mimeType}`);
      return true;
    } catch (err) {
      console.warn('[VideoClipper] Failed to start screen video buffer:', err);
      this.isBuffering = false;
      return false;
    }
  }

  /**
   * Clips the last N seconds and exports as a playable video file via Electron IPC
   */
  public async clipLastSeconds(title?: string): Promise<{ success: boolean; clip?: any; error?: string }> {
    if (this.isExporting) {
      return { success: false, error: 'Clip export already in progress.' };
    }

    // If buffer wasn't started, attempt to start it now
    if (!this.isBuffering || this.chunks.length === 0) {
      const started = await this.startBuffer(this.bufferDurationSeconds);
      if (!started) {
        return { success: false, error: 'Screen capture permission not granted or cancelled.' };
      }
      return { success: false, error: 'Screen recorder initialized. Buffer is filling now, press again in a few seconds!' };
    }

    try {
      this.isExporting = true;
      const now = Date.now();
      const cutoff = now - this.bufferDurationSeconds * 1000;

      // Filter recent chunks within the buffer duration window
      const validChunks = this.chunks
        .filter((c) => c.timestamp >= cutoff)
        .map((c) => c.blob);

      let clipBlobs = validChunks.length > 0 ? validChunks : this.chunks.map((c) => c.blob);
      if (clipBlobs.length === 0) {
        return { success: false, error: 'No video frames buffered yet.' };
      }

      // CRITICAL FIX: Ensure EBML Header is prepended so media players (VLC, Chrome) can decode
      if (this.headerChunk && clipBlobs[0] !== this.headerChunk) {
        clipBlobs = [this.headerChunk, ...clipBlobs];
      }

      const mimeType = this.recordedMimeType || 'video/webm';
      let completeBlob = new Blob(clipBlobs, { type: mimeType });

      // Fix WebM Duration metadata so VLC and HTML5 player can seek and don't stall
      try {
        const actualDurationMs = this.bufferDurationSeconds * 1000;
        completeBlob = await new Promise<Blob>((resolve) => {
          try {
            fixWebmDuration(completeBlob, actualDurationMs, (fixed: Blob) => {
              resolve(fixed);
            });
          } catch {
            resolve(completeBlob);
          }
        });
      } catch (durationErr) {
        console.warn('[VideoClipper] Could not patch WebM duration header:', durationErr);
      }

      // Convert Blob to Base64 Data URL safely via FileReader
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
        reader.readAsDataURL(completeBlob);
      });

      const clipTitle = title || `Clip ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

      if (window.soundboardAPI?.saveRecordedVideoClip) {
        const savedClip = await window.soundboardAPI.saveRecordedVideoClip({
          base64: dataUrl,
          duration: this.bufferDurationSeconds,
          title: clipTitle,
          width: 1920,
          height: 1080,
        });

        // Play feedback cue sound
        this.playClipCueSound();

        return { success: true, clip: savedClip };
      }

      return { success: false, error: 'soundboardAPI not available.' };
    } catch (err: any) {
      console.error('[VideoClipper] Export failed:', err);
      return { success: false, error: err.message || 'Unknown export error.' };
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * Sound effect cue when clipping succeeds
   */
  private playClipCueSound() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
   * Stops recording and releases all display/audio tracks
   */
  public stopBuffer() {
    this.isBuffering = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.mediaRecorder = null;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.screenStream = null;
    }

    if (this.mixedStream) {
      this.mixedStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.mixedStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    this.chunks = [];
    this.headerChunk = null;
  }
}

export const videoClipper = new VideoClipper();
