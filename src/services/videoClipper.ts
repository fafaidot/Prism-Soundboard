/// <reference types="dom-webcodecs" />
/// <reference types="dom-mediacapture-transform" />

// High-performance Keyframe-Aligned In-Memory Ring Buffer Video Clipper (Medal / ShadowPlay Replay Buffer)
// Records 60fps screen video + system game audio + microphone using WebCodecs (VideoEncoder, AudioEncoder)
// Muxes with webm-muxer into pristine, seekable, non-corrupt WebM files starting strictly on an IDR Keyframe.
// Zero macroblocking, zero green/gray artifacts, zero repeating audio, zero CPU stutter.

import { audioEngine } from './audioEngine';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

export interface VideoClipperConfig {
  durationSeconds: number; // e.g. 15, 30, 45, 60
}

interface StoredVideoChunk {
  chunk: EncodedVideoChunk;
  metadata?: EncodedVideoChunkMetadata;
  timestamp: number; // in microseconds
  type: 'key' | 'delta';
}

interface StoredAudioChunk {
  chunk: EncodedAudioChunk;
  metadata?: EncodedAudioChunkMetadata;
  timestamp: number; // in microseconds
}

class VideoClipper {
  private screenStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;

  // WebCodecs Encoders & Track Processors
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private videoReader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private audioReader: ReadableStreamDefaultReader<AudioData> | null = null;

  // Keyframe-aligned circular in-memory buffer
  private videoChunks: StoredVideoChunk[] = [];
  private audioChunks: StoredAudioChunk[] = [];

  private isBuffering: boolean = false;
  private isExporting: boolean = false;
  private bufferDurationSeconds: number = 15;

  private captureWidth: number = 1920;
  private captureHeight: number = 1080;
  private captureFps: number = 60;

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
   * Initializes hardware-accelerated screen capture, mixes system sound + microphone,
   * and begins rolling circular memory buffer with WebCodecs
   */
  public async startBuffer(durationSeconds: number = 15): Promise<boolean> {
    if (this.isBuffering && this.videoEncoder && this.videoEncoder.state === 'configured') {
      this.bufferDurationSeconds = durationSeconds;
      return true;
    }

    // Clean previous session if any
    this.stopBuffer();

    try {
      this.bufferDurationSeconds = durationSeconds;
      this.videoChunks = [];
      this.audioChunks = [];

      let stream: MediaStream | null = null;

      // 1. First priority: Native Electron desktopCapturer screen capture via getUserMedia
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

      const settings = videoTrack.getSettings();
      this.captureWidth = settings.width || 1920;
      this.captureHeight = settings.height || 1080;
      this.captureFps = Math.min(settings.frameRate || 60, 60);

      this.isBuffering = true;

      // 3. Configure Hardware-Accelerated VideoEncoder
      this.videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
          this.onVideoChunk(chunk, metadata);
        },
        error: (err) => {
          console.error('[VideoClipper] VideoEncoder error:', err);
        },
      });

      this.videoEncoder.configure({
        codec: 'vp8',
        width: this.captureWidth,
        height: this.captureHeight,
        bitrate: 8_000_000, // 8 Mbps high-definition 60fps
        framerate: this.captureFps,
        latencyMode: 'realtime',
      });

      // 4. Start Video Frame Reader Pump
      const videoProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
      this.videoReader = videoProcessor.readable.getReader();
      let frameIndex = 0;
      const keyInterval = Math.max(30, Math.round(this.captureFps * 2)); // Keyframe every 2 seconds

      (async () => {
        while (this.isBuffering && this.videoReader) {
          try {
            const { done, value: videoFrame } = await this.videoReader.read();
            if (done || !videoFrame) break;
            if (this.videoEncoder && this.videoEncoder.state === 'configured') {
              const isKey = frameIndex % keyInterval === 0;
              this.videoEncoder.encode(videoFrame, { keyFrame: isKey });
              frameIndex++;
            }
            videoFrame.close();
          } catch (err) {
            break;
          }
        }
      })();

      // 5. Mix System Loopback Audio + Microphone into AudioEncoder
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: 48000 });
      this.audioContext = audioCtx;
      const audioDestination = audioCtx.createMediaStreamDestination();

      // System desktop audio from screen stream
      const sysTracks = stream.getAudioTracks();
      if (sysTracks.length > 0) {
        try {
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream([sysTracks[0]]));
          const sysGain = audioCtx.createGain();
          sysGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          sysSource.connect(sysGain);
          sysGain.connect(audioDestination);
        } catch (sysErr) {
          console.warn('[VideoClipper] System audio route error:', sysErr);
        }
      }

      // Physical microphone
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
        } catch (e) {}
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
          const micGain = audioCtx.createGain();
          micGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          micSource.connect(micGain);
          micGain.connect(audioDestination);
        } catch (micErr) {
          console.warn('[VideoClipper] Mic audio route error:', micErr);
        }
      }

      const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        try {
          const audioProcessor = new MediaStreamTrackProcessor({ track: mixedAudioTrack });
          this.audioReader = audioProcessor.readable.getReader();

          this.audioEncoder = new AudioEncoder({
            output: (chunk, metadata) => {
              this.onAudioChunk(chunk, metadata);
            },
            error: (err) => console.error('[VideoClipper] AudioEncoder error:', err),
          });

          this.audioEncoder.configure({
            codec: 'opus',
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 160000, // 160 kbps high-fidelity Opus
          });

          (async () => {
            while (this.isBuffering && this.audioReader) {
              try {
                const { done, value: audioData } = await this.audioReader.read();
                if (done || !audioData) break;
                if (this.audioEncoder && this.audioEncoder.state === 'configured') {
                  this.audioEncoder.encode(audioData);
                }
                audioData.close();
              } catch (err) {
                break;
              }
            }
          })();
        } catch (audioErr) {
          console.warn('[VideoClipper] Audio processor initialization error:', audioErr);
        }
      }

      console.log(`[VideoClipper] WebCodecs instant replay buffer active (${durationSeconds}s @ ${this.captureWidth}x${this.captureHeight} ${this.captureFps}fps)`);
      return true;
    } catch (err) {
      console.warn('[VideoClipper] Failed to start screen video buffer:', err);
      this.stopBuffer();
      return false;
    }
  }

  private onVideoChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) {
    this.videoChunks.push({
      chunk,
      metadata,
      timestamp: chunk.timestamp,
      type: chunk.type,
    });
    this.pruneBuffer();
  }

  private onAudioChunk(chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) {
    this.audioChunks.push({
      chunk,
      metadata,
      timestamp: chunk.timestamp,
    });
  }

  /**
   * Prunes chunks older than buffer duration + 3s margin, strictly ensuring the buffer starts on an IDR Keyframe
   */
  private pruneBuffer() {
    if (this.videoChunks.length === 0) return;
    const latestTs = this.videoChunks[this.videoChunks.length - 1].timestamp;
    const cutoffTs = latestTs - (this.bufferDurationSeconds + 3) * 1_000_000;

    let pruneIndex = -1;
    for (let i = 0; i < this.videoChunks.length; i++) {
      if (this.videoChunks[i].timestamp < cutoffTs && this.videoChunks[i].type === 'key') {
        pruneIndex = i;
      }
      if (this.videoChunks[i].timestamp >= cutoffTs) {
        break;
      }
    }

    if (pruneIndex > 0) {
      this.videoChunks.splice(0, pruneIndex);
      // Prune audio chunks older than the earliest kept video keyframe
      const oldestVideoTs = this.videoChunks[0].timestamp;
      let audioCut = 0;
      while (audioCut < this.audioChunks.length && this.audioChunks[audioCut].timestamp < oldestVideoTs) {
        audioCut++;
      }
      if (audioCut > 0) {
        this.audioChunks.splice(0, audioCut);
      }
    }
  }

  /**
   * Clips the last N seconds, muxing strictly from an IDR Keyframe so there are zero macroblocks or audio skips
   */
  public async clipLastSeconds(title?: string): Promise<{ success: boolean; clip?: any; error?: string }> {
    if (this.isExporting) {
      return { success: false, error: 'Clip export already in progress.' };
    }

    // If buffer wasn't started, attempt to start it now
    if (!this.isBuffering || this.videoChunks.length === 0) {
      const started = await this.startBuffer(this.bufferDurationSeconds);
      if (!started) {
        return { success: false, error: 'Screen capture permission not granted or cancelled.' };
      }
      return { success: false, error: 'Screen recorder initialized. Buffer is filling now, press again in a few seconds!' };
    }

    try {
      this.isExporting = true;
      const latestTs = this.videoChunks[this.videoChunks.length - 1].timestamp;
      const targetStartTs = latestTs - (this.bufferDurationSeconds * 1_000_000);

      // Find the keyframe closest to or before targetStartTs
      let keyframeIndex = -1;
      for (let i = this.videoChunks.length - 1; i >= 0; i--) {
        if (this.videoChunks[i].type === 'key') {
          keyframeIndex = i;
          if (this.videoChunks[i].timestamp <= targetStartTs) {
            break;
          }
        }
      }

      if (keyframeIndex === -1) {
        keyframeIndex = this.videoChunks.findIndex((v) => v.type === 'key');
      }

      if (keyframeIndex === -1) {
        return { success: false, error: 'No video keyframes buffered yet. Wait 2 seconds and try again.' };
      }

      // Slice strictly from the IDR Keyframe!
      const videoToMux = this.videoChunks.slice(keyframeIndex);
      const startTs = videoToMux[0].timestamp;
      const audioToMux = this.audioChunks.filter((a) => a.timestamp >= startTs);

      const target = new ArrayBufferTarget();
      const hasAudio = audioToMux.length > 0;

      const muxer = new Muxer({
        target,
        video: {
          codec: 'V_VP8',
          width: this.captureWidth,
          height: this.captureHeight,
          frameRate: this.captureFps,
        },
        ...(hasAudio
          ? {
              audio: {
                codec: 'A_OPUS',
                sampleRate: 48000,
                numberOfChannels: 2,
              },
            }
          : {}),
        firstTimestampBehavior: 'strict',
      });

      // Interleave video and audio packets strictly in monotonic timestamp order
      type MuxItem =
        | { kind: 'video'; chunk: EncodedVideoChunk; metadata?: EncodedVideoChunkMetadata; timestamp: number }
        | { kind: 'audio'; chunk: EncodedAudioChunk; metadata?: EncodedAudioChunkMetadata; timestamp: number };

      const items: MuxItem[] = [
        ...videoToMux.map((v) => ({
          kind: 'video' as const,
          chunk: v.chunk,
          metadata: v.metadata,
          timestamp: Math.max(0, v.timestamp - startTs),
        })),
        ...audioToMux.map((a) => ({
          kind: 'audio' as const,
          chunk: a.chunk,
          metadata: a.metadata,
          timestamp: Math.max(0, a.timestamp - startTs),
        })),
      ];

      items.sort((a, b) => a.timestamp - b.timestamp);

      for (const item of items) {
        if (item.kind === 'video') {
          muxer.addVideoChunk(item.chunk, item.metadata, item.timestamp);
        } else {
          muxer.addAudioChunk(item.chunk, item.metadata, item.timestamp);
        }
      }

      muxer.finalize();
      const finalBuffer = target.buffer;

      if (!finalBuffer || finalBuffer.byteLength === 0) {
        return { success: false, error: 'Failed to generate video file.' };
      }

      // Convert ArrayBuffer to Base64 Data URL
      const blob = new Blob([finalBuffer], { type: 'video/webm' });
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
        reader.readAsDataURL(blob);
      });

      const actualDuration = (videoToMux[videoToMux.length - 1].timestamp - startTs) / 1_000_000;
      const clipTitle = title || `Clip ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

      if (window.soundboardAPI?.saveRecordedVideoClip) {
        const savedClip = await window.soundboardAPI.saveRecordedVideoClip({
          base64: dataUrl,
          duration: Math.round(actualDuration * 10) / 10,
          title: clipTitle,
          width: this.captureWidth,
          height: this.captureHeight,
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
   * Stops recording and releases all display/audio tracks and encoders
   */
  public stopBuffer() {
    this.isBuffering = false;

    if (this.videoReader) {
      try {
        this.videoReader.cancel().catch(() => {});
      } catch (e) {}
      this.videoReader = null;
    }

    if (this.audioReader) {
      try {
        this.audioReader.cancel().catch(() => {});
      } catch (e) {}
      this.audioReader = null;
    }

    if (this.videoEncoder && this.videoEncoder.state !== 'closed') {
      try {
        this.videoEncoder.close();
      } catch (e) {}
      this.videoEncoder = null;
    }

    if (this.audioEncoder && this.audioEncoder.state !== 'closed') {
      try {
        this.audioEncoder.close();
      } catch (e) {}
      this.audioEncoder = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.screenStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    this.videoChunks = [];
    this.audioChunks = [];
  }
}

export const videoClipper = new VideoClipper();
