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
  videoClipHotkey?: string; // default "F10" (Instant Replay Video Screen Capture)
  recordDuration?: number; // default 5 (seconds, e.g. 3, 5, 10, 15, 30)
  videoClipDuration?: number; // default 30 (seconds, e.g. 15, 30, 45, 60)
  recordSource?: 'all' | 'screen' | 'mic'; // 'all' = screen + mic, 'screen' = raw game/system audio only, 'mic' = voice only
  theme: string; // 'dark' | 'neutral-obsidian' | 'oled-stealth';
  accentColor: string;
  minimizeToTray: boolean;
  startOnBoot?: boolean;
  startInTray?: boolean;
  githubRepo?: string; // Optional custom GitHub repository "owner/repo" for update checks
  sortBy?: 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration';
  activeFilter?: 'all' | 'clips' | 'youtube' | 'favorites';
  storageLocation?: string; // Unified root folder, e.g. "D:\Prism" -> contains /Sounds and /Videos
  enableFrostedGlass?: boolean; // Translucent frosted glass and Windows 11 acrylic effects (default: true)
  remoteControlEnabled?: boolean; // Enable local Wi-Fi mobile remote server
  remoteControlPort?: number; // Default 3940
  remoteControlPin?: string; // 4-6 digit Owner PIN required on every phone connection
  remoteGuestEnabled?: boolean; // Allow a separate Friend PIN with restricted permissions
  remoteGuestPin?: string; // 4-6 digit Friend PIN
  remoteGuestPermissions?: RemoteGuestPermissions;
  remoteGuestCooldownSeconds?: number; // Spam cooldown in seconds between Friend sound triggers (default 1)
}

export interface RemoteGuestPermissions {
  canStopAll: boolean;
  canControlVolume: boolean;
  canEditSounds: boolean;
  canDeleteSounds: boolean;
  canAddSounds: boolean;
  canAudioClip: boolean;
  canVideoClip: boolean;
}

export interface PublicTunnelStatus {
  active: boolean;
  status: 'stopped' | 'downloading' | 'starting' | 'online' | 'error';
  url: string;
  qrDataUrl: string;
  downloadProgress?: number;
  error?: string;
}

export interface PlaybackActor {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: 'owner' | 'guest';
}

export interface ActivePlaybackEntry {
  soundId: string;
  soundTitle: string;
  actorId: string;
  actorName: string;
  initials: string;
  color: string;
  role: 'owner' | 'guest';
  startedAt: number;
}

export interface RemoteActivityEvent {
  id: string;
  timestamp: number;
  type: 'play' | 'stop' | 'join' | 'timeout' | 'permission' | 'add' | 'edit' | 'delete' | 'clip' | 'leave';
  actorId: string;
  actorName: string;
  initials: string;
  color: string;
  actorRole: 'owner' | 'guest';
  action: string;
  detail?: string;
  soundId?: string;
}

export interface RemoteConnectedDevice {
  id: string;
  role: 'owner' | 'guest';
  name?: string;
  initials?: string;
  color?: string;
  label: string;
  ip: string;
  connectedAt: number;
  lastSeen: number;
  online: boolean;
  tempLocked: boolean;
  tempLockedUntil?: number | null;
  permissions?: RemoteGuestPermissions;
  hasCustomPermissions?: boolean;
}

export interface RemoteServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  pin: string;
  guestEnabled?: boolean;
  guestPin?: string;
  guestPermissions?: RemoteGuestPermissions;
  guestCooldownSeconds?: number;
  urls: string[];
  primaryUrl: string;
  qrDataUrl: string;
  connectedClients: number;
  devices?: RemoteConnectedDevice[];
  activePlaybacks?: ActivePlaybackEntry[];
  activityLog?: RemoteActivityEvent[];
  tunnel?: PublicTunnelStatus;
  error?: string;
}

export interface VideoClipItem {
  id: string;
  title: string;
  filePath: string;
  thumbnailPath?: string;
  duration: number; // in seconds
  fileSize: number; // in bytes
  dateAdded: number; // timestamp
  isFavorite: boolean;
  game?: string;
  fps?: number;
  width?: number;
  height?: number;
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
  onPanicHotkeyTriggered: (callback: (payload?: { skipRemoteLog?: boolean }) => void) => () => void;
  onRepeatLastHotkeyTriggered?: (callback: () => void) => () => void;
  onOverlayHotkeyTriggered?: (callback: () => void) => () => void;
  onRecordHotkeyTriggered?: (callback: () => void) => () => void;
  onVideoClipHotkeyTriggered?: (callback: () => void) => () => void;

  // Audio helper
  readAudioBuffer: (filePath: string) => Promise<string>; // base64

  // Window Controls
  getDesktopAudioSource?: () => Promise<string | null>;
  getDesktopScreenSources?: () => Promise<Array<{ id: string; name: string; display_id?: string }>>;
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
  exportSoundboardBackup?: (sounds?: SoundItem[], videoClips?: VideoClipItem[]) => Promise<boolean>;
  importSoundboardBackup?: () => Promise<{ sounds: SoundItem[]; videoClips?: VideoClipItem[]; deletedSounds?: SoundItem[]; settings?: AudioSettings } | null>;
  onBackupProgress?: (callback: (progress: { percent: number; stage: string; detail: string }) => void) => () => void;
  onStorageRelocationProgress?: (callback: (progress: { percent: number; stage: string; detail: string }) => void) => () => void;
  resetAllAppData?: () => Promise<boolean>;
  saveRecordedAudio?: (data: { base64: string; duration: number; title: string }) => Promise<{
    filePath: string;
    audioData: string;
    duration: number;
    title: string;
  }>;
  checkVirtualDriverInstalled?: () => Promise<boolean>;
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
  onStartupUpdateAvailable?: (callback: (update: any) => void) => () => void;
  downloadAndInstallUpdate?: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDownloadProgress?: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  sendIpcCommand?: (channel: string, data?: any) => void;
  onIpcCommand?: (channel: string, callback: (data: any) => void) => () => void;

  // Video Clips & Storage APIs
  loadVideoClips?: () => Promise<VideoClipItem[]>;
  saveVideoClips?: (clips: VideoClipItem[]) => Promise<boolean>;
  saveRecordedVideoClip?: (data: { base64: string; duration: number; title?: string; game?: string; width?: number; height?: number }) => Promise<VideoClipItem>;
  deleteVideoClip?: (clipId: string) => Promise<boolean>;
  renameVideoClip?: (clipId: string, newTitle: string) => Promise<boolean>;
  toggleFavoriteVideoClip?: (clipId: string) => Promise<boolean>;
  showItemInFolder?: (filePath: string) => Promise<boolean>;
  extractAudioFromVideoClip?: (clip: VideoClipItem) => Promise<SoundItem | null>;
  trimVideoClip?: (data: { clipId: string; startSec: number; endSec: number; saveAsNew: boolean }) => Promise<VideoClipItem | null>;
  getStorageDirectories?: () => Promise<{ root: string; sounds: string; videos: string }>;
  changeStorageLocation?: (newRootPath: string) => Promise<{ success: boolean; root: string; sounds: string; videos: string; error?: string }>;
  selectStorageFolderDialog?: () => Promise<string | null>;

  // Mobile Remote Server (LAN Wi-Fi Deck & Public Tunnel)
  getRemoteServerStatus?: () => Promise<RemoteServerStatus>;
  regenerateRemotePin?: () => Promise<RemoteServerStatus>;
  regenerateGuestPin?: () => Promise<RemoteServerStatus>;
  disconnectRemoteClients?: () => Promise<RemoteServerStatus>;
  setRemoteTempLock?: (deviceIds: string[] | 'all', locked: boolean, durationSeconds?: number) => Promise<RemoteServerStatus>;
  setRemoteGuestPermissions?: (permissions: Partial<RemoteGuestPermissions>) => Promise<RemoteServerStatus>;
  setRemoteDevicePermissions?: (deviceId: string, permissions: Partial<RemoteGuestPermissions>) => Promise<RemoteServerStatus>;
  removeRemoteDevices?: (deviceIds: string[] | 'all') => Promise<RemoteServerStatus>;
  startPublicTunnel?: () => Promise<RemoteServerStatus>;
  stopPublicTunnel?: () => Promise<RemoteServerStatus>;
  clearRemoteActivity?: () => Promise<RemoteServerStatus>;
  onRemoteServerStatusUpdated?: (callback: (status: RemoteServerStatus) => void) => () => void;
}

declare global {
  interface Window {
    soundboardAPI?: SoundboardAPI;
  }
}

