import { SoundItem, AudioSettings } from '../types';

interface ActivePlayback {
  soundId: string;
  audioEl: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  soundGainNode: GainNode;
  toHeadphonesGain: GainNode;
  toCableGain: GainNode;
  startTime: number;
  trimStart?: number;
  trimEnd?: number;
  muteVoice?: boolean;
  isPaused?: boolean;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private activePlaybacks: Map<string, ActivePlayback[]> = new Map();
  private settings: AudioSettings = {
    inputDeviceId: '',
    primaryDeviceId: 'default',
    secondaryDeviceId: '',
    isSecondaryEnabled: true,
    isMicPassThroughEnabled: true,
    hearMyself: false,
    masterSpeakerVolume: 100,
    masterMicVolume: 100,
    micInputVolume: 100,
    isNoiseGateEnabled: false,
    noiseGateThreshold: -39,
    panicHotkey: 'Escape',
    overlayHotkey: 'F8',
    recordHotkey: 'F9',
    recordDuration: 5,
    recordSource: 'all',
    theme: 'dark',
    accentColor: '#38bdf8',
    minimizeToTray: true,
  };

  // Live Physical Microphone Source & Gain
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private noiseGateGainNode: GainNode | null = null;
  private micMasterGain: GainNode | null = null;
  private rawMicAnalyserNode: AnalyserNode | null = null;
  private postGateAnalyserNode: AnalyserNode | null = null;
  private currentRawDb: number = -100;
  private isGateOpen: boolean = true;

  // Headphone Monitor (Hear Myself directly into ctx.destination)
  private monitorGainNode: GainNode | null = null;

  // Public accessor for real physical mic MediaStream for mixed video clipping
  public getMicrophoneStream(): MediaStream | null {
    return this.micStream;
  }

  // Master Gain for all Soundboard clips (Affects sounds only, real-time live volume scaling)
  private soundsMasterGainNode: GainNode | null = null;

  // Unified Virtual Cable Mix Destination (Physical Voice + Soundboard Sounds)
  private cableMixDestination: MediaStreamAudioDestinationNode | null = null;
  private voiceToCableGain: GainNode | null = null;

  // Continuous Rolling Circular Buffer for Clipping the Last N Seconds (Microphone & Computer Sounds)
  private bufferSampleRate: number = 48000;
  private maxRollingSeconds: number = 65;
  private clipWorkletNode: AudioWorkletNode | null = null;
  private clipProcessorNode: ScriptProcessorNode | null = null;
  private clipMixGainNode: GainNode | null = null;
  private systemDesktopStream: MediaStream | null = null;
  private systemDesktopSourceNode: MediaStreamAudioSourceNode | null = null;
  private pendingClipRequests: Map<string, (data: { samples: Float32Array; sampleRate: number; duration: number; channels?: number }) => void> = new Map();
  private fallbackRollingBuffer: Float32Array = new Float32Array(48000 * 15 * 2); // Stereo interleaved
  private fallbackWriteIndex: number = 0;
  private fallbackTotalWritten: number = 0;
  private clipSetupPromise: Promise<void> | null = null;
  private clipSetupQueued: boolean = false;

  // Dedicated AudioContext routed exclusively to CABLE Input hardware sink (Zero DOM audio element, zero headphone leak!)
  private cableCtx: AudioContext | null = null;
  private cableVoiceSourceNode: MediaStreamAudioSourceNode | null = null;
  private cableVoiceGainNode: GainNode | null = null;
  private cableSoundSourceNode: MediaStreamAudioSourceNode | null = null;
  private cableSoundGainNode: GainNode | null = null;

  private onStateChangeListeners: Set<() => void> = new Set();
  private onMicLevelListeners: Set<(level: number) => void> = new Set();
  private isVoiceMutedBySound = false;
  private micMeterLoopActive = false;
  private isInitialized = false;
  private currentMicLevel = 0;
  public isLoopbackPrevented = false;

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(console.warn);
    }
    return this.ctx;
  }

  public async ensureDeviceLabelsUnlocked(): Promise<MediaDeviceInfo[]> {
    let devs = await navigator.mediaDevices.enumerateDevices();
    if (!devs.some((d) => d.label)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        devs = await navigator.mediaDevices.enumerateDevices();
      } catch (e) {
        console.warn('getUserMedia prompt failed in ensureDeviceLabelsUnlocked:', e);
      }
    }
    return devs;
  }

  // Find dedicated hardware sink for CABLE Input (EXCLUDES 'default' so it never plays into physical speakers!)
  public async findCableInputDeviceId(): Promise<string> {
    try {
      const devs = await this.ensureDeviceLabelsUnlocked();
      // MUST exclude 'default' and 'communications' to prevent routing into physical speakers!
      const outputs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      
      const found =
        outputs.find((d) => d.label.toLowerCase().includes('cable input')) ||
        outputs.find((d) => d.label.toLowerCase().includes('vb-audio') && d.label.toLowerCase().includes('cable')) ||
        outputs.find((d) => d.label.toLowerCase().includes('voicemod')) ||
        outputs.find((d) => d.label.toLowerCase().includes('vb-audio'));

      return found ? found.deviceId : '';
    } catch (e) {
      return '';
    }
  }

  // Find dedicated physical hardware microphone (EXCLUDES virtual devices so loopback never occurs)
  public async findRealPhysicalMicId(): Promise<string> {
    try {
      const devs = await this.ensureDeviceLabelsUnlocked();
      const inputs = devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const physicalMics = inputs.filter((d) => {
        const l = d.label.toLowerCase();
        return !l.includes('cable') && !l.includes('vb-audio') && !l.includes('voicemod') && !l.includes('stereo mix');
      });
      const preferred = physicalMics.find((d) => d.label.toLowerCase().includes('hyperx') || d.label.toLowerCase().includes('solocast') || d.label.toLowerCase().includes('usb'));
      if (preferred) return preferred.deviceId;
      if (physicalMics.length > 0) return physicalMics[0].deviceId;
      return '';
    } catch (e) {
      return '';
    }
  }

  // Find dedicated physical headphones / speakers (EXCLUDES virtual cable)
  public async findPhysicalSpeakerId(): Promise<string> {
    try {
      const devs = await this.ensureDeviceLabelsUnlocked();
      const outputs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const physicalOutputs = outputs.filter((d) => {
        const l = d.label.toLowerCase();
        return !l.includes('cable') && !l.includes('vb-audio') && !l.includes('voicemod');
      });
      const preferred = physicalOutputs.find((d) => d.label.toLowerCase().includes('headset') || d.label.toLowerCase().includes('hyperx'));
      if (preferred) return preferred.deviceId;
      if (physicalOutputs.length > 0) return physicalOutputs[0].deviceId;
      return 'default';
    } catch (e) {
      return 'default';
    }
  }

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(console.warn);
      }

      const unlock = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(console.warn);
        }
      };
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });

      // Clean up any stray DOM audio elements from prior sessions
      try {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.srcObject) {
            el.pause();
            el.srcObject = null;
            el.remove();
          }
        });
      } catch (e) {}

      // 1. Force Chromium to unlock real hardware device labels
      await this.ensureDeviceLabelsUnlocked();

      // 2. Auto-detect real physical hardware microphone and dedicated CABLE Input
      const realMic = await this.findRealPhysicalMicId();
      if (realMic) {
        this.settings.inputDeviceId = realMic;
      }

      const cableId = await this.findCableInputDeviceId();
      if (cableId) {
        this.settings.secondaryDeviceId = cableId;
      }

      const realSpeaker = await this.findPhysicalSpeakerId();
      if (realSpeaker && (!this.settings.primaryDeviceId || this.settings.primaryDeviceId === 'default')) {
        this.settings.primaryDeviceId = realSpeaker;
      }

      await this.setupAudioGraph();
      this.startMicMeterLoop();
    } catch (e) {
      console.warn('AudioEngine init notice:', e);
    }
  }

  public async updateSettings(newSettings: AudioSettings) {
    const prevInput = this.settings.inputDeviceId;
    const prevPrimary = this.settings.primaryDeviceId;
    const prevRecordSource = this.settings.recordSource ?? 'screen';
    const prevHearMyself = this.settings.hearMyself;
    const prevMicVol = this.settings.micInputVolume;
    const prevSpkVol = this.settings.masterSpeakerVolume;

    this.settings = {
      ...this.settings,
      ...newSettings,
      recordSource: newSettings.recordSource ?? this.settings.recordSource ?? 'screen',
    };

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(console.warn);
    }

    // Set physical headphone sink on ctx (never set invalid 'communications' or 'default')
    if (this.settings.primaryDeviceId && this.settings.primaryDeviceId !== 'default' && this.settings.primaryDeviceId !== 'communications' && 'setSinkId' in ctx) {
      (ctx as any).setSinkId(this.settings.primaryDeviceId).catch(console.warn);
    }

    // 1. Live Voice Input Volume
    if (prevMicVol !== this.settings.micInputVolume) {
      this.setMicInputVolume(this.settings.micInputVolume ?? 100);
    }

    // 2. Live Hear Myself Toggle
    if (this.monitorGainNode && (prevHearMyself !== this.settings.hearMyself || prevMicVol !== this.settings.micInputVolume)) {
      const isHearMyself = Boolean(this.settings.hearMyself);
      const vol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
      this.monitorGainNode.gain.setValueAtTime(isHearMyself ? vol : 0.0, ctx.currentTime);
    }

    // 3. Live Master Volumes
    if (prevSpkVol !== this.settings.masterSpeakerVolume) {
      this.setMasterSpeakerVolume(this.settings.masterSpeakerVolume ?? 100);
      this.setMasterMicVolume(this.settings.masterMicVolume ?? 100);
    }

    const needsGraphSetup = !this.micStream || (newSettings.inputDeviceId && prevInput !== newSettings.inputDeviceId) || (newSettings.primaryDeviceId && prevPrimary !== newSettings.primaryDeviceId);
    if (needsGraphSetup) {
      await this.ensureDeviceLabelsUnlocked();
      const cableId = await this.findCableInputDeviceId();
      if (cableId) {
        this.settings.secondaryDeviceId = cableId;
      }
      await this.setupAudioGraph();
    } else if (prevRecordSource !== this.settings.recordSource) {
      await this.rebuildClipBuffer(ctx);
    }
  }

  // Live Sound Volume Control (Immediate real-time adjustment while playing!)
  public setSoundVolume(soundId: string, volume: number) {
    const playbacks = this.activePlaybacks.get(soundId);
    if (!playbacks || !this.ctx) return;
    const gainVal = Math.max(0, Math.min(2.0, volume / 100));
    playbacks.forEach((p) => {
      try {
        p.soundGainNode.gain.setValueAtTime(gainVal, this.ctx!.currentTime);
      } catch (e) {}
    });
  }

  // Live Sound Speed / Playback Rate Control (Immediate real-time adjustment while playing!)
  public setSoundSpeed(soundId: string, speed: number) {
    const playbacks = this.activePlaybacks.get(soundId);
    if (!playbacks) return;
    const clampedSpeed = Math.max(0.25, Math.min(2.0, speed));
    playbacks.forEach((p) => {
      try {
        if (p.audioEl) {
          p.audioEl.playbackRate = clampedSpeed;
        }
      } catch (e) {}
    });
  }

  // Live Master Speaker & Mic Projection Sounds Volume Control (Affects SOUNDS ONLY, real-time live adjustment)
  public setMasterSpeakerVolume(volume: number) {
    this.settings.masterSpeakerVolume = volume;
    this.settings.masterMicVolume = volume;
    if (!this.ctx) return;
    const targetGain = Math.max(0, Math.min(1.0, volume / 100));
    if (this.soundsMasterGainNode) {
      try {
        this.soundsMasterGainNode.gain.setValueAtTime(targetGain, this.ctx.currentTime);
      } catch (e) {}
    }
    this.activePlaybacks.forEach((playbacks) => {
      playbacks.forEach((p) => {
        try {
          p.toHeadphonesGain.gain.setValueAtTime(targetGain, this.ctx!.currentTime);
          p.toCableGain.gain.setValueAtTime(targetGain, this.ctx!.currentTime);
        } catch (e) {}
      });
    });
  }

  // Live Master Virtual Mic Volume Control
  public setMasterMicVolume(volume: number) {
    this.settings.masterMicVolume = volume;
    if (!this.ctx) return;
    const targetGain = Math.max(0, Math.min(1.0, volume / 100));
    this.activePlaybacks.forEach((playbacks) => {
      playbacks.forEach((p) => {
        try {
          p.toCableGain.gain.setValueAtTime(targetGain, this.ctx!.currentTime);
        } catch (e) {}
      });
    });
  }

  // Live Physical Voice Volume (scales both virtual projection & "Hear Myself" headphone monitor in real-time)
  public setMicInputVolume(volume: number) {
    this.settings.micInputVolume = volume;
    if (!this.ctx) return;
    const vol = Math.max(0, Math.min(2.0, volume / 100));

    // A) Voice into Virtual Cable (Discord/Games)
    const shouldVoicePass = !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
    if (this.voiceToCableGain) {
      this.voiceToCableGain.gain.setValueAtTime(shouldVoicePass ? vol : 0.0, this.ctx.currentTime);
    }
    if (this.cableVoiceGainNode && this.cableCtx) {
      this.cableVoiceGainNode.gain.setValueAtTime(shouldVoicePass ? vol : 0.0, this.cableCtx.currentTime);
    }

    // B) Headphone Monitor (Hear Myself -> ONLY audible when hearMyself is ON!)
    if (this.monitorGainNode) {
      const isHearMyself = Boolean(this.settings.hearMyself);
      this.monitorGainNode.gain.setValueAtTime(isHearMyself ? vol : 0.0, this.ctx.currentTime);
    }

    // C) Master Gain stays at unity so VU Analyser always measures accurate microphone levels
    if (this.micMasterGain) {
      this.micMasterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    }
  }

  private isInitializingGraph = false;

  public async setupAudioGraph() {
    if (this.isInitializingGraph) return;
    this.isInitializingGraph = true;
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(console.warn);
      }

      // Clean up any stray DOM audio elements
      try {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.srcObject) {
            el.pause();
            el.srcObject = null;
            el.remove();
          }
        });
      } catch (e) {}

      // 1. Force real hardware device labels to be unlocked first
      const devs = await this.ensureDeviceLabelsUnlocked();

      // 2. Setup Headphone Sink on ctx (Your physical speakers/headphones)
      const realSpeakerId = await this.findPhysicalSpeakerId();
      let targetSpeakerId = this.settings.primaryDeviceId;
      const curSpeaker = devs.find((d) => d.deviceId === targetSpeakerId && d.kind === 'audiooutput');
      if (
        !targetSpeakerId ||
        targetSpeakerId === 'default' ||
        targetSpeakerId === 'communications' ||
        !curSpeaker ||
        curSpeaker.label.toLowerCase().includes('cable') ||
        curSpeaker.label.toLowerCase().includes('voicemod')
      ) {
        if (realSpeakerId && realSpeakerId !== 'default') {
          targetSpeakerId = realSpeakerId;
          this.settings.primaryDeviceId = realSpeakerId;
        }
      }

      if (targetSpeakerId && targetSpeakerId !== 'default' && targetSpeakerId !== 'communications' && 'setSinkId' in ctx) {
        (ctx as any).setSinkId(targetSpeakerId).catch(console.warn);
      }

      // 3. Setup Unified Virtual Cable Mix Destination in Primary Context (Voice + Soundboard clips)
      if (!this.cableMixDestination) {
        this.cableMixDestination = ctx.createMediaStreamDestination();
      }

      // 4. Setup Dedicated Virtual Cable AudioContext (Guaranteed hardware sink lock to CABLE Input, NEVER default headphones!)
      let cableDeviceId = await this.findCableInputDeviceId();
      if (cableDeviceId) {
        this.settings.secondaryDeviceId = cableDeviceId;

        if (!this.cableCtx) {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          this.cableCtx = new AudioCtxClass({ latencyHint: 'interactive' });
        }

        if (this.cableCtx.state === 'suspended') {
          await this.cableCtx.resume().catch(console.warn);
        }

        if ('setSinkId' in this.cableCtx) {
          try {
            await (this.cableCtx as any).setSinkId(cableDeviceId);
          } catch (e) {
            console.warn('[Prism Audio Engine] cableCtx setSinkId error:', e);
          }
        }

        // STRICT SINK VERIFICATION:
        // Only pipe audio if cableCtx.sinkId is actively locked to cableDeviceId.
        // This guarantees that audio NEVER plays out of headphones!
        const activeSink = (this.cableCtx as any).sinkId;
        if (activeSink === cableDeviceId) {
          if (!this.cableSoundSourceNode && this.cableMixDestination) {
            this.cableSoundSourceNode = this.cableCtx.createMediaStreamSource(this.cableMixDestination.stream);
            this.cableSoundGainNode = this.cableCtx.createGain();
            this.cableSoundGainNode.gain.setValueAtTime(1.0, this.cableCtx.currentTime);
            this.cableSoundSourceNode.connect(this.cableSoundGainNode);
            this.cableSoundGainNode.connect(this.cableCtx.destination);
          }
          console.log('[Prism Audio Engine] Dedicated Virtual Cable context connected directly to CABLE Input:', cableDeviceId);
        } else {
          console.warn('[Prism Audio Engine] cableCtx sink mismatch. Suspending to prevent headphone bleed:', activeSink);
          if (this.cableCtx.state === 'running') {
            await this.cableCtx.suspend().catch(console.warn);
          }
        }
      } else {
        console.warn('[Prism Audio Engine] Virtual CABLE Input not detected. Virtual cable context suspended.');
        if (this.cableCtx && this.cableCtx.state === 'running') {
          await this.cableCtx.suspend().catch(console.warn);
        }
      }

      // 5. Setup Master Voice Nodes & Real-time Noise Gate
      if (!this.noiseGateGainNode) {
        this.noiseGateGainNode = ctx.createGain();
      }
      this.noiseGateGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

      if (!this.micMasterGain) {
        this.micMasterGain = ctx.createGain();
      }
      this.micMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);

      if (!this.rawMicAnalyserNode) {
        this.rawMicAnalyserNode = ctx.createAnalyser();
        this.rawMicAnalyserNode.fftSize = 128;
        this.rawMicAnalyserNode.smoothingTimeConstant = 0.2;
      }

      if (!this.postGateAnalyserNode) {
        this.postGateAnalyserNode = ctx.createAnalyser();
        this.postGateAnalyserNode.fftSize = 128;
        this.postGateAnalyserNode.smoothingTimeConstant = 0.3;
      }

      // Monitor Gain Node (Physical Voice to Headphones -> Audible ONLY when Hear Myself is ON!)
      if (!this.monitorGainNode) {
        this.monitorGainNode = ctx.createGain();
        this.monitorGainNode.connect(ctx.destination);
      }
      const isHearMyself = Boolean(this.settings.hearMyself);
      const monitorVol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
      this.monitorGainNode.gain.setValueAtTime(isHearMyself ? monitorVol : 0.0, ctx.currentTime);

      // Voice-to-Cable Gain Node (Physical Voice into Virtual Cable mix for Discord/Games)
      if (!this.voiceToCableGain) {
        this.voiceToCableGain = ctx.createGain();
        this.voiceToCableGain.connect(this.cableMixDestination);
      }
      const projectionVol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
      const shouldVoicePass = this.settings.isMicPassThroughEnabled && !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
      this.voiceToCableGain.gain.setValueAtTime(shouldVoicePass ? projectionVol : 0.0, ctx.currentTime);

      // 6. Acquire Physical Hardware Microphone Stream (Strictly real hardware, never virtual CABLE Output)
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
      if (this.micSourceNode) {
        try {
          this.micSourceNode.disconnect();
        } catch (e) {}
        this.micSourceNode = null;
      }

      let targetMicId = this.settings.inputDeviceId;
      const realHardwareMicId = await this.findRealPhysicalMicId();
      const curMicDev = devs.find((d) => d.deviceId === targetMicId && d.kind === 'audioinput');

      // If targetMicId is invalid, stale, 'default', or points to a virtual cable, force use of real hardware mic
      if (
        !targetMicId ||
        targetMicId === 'default' ||
        targetMicId === 'communications' ||
        !curMicDev ||
        curMicDev.label.toLowerCase().includes('cable') ||
        curMicDev.label.toLowerCase().includes('voicemod') ||
        curMicDev.label.toLowerCase().includes('stereo mix')
      ) {
        if (realHardwareMicId) {
          targetMicId = realHardwareMicId;
          this.settings.inputDeviceId = realHardwareMicId;
        }
      }

      let stream: MediaStream | null = null;
      if (targetMicId && targetMicId !== 'default' && targetMicId !== 'communications') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: targetMicId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            },
            video: false,
          });
        } catch (err) {
          console.warn('[Prism Audio Engine] Could not acquire exact mic, falling back to real hardware mic:', err);
        }
      }

      if (!stream && realHardwareMicId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: realHardwareMicId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            },
            video: false,
          });
        } catch (err) {}
      }

      if (!stream) {
        console.warn('[Prism Audio Engine] No physical mic stream acquired. Screen-only clipping remains active.');
        await this.rebuildClipBuffer(ctx);
        return;
      }

      this.micStream = stream;

      // Anti-Loop Protection
      const tracks = stream.getAudioTracks();
      const trackLabel = (tracks[0]?.label || '').toLowerCase();
      if (
        trackLabel.includes('cable') ||
        trackLabel.includes('vb-audio') ||
        trackLabel.includes('voicemod') ||
        trackLabel.includes('stereo mix')
      ) {
        console.warn('[Prism Audio Engine] Anti-loop: Physical mic is a virtual device. Voice-to-cable link muted.');
        this.isLoopbackPrevented = true;
        this.voiceToCableGain.gain.setValueAtTime(0, ctx.currentTime);
      } else {
        this.isLoopbackPrevented = false;
        const vol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
        this.voiceToCableGain.gain.setValueAtTime(this.settings.isMicPassThroughEnabled ? vol : 0.0, ctx.currentTime);
      }

      // 7. Connect Physical Mic into Web Audio Graph
      this.micSourceNode = ctx.createMediaStreamSource(this.micStream);

      // Raw mic level connects to Raw Analyser (measures raw mic dB for Noise Gate calibration & Live Signal)
      if (this.rawMicAnalyserNode) {
        this.micSourceNode.connect(this.rawMicAnalyserNode);
      }

      // Mic routes through Noise Gate Gain Node into micMasterGain
      if (this.noiseGateGainNode) {
        this.micSourceNode.connect(this.noiseGateGainNode);
        this.noiseGateGainNode.connect(this.micMasterGain);
      } else {
        this.micSourceNode.connect(this.micMasterGain);
      }

      // Post-Gate Analyser: measures gated audio so visualizer and mic level cut when noise gate closes!
      if (this.postGateAnalyserNode) {
        this.micMasterGain.connect(this.postGateAnalyserNode);
      }

      // Mic Master Gain routes to:
      // a) Headphone Monitor (Hear Myself -> ONLY audible when hearMyself is ON!)
      this.micMasterGain.connect(this.monitorGainNode);
      // b) Virtual Cable Output (Physical Voice to Discord/Games -> NOT to headphones!)
      this.micMasterGain.connect(this.voiceToCableGain);

      // c) Continuous Rolling Buffer for Clipping the Last 3s/5s/10s etc. (Zero Soundboard Bleed)
      await this.rebuildClipBuffer(ctx);

      // 8. Connect Physical Mic DIRECTLY into Dedicated CABLE Input AudioContext
      if (this.cableCtx && (this.cableCtx as any).sinkId === cableDeviceId) {
        if (this.cableVoiceSourceNode) {
          try {
            this.cableVoiceSourceNode.disconnect();
          } catch (e) {}
          this.cableVoiceSourceNode = null;
        }
        try {
          this.cableVoiceSourceNode = this.cableCtx.createMediaStreamSource(this.micStream);
          this.cableVoiceGainNode = this.cableCtx.createGain();
          const shouldPass = !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
          const vol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
          this.cableVoiceGainNode.gain.setValueAtTime(shouldPass ? vol : 0.0, this.cableCtx.currentTime);
          this.cableVoiceSourceNode.connect(this.cableVoiceGainNode);
          this.cableVoiceGainNode.connect(this.cableCtx.destination);
          console.log('[Prism Audio Engine] Physical Mic voice piped directly to CABLE Input hardware sink!');
        } catch (e) {
          console.warn('[Prism Audio Engine] Error connecting mic directly to cableCtx:', e);
        }
      }

      this.startMicMeterLoop();
      console.log('[Prism Audio Engine] Physical Mic linked to hardware:', trackLabel || 'Microphone');
    } catch (err) {
      console.error('[Prism Audio Engine] Setup Error:', err);
    } finally {
      this.isInitializingGraph = false;
    }
  }

  private startMicMeterLoop() {
    if (this.micMeterLoopActive) return;
    this.micMeterLoopActive = true;

    const rawData = new Uint8Array(64);
    const postData = new Uint8Array(64);

    const checkLevel = () => {
      // 1. Measure RAW physical microphone signal (dB) for Noise Gate threshold comparison
      if (this.rawMicAnalyserNode) {
        this.rawMicAnalyserNode.getByteTimeDomainData(rawData);
        let sumSquares = 0;
        for (let i = 0; i < rawData.length; i++) {
          const norm = (rawData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / rawData.length);
        const currentDb = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
        this.currentRawDb = Math.max(-100, Math.min(0, currentDb));

        // Process Real-time Noise Gate
        if (this.ctx) {
          if (this.settings.isNoiseGateEnabled) {
            const threshold = this.settings.noiseGateThreshold ?? -39;
            const gateOpen = currentDb >= threshold;
            this.isGateOpen = gateOpen;

            // Fast attack 15ms, smooth natural release decay 180ms
            const targetGain = gateOpen ? 1.0 : 0.0;
            const timeConstant = gateOpen ? 0.015 : 0.18;
            if (this.noiseGateGainNode) {
              this.noiseGateGainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, timeConstant);
            }

            if (this.cableVoiceGainNode && this.cableCtx) {
              const shouldPass = !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
              const baseVol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
              const targetVol = shouldPass ? (gateOpen ? baseVol : 0.0) : 0.0;
              this.cableVoiceGainNode.gain.setTargetAtTime(targetVol, this.cableCtx.currentTime, timeConstant);
            }
          } else {
            this.isGateOpen = true;
            if (this.noiseGateGainNode) {
              this.noiseGateGainNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01);
            }
            if (this.cableVoiceGainNode && this.cableCtx) {
              const shouldPass = !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
              const baseVol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));
              this.cableVoiceGainNode.gain.setTargetAtTime(shouldPass ? baseVol : 0.0, this.cableCtx.currentTime, 0.01);
            }
          }
        }
      }

      // 2. Measure POST-GATE audio: if Noise Gate is active and closed, mic level is 0!
      if (this.postGateAnalyserNode) {
        this.postGateAnalyserNode.getByteTimeDomainData(postData);
        let sumSquares = 0;
        for (let i = 0; i < postData.length; i++) {
          const norm = (postData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / postData.length);
        const level = Math.min(100, Math.round(Math.pow(rms, 0.6) * 160));
        this.currentMicLevel = level;

        if (this.onMicLevelListeners.size > 0) {
          this.onMicLevelListeners.forEach((fn) => fn(level));
        }
      }

      requestAnimationFrame(checkLevel);
    };

    requestAnimationFrame(checkLevel);
  }

  public getRawMicDb(): number {
    return this.currentRawDb;
  }

  public getIsGateOpen(): boolean {
    return this.isGateOpen;
  }

  public setNoiseGateEnabled(enabled: boolean) {
    this.settings.isNoiseGateEnabled = enabled;
  }

  public setNoiseGateThreshold(thresholdDb: number) {
    this.settings.noiseGateThreshold = thresholdDb;
  }

  public onMicLevel(listener: (level: number) => void) {
    this.onMicLevelListeners.add(listener);
    return () => this.onMicLevelListeners.delete(listener);
  }

  public getMicLevel(): number {
    return this.currentMicLevel;
  }

  // Real-time frequency spectrum data from POST-GATE microphone (cuts voice when noise gate closes!)
  public getMicFrequencyData(outputArray: any): void {
    if (this.postGateAnalyserNode) {
      this.postGateAnalyserNode.getByteFrequencyData(outputArray);
    } else if (this.rawMicAnalyserNode) {
      this.rawMicAnalyserNode.getByteFrequencyData(outputArray);
    }
  }

  // Real-time waveform oscilloscope data from POST-GATE microphone
  public getMicWaveformData(outputArray: any): void {
    if (this.postGateAnalyserNode) {
      this.postGateAnalyserNode.getByteTimeDomainData(outputArray);
    } else if (this.rawMicAnalyserNode) {
      this.rawMicAnalyserNode.getByteTimeDomainData(outputArray);
    }
  }

  public subscribe(listener: () => void) {
    this.onStateChangeListeners.add(listener);
    return () => this.onStateChangeListeners.delete(listener);
  }

  private notify() {
    this.onStateChangeListeners.forEach((l) => l());
  }

  public isPlaying(soundId: string): boolean {
    const list = this.activePlaybacks.get(soundId);
    if (!list || list.length === 0) return false;
    return list.some((p) => !p.isPaused && p.audioEl && !p.audioEl.ended);
  }

  public getActiveSoundIds(): string[] {
    const ids: string[] = [];
    this.activePlaybacks.forEach((list, id) => {
      // Return sounds that are currently playing OR paused (not stopped)
      const isStillLoaded = list.some((p) => p.audioEl && !p.audioEl.ended && p.audioEl.src !== '');
      if (isStillLoaded) {
        ids.push(id);
      }
    });
    return ids;
  }

  public getPausedSoundIds(): string[] {
    const ids: string[] = [];
    this.activePlaybacks.forEach((list, id) => {
      if (list && list.length > 0 && list.every((p) => p.isPaused || (p.audioEl && p.audioEl.paused))) {
        ids.push(id);
      }
    });
    return ids;
  }

  public stopAll() {
    this.activePlaybacks.forEach((playbacks) => {
      playbacks.forEach((p) => {
        try {
          p.audioEl.pause();
          p.audioEl.currentTime = 0;
          p.audioEl.src = '';
          p.audioEl.load();
        } catch (e) {}
        try {
          p.sourceNode.disconnect();
          p.soundGainNode.disconnect();
          p.toHeadphonesGain.disconnect();
          p.toCableGain.disconnect();
        } catch (e) {}
      });
    });
    this.activePlaybacks.clear();

    // Also stop any other audio elements across the document
    try {
      document.querySelectorAll('audio').forEach((el) => {
        try {
          el.pause();
          el.currentTime = 0;
        } catch (e) {}
      });
    } catch (e) {}

    this.checkVoiceMuteState();
    this.notify();
  }

  public getPlaybackProgress(soundId: string): number {
    const list = this.activePlaybacks.get(soundId);
    if (!list || list.length === 0) return 0;
    // For overlapping instances, use the latest active instance
    const p = list[list.length - 1];
    if (!p.audioEl) return 0;
    const duration = p.audioEl.duration;
    if (!duration || duration <= 0) return 0;

    const start = p.trimStart && p.trimStart > 0 ? p.trimStart : 0;
    const end = p.trimEnd && p.trimEnd > start ? Math.min(p.trimEnd, duration) : duration;
    const span = end - start;
    if (span <= 0) return 0;

    const cur = Math.max(start, Math.min(end, p.audioEl.currentTime));
    return Math.min(1, Math.max(0, (cur - start) / span));
  }

  public getAllPlaybackProgress(): Record<string, number> {
    const progressMap: Record<string, number> = {};
    this.activePlaybacks.forEach((list, id) => {
      if (list && list.length > 0) {
        // Track the latest active instance for overlapping sounds
        const p = list[list.length - 1];
        if (p && p.audioEl) {
          const el = p.audioEl;
          const duration = el.duration;
          if (duration && duration > 0) {
            const start = p.trimStart && p.trimStart > 0 ? p.trimStart : 0;
            const end = p.trimEnd && p.trimEnd > start ? Math.min(p.trimEnd, duration) : duration;
            const span = end - start;
            if (span > 0) {
              const cur = Math.max(start, Math.min(end, el.currentTime));
              progressMap[id] = Math.min(1, Math.max(0, (cur - start) / span));
            }
          }
        }
      }
    });
    return progressMap;
  }

  public stopSound(soundId: string) {
    const list = this.activePlaybacks.get(soundId);
    if (list) {
      list.forEach((p) => {
        try {
          p.audioEl.pause();
          p.audioEl.currentTime = 0;
        } catch (e) {}
      });
      this.activePlaybacks.delete(soundId);
      this.checkVoiceMuteState();
      this.notify();
    }
  }

  public pauseSound(soundId: string) {
    const list = this.activePlaybacks.get(soundId);
    if (list && list.length > 0) {
      list.forEach((p) => {
        p.isPaused = true;
        try {
          p.audioEl.pause();
        } catch (e) {}
      });
      this.checkVoiceMuteState();
      this.notify();
    }
  }

  public resumeSound(soundId: string) {
    const list = this.activePlaybacks.get(soundId);
    if (list && list.length > 0) {
      list.forEach((p) => {
        p.isPaused = false;
        try {
          p.audioEl.play().catch(console.warn);
        } catch (e) {}
      });
      this.checkVoiceMuteState();
      this.notify();
    }
  }

  public isPaused(soundId: string): boolean {
    const list = this.activePlaybacks.get(soundId);
    if (!list || list.length === 0) return false;
    return !!(list[0].isPaused || (list[0].audioEl && list[0].audioEl.paused));
  }

  public seekSound(soundId: string, progress: number) {
    const list = this.activePlaybacks.get(soundId);
    if (!list || list.length === 0) return;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    list.forEach((p) => {
      if (p.audioEl && p.audioEl.duration && p.audioEl.duration > 0) {
        const start = p.trimStart && p.trimStart > 0 ? p.trimStart : 0;
        const end = p.trimEnd && p.trimEnd > start ? Math.min(p.trimEnd, p.audioEl.duration) : p.audioEl.duration;
        const targetTime = start + (end - start) * clampedProgress;
        try {
          p.audioEl.currentTime = targetTime;
        } catch (e) {}
      }
    });
    this.notify();
  }

  public skipSound(soundId: string, deltaSeconds: number) {
    const list = this.activePlaybacks.get(soundId);
    if (!list || list.length === 0) return;
    list.forEach((p) => {
      if (p.audioEl && p.audioEl.duration && p.audioEl.duration > 0) {
        const start = p.trimStart && p.trimStart > 0 ? p.trimStart : 0;
        const end = p.trimEnd && p.trimEnd > start ? Math.min(p.trimEnd, p.audioEl.duration) : p.audioEl.duration;
        const newTime = Math.max(start, Math.min(end, p.audioEl.currentTime + deltaSeconds));
        try {
          p.audioEl.currentTime = newTime;
        } catch (e) {}
      }
    });
    this.notify();
  }

  public togglePlayPauseSound(soundId: string) {
    if (this.isPaused(soundId)) {
      this.resumeSound(soundId);
    } else {
      this.pauseSound(soundId);
    }
  }

  public triggerSound(sound: SoundItem, allSounds: SoundItem[]) {
    this.getAudioContext();

    const isCurrentlyPlaying = this.isPlaying(sound.id);
    const mode = sound.reproductionMode || 'stop';

    switch (mode) {
      case 'overlap':
        this.startNewPlayback(sound, allSounds);
        break;

      case 'pause':
        if (isCurrentlyPlaying) {
          if (this.isPaused(sound.id)) {
            this.resumeSound(sound.id);
          } else {
            this.pauseSound(sound.id);
          }
        } else {
          this.startNewPlayback(sound, allSounds);
        }
        break;

      case 'stop':
        if (isCurrentlyPlaying) {
          this.stopSound(sound.id);
        } else {
          this.startNewPlayback(sound, allSounds);
        }
        break;

      case 'restart':
        if (isCurrentlyPlaying) {
          const list = this.activePlaybacks.get(sound.id);
          if (list && list.length > 0) {
            try {
              list[0].audioEl.currentTime = sound.trimStart || 0;
              list[0].audioEl.play().catch(console.warn);
            } catch (e) {}
          }
        } else {
          this.startNewPlayback(sound, allSounds);
        }
        break;

      case 'push_loop':
        if (isCurrentlyPlaying) {
          this.stopSound(sound.id);
        } else {
          this.startNewPlayback(sound, allSounds, true);
        }
        break;

      default:
        if (isCurrentlyPlaying) {
          this.stopSound(sound.id);
        } else {
          this.startNewPlayback(sound, allSounds);
        }
    }
  }

  private async startNewPlayback(sound: SoundItem, allSounds: SoundItem[], forceLoop = false) {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(console.warn);
    }

    const options = sound.reproductionOptions || {
      stopOtherSounds: true,
      muteOtherSounds: false,
      muteVoice: false,
      loop: false,
    };

    if (options.stopOtherSounds) {
      allSounds.forEach((other) => {
        if (other.id !== sound.id) {
          this.stopSound(other.id);
        }
      });
    }

    let audioSrc = sound.audioData || sound.audioPath;
    if (!audioSrc) {
      console.warn('Cannot play sound: No audio data or audio path for', sound.title);
      return;
    }

    if (
      !audioSrc.startsWith('data:') &&
      !audioSrc.startsWith('http://') &&
      !audioSrc.startsWith('https://') &&
      !audioSrc.startsWith('file://')
    ) {
      audioSrc = 'file:///' + audioSrc.replace(/\\/g, '/');
    }

    // 1. Single HTMLAudioElement routed through Web Audio
    const audioEl = new Audio(audioSrc);
    if (audioSrc.startsWith('http://') || audioSrc.startsWith('https://')) {
      audioEl.crossOrigin = 'anonymous';
    }
    audioEl.playbackRate = sound.speed || 1.0;
    audioEl.loop = forceLoop || options.loop || false;

    if (sound.trimStart && sound.trimStart > 0) {
      audioEl.currentTime = sound.trimStart;
    }

    // 2. Web Audio Routing: sourceNode -> soundGainNode -> [toHeadphonesGain & toCableGain]
    const sourceNode = ctx.createMediaElementSource(audioEl);

    // Individual Sound Gain (0% - 200% volume boost)
    const soundGainNode = ctx.createGain();
    const soundVol = Math.max(0, Math.min(2.0, (sound.volume ?? 100) / 100));
    soundGainNode.gain.setValueAtTime(soundVol, ctx.currentTime);

    // Branch A: To Personal Headphones (ctx.destination)
    const toHeadphonesGain = ctx.createGain();
    const soundsVol = Math.max(0, Math.min(1.0, (this.settings.masterSpeakerVolume ?? 100) / 100));
    toHeadphonesGain.gain.setValueAtTime(soundsVol, ctx.currentTime);
    soundGainNode.connect(toHeadphonesGain);
    toHeadphonesGain.connect(ctx.destination);

    // Branch B: To Virtual Cable Output (Piped to Discord/Games via cableMixDestination)
    const toCableGain = ctx.createGain();
    toCableGain.gain.setValueAtTime(soundsVol, ctx.currentTime);
    soundGainNode.connect(toCableGain);
    if (this.cableMixDestination) {
      toCableGain.connect(this.cableMixDestination);
    }

    sourceNode.connect(soundGainNode);

    // Handle trim end
    if (sound.trimEnd && sound.trimEnd > (sound.trimStart || 0)) {
      const checkTrimEnd = () => {
        if (audioEl.currentTime >= (sound.trimEnd || 99999)) {
          if (audioEl.loop) {
            audioEl.currentTime = sound.trimStart || 0;
          } else {
            // Remove/stop only this specific playback instance so overlapping instances continue playing
            audioEl.removeEventListener('timeupdate', checkTrimEnd);
            try {
              audioEl.pause();
              audioEl.currentTime = 0;
            } catch (e) {}
            onEnded();
          }
        }
      };
      audioEl.addEventListener('timeupdate', checkTrimEnd);
    }

    const handleStateChange = () => {
      this.checkVoiceMuteState();
      // Notify only when not triggered directly by internal pause/play to prevent feedback loops
    };

    audioEl.addEventListener('play', handleStateChange);
    audioEl.addEventListener('playing', handleStateChange);
    audioEl.addEventListener('pause', handleStateChange);

    const onEnded = () => {
      this.removePlayback(sound.id, audioEl);
      handleStateChange();
      this.notify();
    };

    audioEl.addEventListener('ended', onEnded);
    audioEl.addEventListener('error', onEnded);

    const playback: ActivePlayback = {
      soundId: sound.id,
      audioEl,
      sourceNode,
      soundGainNode,
      toHeadphonesGain,
      toCableGain,
      startTime: Date.now(),
      trimStart: sound.trimStart || 0,
      trimEnd: sound.trimEnd || 0,
      muteVoice: !!options.muteVoice,
      isPaused: false,
    };

    const existing = this.activePlaybacks.get(sound.id) || [];
    existing.push(playback);
    this.activePlaybacks.set(sound.id, existing);

    // Immediately notify UI that a sound playback was triggered!
    this.notify();

    await audioEl.play().catch((e) => {
      console.warn('Audio playback error:', e);
      onEnded();
    });

    if (options.muteVoice) {
      this.checkVoiceMuteState();
    }

    this.notify();
  }

  private removePlayback(soundId: string, audioEl: HTMLAudioElement) {
    const list = this.activePlaybacks.get(soundId);
    if (!list) return;
    const remaining = list.filter((p) => p.audioEl !== audioEl);
    if (remaining.length === 0) {
      this.activePlaybacks.delete(soundId);
    } else {
      this.activePlaybacks.set(soundId, remaining);
    }
  }

  private checkVoiceMuteState() {
    let shouldMuteVoice = false;
    this.activePlaybacks.forEach((playbacks) => {
      playbacks.forEach((p) => {
        if (p.muteVoice) {
          shouldMuteVoice = true;
        }
      });
    });

    this.isVoiceMutedBySound = shouldMuteVoice;

    const shouldPass = !this.isLoopbackPrevented && !this.isVoiceMutedBySound;
    const vol = Math.max(0, Math.min(2.0, (this.settings.micInputVolume ?? 100) / 100));

    if (this.voiceToCableGain && this.ctx) {
      this.voiceToCableGain.gain.setValueAtTime(shouldPass ? vol : 0.0, this.ctx.currentTime);
    }
    if (this.cableVoiceGainNode && this.cableCtx) {
      this.cableVoiceGainNode.gain.setValueAtTime(shouldPass ? vol : 0.0, this.cableCtx.currentTime);
    }
  }

  public cleanup() {
    this.stopAll();
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.systemDesktopStream) {
      this.systemDesktopStream.getTracks().forEach((t) => t.stop());
      this.systemDesktopStream = null;
    }
    if (this.systemDesktopSourceNode) {
      try {
        this.systemDesktopSourceNode.disconnect();
      } catch (e) {}
      this.systemDesktopSourceNode = null;
    }
    if (this.clipWorkletNode) {
      try {
        this.clipWorkletNode.disconnect();
      } catch (e) {}
      this.clipWorkletNode = null;
    }
    if (this.clipProcessorNode) {
      try {
        this.clipProcessorNode.disconnect();
      } catch (e) {}
      this.clipProcessorNode = null;
    }
    if (this.clipMixGainNode) {
      try {
        this.clipMixGainNode.disconnect();
      } catch (e) {}
      this.clipMixGainNode = null;
    }
    if (this.cableVoiceSourceNode) {
      try {
        this.cableVoiceSourceNode.disconnect();
      } catch (e) {}
      this.cableVoiceSourceNode = null;
    }
    if (this.cableVoiceGainNode) {
      try {
        this.cableVoiceGainNode.disconnect();
      } catch (e) {}
      this.cableVoiceGainNode = null;
    }
    if (this.cableSoundSourceNode) {
      try {
        this.cableSoundSourceNode.disconnect();
      } catch (e) {}
      this.cableSoundSourceNode = null;
    }
    if (this.cableSoundGainNode) {
      try {
        this.cableSoundGainNode.disconnect();
      } catch (e) {}
      this.cableSoundGainNode = null;
    }
    if (this.cableCtx && this.cableCtx.state !== 'closed') {
      this.cableCtx.close().catch(console.warn);
      this.cableCtx = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(console.warn);
      this.ctx = null;
    }
  }

  private rebuildClipBuffer(ctx: AudioContext): Promise<void> {
    if (this.clipSetupPromise) {
      this.clipSetupQueued = true;
      return this.clipSetupPromise;
    }
    this.clipSetupPromise = (async () => {
      do {
        this.clipSetupQueued = false;
        await this.setupRollingClipBuffer(ctx);
      } while (this.clipSetupQueued);
    })().finally(() => {
      this.clipSetupPromise = null;
    });
    return this.clipSetupPromise;
  }

  private async setupRollingClipBuffer(ctx: AudioContext) {
    if (this.clipWorkletNode) {
      try {
        this.clipWorkletNode.disconnect();
      } catch (e) {}
      this.clipWorkletNode = null;
    }
    if (this.clipProcessorNode) {
      try {
        this.clipProcessorNode.disconnect();
      } catch (e) {}
      this.clipProcessorNode = null;
    }

    try {
      this.bufferSampleRate = ctx.sampleRate || 48000;
      const bufferLen = this.bufferSampleRate * this.maxRollingSeconds * 2; // Full Stereo Interleaved
      if (this.fallbackRollingBuffer.length !== bufferLen) {
        this.fallbackRollingBuffer = new Float32Array(bufferLen);
        this.fallbackWriteIndex = 0;
        this.fallbackTotalWritten = 0;
      }

      // Clip mix gain node: clean separate bus for Physical Mic + Computer system sounds
      if (this.clipMixGainNode) {
        try {
          this.clipMixGainNode.disconnect();
        } catch (e) {}
      }
      this.clipMixGainNode = ctx.createGain();
      this.clipMixGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

      const recordSource = this.settings.recordSource ?? 'screen';
      const isAll = recordSource === 'all';
      // Studio recording gain: 1.0 (or 0.8 when mixing screen + mic to prevent clipping)
      const micGainVal = isAll ? 0.85 : 1.0;
      const sysGainVal = isAll ? 0.85 : 1.0;

      // 1. Connect physical microphone stream (Clean direct feed from micSourceNode or noise gate)
      // Only include mic if recordSource is 'all' or 'mic'
      if (recordSource !== 'screen') {
        if (this.noiseGateGainNode) {
          try {
            const micClipGain = ctx.createGain();
            micClipGain.gain.setValueAtTime(micGainVal, ctx.currentTime);
            this.noiseGateGainNode.connect(micClipGain);
            micClipGain.connect(this.clipMixGainNode);
          } catch (e) {}
        } else if (this.micSourceNode) {
          try {
            const micClipGain = ctx.createGain();
            micClipGain.gain.setValueAtTime(micGainVal, ctx.currentTime);
            this.micSourceNode.connect(micClipGain);
            micClipGain.connect(this.clipMixGainNode);
          } catch (e) {}
        }
      }

      // 2. Connect computer system sounds (Desktop audio loopback)
      if (recordSource !== 'mic') {
        await this.attachSystemSoundCapture(ctx, sysGainVal);
      }

      // 3. AudioWorklet Real-Time Ring Buffer (Runs on real-time audio thread: 0 dropped frames, exact 1.0x native speed)
      let workletInitialized = false;
      if ('audioWorklet' in ctx && typeof ctx.audioWorklet.addModule === 'function') {
        try {
          const workletCode = `
class RollingClipWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 48000;
    this.maxSeconds = 15;
    this.numChannels = 2; // Full High-Resolution Stereo
    this.bufferSize = 48000 * 15 * 2; // Interleaved Left and Right samples
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.totalFramesWritten = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'init') {
        this.sampleRate = data.sampleRate || 48000;
        this.maxSeconds = data.maxSeconds || 65;
        this.numChannels = 2;
        this.bufferSize = Math.floor(this.sampleRate * this.maxSeconds * 2);
        this.buffer = new Float32Array(this.bufferSize);
        this.writeIndex = 0;
        this.totalFramesWritten = 0;
      } else if (data.type === 'get_clip') {
        const seconds = data.seconds || 5;
        const requestedFrames = Math.min(
          Math.floor(seconds * this.sampleRate),
          this.totalFramesWritten,
          Math.floor(this.bufferSize / 2)
        );
        const requestedSamples = requestedFrames * 2;
        const out = new Float32Array(requestedSamples);
        if (this.buffer && requestedSamples > 0) {
          const start = (this.writeIndex - requestedSamples + this.bufferSize) % this.bufferSize;
          for (let i = 0; i < requestedSamples; i++) {
            out[i] = this.buffer[(start + i) % this.bufferSize];
          }
        }
        this.port.postMessage(
          {
            type: 'clip_data',
            requestId: data.requestId,
            samples: out,
            channels: 2,
            sampleRate: this.sampleRate,
            duration: requestedFrames / this.sampleRate,
          },
          [out.buffer]
        );
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && this.buffer) {
      const ch0 = input[0];
      const ch1 = input.length > 1 ? input[1] : ch0; // If mono input, copy to both channels
      const len = ch0.length;
      const bSize = this.bufferSize;
      const buf = this.buffer;
      let wIdx = this.writeIndex;

      for (let i = 0; i < len; i++) {
        buf[wIdx] = ch0[i];
        buf[(wIdx + 1) % bSize] = ch1[i];
        wIdx = (wIdx + 2) % bSize;
      }

      this.writeIndex = wIdx;
      this.totalFramesWritten += len;
    }
    return true;
  }
}
registerProcessor('rolling-clip-worklet', RollingClipWorkletProcessor);
`;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          const worklet = new AudioWorkletNode(ctx, 'rolling-clip-worklet');
          worklet.port.postMessage({
            type: 'init',
            sampleRate: this.bufferSampleRate,
            maxSeconds: this.maxRollingSeconds,
          });

          worklet.port.onmessage = (event) => {
            const data = event.data;
            if (data && data.type === 'clip_data' && data.requestId) {
              const handler = this.pendingClipRequests.get(data.requestId);
              if (handler) {
                this.pendingClipRequests.delete(data.requestId);
                handler(data);
              }
            }
          };

          this.clipMixGainNode.connect(worklet);
          this.clipWorkletNode = worklet;
          workletInitialized = true;
          console.log('[Prism Audio Engine] AudioWorklet Instant Replay buffer initialized at', this.bufferSampleRate, 'Hz (0 drops, exact speed).');
        } catch (workletErr) {
          console.warn('[Prism Audio Engine] AudioWorklet addModule failed, using fallback buffer:', workletErr);
        }
      }

      // Fallback processor if AudioWorklet could not be initialized
      if (!workletInitialized) {
        console.warn('[Prism Audio Engine] AudioWorklet not initialized, using stereo ScriptProcessor fallback buffer.');
        const proc = ctx.createScriptProcessor(4096, 2, 2);
        proc.onaudioprocess = (e) => {
          const ch0 = e.inputBuffer.getChannelData(0);
          const ch1 = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : ch0;
          const len = ch0.length;
          const totalLen = this.fallbackRollingBuffer.length;
          let wIdx = this.fallbackWriteIndex;
          for (let i = 0; i < len; i++) {
            this.fallbackRollingBuffer[wIdx] = ch0[i];
            this.fallbackRollingBuffer[(wIdx + 1) % totalLen] = ch1[i];
            wIdx = (wIdx + 2) % totalLen;
          }
          this.fallbackWriteIndex = wIdx;
          this.fallbackTotalWritten += len;
        };
        this.clipMixGainNode.connect(proc);
        const muteGain = ctx.createGain();
        muteGain.gain.setValueAtTime(0, ctx.currentTime);
        proc.connect(muteGain);
        muteGain.connect(ctx.destination);
        this.clipProcessorNode = proc;
        console.log('[Prism Audio Engine] Fallback buffer active.');
      }
    } catch (err) {
      console.warn('[Prism Audio Engine] Could not initialize Rolling Clip Buffer:', err);
    }
  }

  // Acquire system computer sound stream (via Electron getDisplayMedia loopback or Windows Stereo Mix)
  private async attachSystemSoundCapture(ctx: AudioContext, gainValue: number = 1.0) {
    if (this.systemDesktopSourceNode) {
      try {
        this.systemDesktopSourceNode.disconnect();
      } catch (e) {}
      this.systemDesktopSourceNode = null;
    }
    if (this.systemDesktopStream) {
      this.systemDesktopStream.getTracks().forEach((t) => t.stop());
      this.systemDesktopStream = null;
    }

    // 1. Try Modern Native Electron getDisplayMedia Loopback (Session-level WASAPI loopback, pure uncompressed high-resolution audio)
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000,
          } as any,
        });

        // Keep video track alive but disabled (zero GPU usage)
        // Calling track.stop() kills the underlying Chromium display session on Windows and silences loopback audio!
        stream.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0 && this.clipMixGainNode) {
          this.systemDesktopStream = stream;
          this.systemDesktopSourceNode = ctx.createMediaStreamSource(stream);
          const sysGain = ctx.createGain();
          sysGain.gain.setValueAtTime(gainValue, ctx.currentTime);
          this.systemDesktopSourceNode.connect(sysGain);
          sysGain.connect(this.clipMixGainNode);
          console.log('[Prism Audio Engine] Computer system sounds linked via high-res getDisplayMedia loopback! Track:', audioTracks[0].label);
          return;
        }
      } catch (gdmErr) {
        console.warn('[Prism Audio Engine] getDisplayMedia loopback failed, falling back:', gdmErr);
      }
    }

    // 2. Fallback: Electron Desktop Audio Source ID
    if (window.soundboardAPI?.getDesktopAudioSource) {
      try {
        const sourceId = await window.soundboardAPI.getDesktopAudioSource();
        if (sourceId) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
              },
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 2,
                maxWidth: 2,
                minHeight: 2,
                maxHeight: 2,
                maxFrameRate: 1,
              },
            } as any,
          });

          stream.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });

          if (stream.getAudioTracks().length > 0 && this.clipMixGainNode) {
            this.systemDesktopStream = stream;
            this.systemDesktopSourceNode = ctx.createMediaStreamSource(stream);
            const sysGain = ctx.createGain();
            sysGain.gain.setValueAtTime(gainValue, ctx.currentTime);
            this.systemDesktopSourceNode.connect(sysGain);
            sysGain.connect(this.clipMixGainNode);
            console.log('[Prism Audio Engine] Computer system sounds linked to Clip Buffer via desktop audio loopback.');
            return;
          }
        }
      } catch (err) {
        console.warn('[Prism Audio Engine] Desktop loopback getUserMedia failed, attempting Stereo Mix fallback:', err);
      }
    }

    // 3. Fallback: Windows Stereo Mix or What U Hear device
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const stereoMix = devs.find(
        (d) =>
          d.kind === 'audioinput' &&
          (d.label.toLowerCase().includes('stereo mix') ||
            d.label.toLowerCase().includes('what u hear') ||
            d.label.toLowerCase().includes('wave out'))
      );

      if (stereoMix && this.clipMixGainNode) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: stereoMix.deviceId } },
          video: false,
        });
        this.systemDesktopStream = stream;
        this.systemDesktopSourceNode = ctx.createMediaStreamSource(stream);
        const sysGain = ctx.createGain();
        sysGain.gain.setValueAtTime(gainValue, ctx.currentTime);
        this.systemDesktopSourceNode.connect(sysGain);
        sysGain.connect(this.clipMixGainNode);
        console.log('[Prism Audio Engine] Computer system sounds linked to Clip Buffer via Stereo Mix:', stereoMix.label);
      }
    } catch (e) {
      console.warn('[Prism Audio Engine] Stereo Mix fallback could not be acquired:', e);
    }
  }

  // Convert raw Float32Array PCM samples to a studio-grade 16-bit PCM Stereo WAV Blob (Format 1 - 100% universal player compatibility)
  // Automatically normalizes audio to deliver loud, clear, punchy playback without clipping distortion
  private encodeWav(samples: Float32Array, sampleRate: number, numChannels: number = 2): Blob {
    // 1. Peak normalization: Find maximum amplitude in recorded clip
    let maxPeak = 0;
    for (let i = 0; i < samples.length; i++) {
      const absVal = Math.abs(samples[i]);
      if (absVal > maxPeak) {
        maxPeak = absVal;
      }
    }

    // Boost gain up to 3.5x if signal is quiet, targeting -0.3 dB (0.96 peak)
    let normalizeMultiplier = 1.0;
    if (maxPeak > 0.005) {
      normalizeMultiplier = Math.min(3.5, 0.96 / maxPeak);
    } else {
      normalizeMultiplier = 1.0;
    }

    const bytesPerSample = 2; // 16-bit PCM (Format 1)
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataByteLen = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataByteLen);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + dataByteLen, true);
    /* RIFF type */
    writeString(8, 'WAVE');
    /* format chunk identifier */
    writeString(12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (1 = PCM) */
    view.setUint16(20, 1, true);
    /* channel count (2 = Stereo, 1 = Mono) */
    view.setUint16(22, numChannels, true);
    /* sample rate (e.g. 48000 Hz) */
    view.setUint32(24, sampleRate, true);
    /* byte rate */
    view.setUint32(28, byteRate, true);
    /* block align */
    view.setUint16(32, blockAlign, true);
    /* bits per sample (16-bit) */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(36, 'data');
    /* data chunk length */
    view.setUint32(40, dataByteLen, true);

    // Convert Float32 (-1.0 to 1.0) with normalization to signed 16-bit PCM with soft clamping
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const amplified = samples[i] * normalizeMultiplier;
      const s = Math.max(-1, Math.min(1, amplified));
      const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, intSample, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  // Clip the PREVIOUS N seconds (e.g. 3s, 5s, 10s) instantly from the live rolling buffer
  public async clipLastSeconds(seconds: number = 5): Promise<{ base64: string; duration: number }> {
    // 1. AudioWorklet path (Runs on real-time audio thread: zero dropped frames, exact 1.0x native playback speed, studio stereo)
    if (this.clipWorkletNode) {
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);
        const timeout = setTimeout(() => {
          this.pendingClipRequests.delete(requestId);
          console.error('[Prism Audio Engine] AudioWorklet clip request timed out after 3000ms. Falling back...');
          this.clipFromFallbackBuffer(seconds).then(resolve).catch(reject);
        }, 3000);

        this.pendingClipRequests.set(requestId, ({ samples, sampleRate, duration, channels }) => {
          clearTimeout(timeout);
          try {
            if (!samples || samples.length === 0) {
              console.error('[Prism Audio Engine] Worklet returned empty samples.');
              this.clipFromFallbackBuffer(seconds).then(resolve).catch(reject);
              return;
            }
            const wavBlob = this.encodeWav(samples, sampleRate || this.bufferSampleRate || 48000, channels || 2);
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                base64: reader.result as string,
                duration: duration || seconds,
              });
            };
            reader.onerror = (e) => {
              console.error('[Prism Audio Engine] FileReader failed encoding clip:', e);
              reject(e);
            };
            reader.readAsDataURL(wavBlob);
          } catch (err) {
            console.error('[Prism Audio Engine] Error processing worklet clip data:', err);
            this.clipFromFallbackBuffer(seconds).then(resolve).catch(reject);
          }
        });

        this.clipWorkletNode!.port.postMessage({
          type: 'get_clip',
          requestId,
          seconds,
        });
      });
    }

    console.warn('[Prism Audio Engine] clipWorkletNode not active, using fallback buffer.');
    return this.clipFromFallbackBuffer(seconds);
  }

  // Fallback slice from standard memory buffer
  private async clipFromFallbackBuffer(seconds: number = 5): Promise<{ base64: string; duration: number }> {
    const sampleRate = this.bufferSampleRate || 48000;
    const requestedFrames = Math.min(
      Math.floor(seconds * sampleRate),
      this.fallbackTotalWritten,
      Math.floor(this.fallbackRollingBuffer.length / 2)
    );
    const requestedSamples = requestedFrames * 2;

    if (requestedFrames <= sampleRate * 0.2) {
      if (this.settings.recordSource === 'screen') {
        throw new Error('Screen audio buffer is still warming up. Please try clipping again in a few seconds.');
      }
      return this.recordClip(seconds);
    }

    const outputSamples = new Float32Array(requestedSamples);
    const totalLen = this.fallbackRollingBuffer.length;
    const readStart = (this.fallbackWriteIndex - requestedSamples + totalLen) % totalLen;

    for (let i = 0; i < requestedSamples; i++) {
      outputSamples[i] = this.fallbackRollingBuffer[(readStart + i) % totalLen];
    }

    const wavBlob = this.encodeWav(outputSamples, sampleRate, 2);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          base64: reader.result as string,
          duration: requestedFrames / sampleRate,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(wavBlob);
    });
  }

  // Fallback Record audio forward if requested
  public async recordClip(durationSec: number = 5): Promise<{ base64: string; duration: number }> {
    const ctx = this.getAudioContext();
    const dest = ctx.createMediaStreamDestination();

    let streamToRecord: MediaStream | null = null;

    // Use current hardware mic stream or acquire fresh one
    if (this.micStream && this.micStream.active) {
      streamToRecord = this.micStream;
    } else {
      const realMic = await this.findRealPhysicalMicId();
      try {
        streamToRecord = await navigator.mediaDevices.getUserMedia({
          audio: realMic ? { deviceId: { exact: realMic } } : true,
          video: false,
        });
      } catch (e) {
        console.warn('Could not acquire audio stream for recording:', e);
      }
    }

    if (!streamToRecord) {
      throw new Error('No microphone or audio input available for recording.');
    }

    // Connect ONLY the microphone stream to the recording destination (Zero soundboard clip feedback!)
    const sourceNode = ctx.createMediaStreamSource(streamToRecord);
    sourceNode.connect(dest);

    return new Promise((resolve, reject) => {
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

        const recorder = mimeType
          ? new MediaRecorder(dest.stream, { mimeType })
          : new MediaRecorder(dest.stream);

        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = async () => {
          try {
            sourceNode.disconnect();
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve({
                base64,
                duration: durationSec,
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          } catch (err) {
            reject(err);
          }
        };

        recorder.start();

        // Stop automatically after specified duration
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, durationSec * 1000);
      } catch (err) {
        try {
          sourceNode.disconnect();
        } catch (e) {}
        reject(err);
      }
    });
  }
}

export const audioEngine = new AudioEngine();
if (typeof window !== 'undefined') {
  (window as any).audioEngine = audioEngine;
}
