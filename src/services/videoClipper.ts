// High-performance In-Memory Ring Buffer Video Screen Recorder (Medal-like Instant Replay Clipper)
// Continuously buffers display video + system desktop loopback audio + physical microphone
// Zero CPU spike, hardware-accelerated video pipeline with instant export on hotkey trigger

import { audioEngine } from './audioEngine';

export interface VideoClipperConfig {
  durationSeconds: number; // e.g. 15, 30, 45, 60
}

class VideoClipper {
  private mediaRecorder: MediaRecorder | null = null;
  private displayStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private chunks: { blob: Blob; timestamp: number }[] = [];
  private isBuffering: boolean = false;
  private isExporting: boolean = false;
  private bufferDurationSeconds: number = 15;
  private recordedMimeType: string = 'video/webm;codecs=vp9,opus';

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

      // Request screen video + system desktop loopback audio
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        console.warn('[VideoClipper] navigator.mediaDevices.getDisplayMedia is unavailable.');
        return false;
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
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

      this.displayStream = screenStream;

      // Handle user stopping screen sharing manually from OS banner
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.stopBuffer();
        };
      }

      // Mix System Desktop Audio + Physical Microphone Audio into a single synchronized audio track
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      this.audioContext = audioCtx;
      const audioDestination = audioCtx.createMediaStreamDestination();

      // 1. Connect system loopback audio from screenStream (if track present)
      const systemAudioTracks = screenStream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        const sysAudioSource = audioCtx.createMediaStreamSource(new MediaStream([systemAudioTracks[0]]));
        const sysGain = audioCtx.createGain();
        sysGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        sysAudioSource.connect(sysGain);
        sysGain.connect(audioDestination);
      }

      // 2. Connect physical microphone audio from audioEngine (or getUserMedia fallback)
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
      const tracks: MediaStreamTrack[] = [];
      if (videoTrack) tracks.push(videoTrack);
      const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        tracks.push(mixedAudioTrack);
      } else if (systemAudioTracks.length > 0) {
        tracks.push(systemAudioTracks[0]);
      }

      this.mixedStream = new MediaStream(tracks);

      // Select robust supported codec
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      this.recordedMimeType = mimeType;

      const recorder = new MediaRecorder(this.mixedStream, {
        mimeType,
        videoBitsPerSecond: 12000000, // 12 Mbps crystal-clear 1080p gaming clips
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const now = Date.now();
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

      const clipBlobs = validChunks.length > 0 ? validChunks : this.chunks.map((c) => c.blob);
      if (clipBlobs.length === 0) {
        return { success: false, error: 'No video frames buffered yet.' };
      }

      const mimeType = this.recordedMimeType || 'video/webm';
      const completeBlob = new Blob(clipBlobs, { type: mimeType });

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

    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.displayStream = null;
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
  }
}

export const videoClipper = new VideoClipper();
