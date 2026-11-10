export type ReproductionMode = 'overlap' | 'pause' | 'stop' | 'restart' | 'push_loop';

export interface ReproductionOptions {
  stopOtherSounds: boolean;
  muteOtherSounds: boolean;
  muteVoice: boolean;
  loop: boolean;
}

export interface SoundItem {
  id: string;
  title: string;
  author: string;
  audioPath: string;
  audioData?: string; // base64 or file URL
  thumbnail: string;
  duration: number; // in seconds
  hotkey: string;
  volume: number; // 0 to 200 (100 = 100%)
  reproductionMode: ReproductionMode;
  reproductionOptions: ReproductionOptions;
  playCount: number;
  isFavorite: boolean;
  category?: string;
  source?: 'youtube' | 'local' | 'clip';
  deletedAt?: number;
  trimStart?: number;
  trimEnd?: number;
  pitch?: number;
  speed?: number;
  dateAdded: number;
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channel: string;
  duration: string;
  durationSec?: number;
  thumbnail: string;
  url: string;
}

export interface AudioSettings {
  inputDeviceId: string; // Real Physical Microphone (e.g. Headset Mic)
  primaryDeviceId: string; // Personal Monitor (Headphones / Speakers)
  secondaryDeviceId: string; // Virtual Mic / Cable (e.g. Voicemod, CABLE Input)
  isSecondaryEnabled: boolean;
  isMicPassThroughEnabled: boolean; // Routes your real voice into the virtual mic like Voicemod
  hearMyself: boolean; // Hear your own voice through headphones
  masterSpeakerVolume: number; // 0 - 100
  masterMicVolume: number; // 0 - 100
  micInputVolume: number; // 0 - 200 (Gain for your real voice)
  isNoiseGateEnabled?: boolean; // Silences background noise below threshold
  noiseGateThreshold?: number; // In dB (e.g. -39 dB)
  panicHotkey: string; // default "Escape"
  repeatLastHotkey?: string; // default "F7" (Replay last played sound)
  overlayHotkey?: string; // default "F8" (In-game Always-On-Top Mini Overlay)
  recordHotkey?: string; // default "F9" (Quick Microphone/System Clip Recording)
  recordDuration?: number; // default 5 (seconds, e.g. 3, 5, 10, 15, 30)
  recordSource?: 'all' | 'screen' | 'mic'; // 'all' = screen + mic, 'screen' = raw game/system audio only, 'mic' = voice only
  theme: string; // 'cyber-violet' | 'neon-emerald' | 'electric-cyan' | 'crimson-noir' | 'solar-gold' | 'titanium-slate' | 'dark';
  accentColor: string;
  minimizeToTray: boolean;
  startOnBoot?: boolean;
  startInTray?: boolean;
  githubRepo?: string; // Optional custom GitHub repository "owner/repo" for update checks
  sortBy?: 'custom' | 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration';
  activeFilter?: 'all' | 'clips' | 'youtube' | 'favorites';
}

export interface SoundboardAPI {
  // Persistence
  loadSounds: () => Promise<SoundItem[]>;
  saveSounds: (sounds: SoundItem[]) => Promise<boolean>;
  loadSettings: () => Promise<AudioSettings>;
  saveSettings: (settings: AudioSettings) => Promise<boolean>;

  // YouTube operations
  searchYouTube: (query: string) => Promise<YouTubeSearchResult[]>;
  getTrendingMusic?: () => Promise<YouTubeSearchResult[]>;
  downloadYouTubeAudio: (url: string, title?: string) => Promise<{
    filePath: string;
    audioData: string;
    thumbnail: string;
    duration: number;
    title: string;
    author: string;
  }>;
  getYouTubePreviewUrl: (url: string) => Promise<string | null>;

  // Local File import
  selectAudioFiles: () => Promise<Array<{
    name: string;
    filePath: string;
    audioData: string;
    duration: number;
  }>>;
  importAudioFilePaths?: (filePaths: string[]) => Promise<Array<{
    name: string;
    filePath: string;
    audioData: string;
    duration: number;
  }>>;
  getFilePathFromDroppedFile?: (file: File) => string;
  selectImageFile: () => Promise<string | null>;

  // Global Hotkeys
  registerGlobalHotkey: (hotkey: string, soundId: string) => Promise<boolean>;
  unregisterGlobalHotkey: (hotkey: string) => Promise<boolean>;
  unregisterAllHotkeys: () => Promise<boolean>;
  onGlobalHotkeyTriggered: (callback: (soundId: string) => void) => () => void;
  onPanicHotkeyTriggered: (callback: () => void) => () => void;
  onRepeatLastHotkeyTriggered?: (callback: () => void) => () => void;
  onOverlayHotkeyTriggered?: (callback: () => void) => () => void;
  onRecordHotkeyTriggered?: (callback: () => void) => () => void;

  // Audio helper
  readAudioBuffer: (filePath: string) => Promise<string>; // base64

  // Window Controls
  getDesktopAudioSource?: () => Promise<string | null>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  openExternal: (url: string) => void;
  openSoundSettings: () => void;
  openSoundsDirectory?: () => Promise<boolean>;
  openDeletedDirectory?: () => Promise<boolean>;
  loadDeletedSounds?: () => Promise<SoundItem[]>;
  moveToDeleted?: (sound: SoundItem) => Promise<SoundItem | false>;
  restoreDeletedSound?: (soundId: string) => Promise<SoundItem | null>;
  permanentlyDeleteSound?: (soundId: string) => Promise<boolean>;
  exportSoundboardBackup?: () => Promise<boolean>;
  importSoundboardBackup?: () => Promise<{ sounds: SoundItem[]; settings?: AudioSettings } | null>;
  saveRecordedAudio?: (data: { base64: string; duration: number; title: string }) => Promise<{
    filePath: string;
    audioData: string;
    duration: number;
    title: string;
  }>;
  installVirtualDriver: () => Promise<boolean>;
  renameVirtualMic: () => Promise<boolean>;
  closeOverlay?: () => Promise<boolean>;
  showMainWindow?: () => Promise<boolean>;
  checkAppUpdates?: () => Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    releaseName?: string;
    releaseNotes?: string;
    publishedAt?: string;
    releaseUrl?: string;
    downloadUrl?: string;
    error?: string;
    message?: string;
    owner?: string;
    repo?: string;
  }>;
  sendIpcCommand?: (channel: string, data?: any) => void;
  onIpcCommand?: (channel: string, callback: (data: any) => void) => () => void;
}

declare global {
  interface Window {
    soundboardAPI?: SoundboardAPI;
  }
}

