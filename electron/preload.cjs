const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soundboardAPI', {
  // Persistence
  loadSounds: () => ipcRenderer.invoke('load-sounds'),
  saveSounds: (sounds) => ipcRenderer.invoke('save-sounds', sounds),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // YouTube operations
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
  getTrendingMusic: () => ipcRenderer.invoke('get-trending-music'),
  downloadYouTubeAudio: (url, title) => ipcRenderer.invoke('download-youtube-audio', { url, title }),
  getYouTubePreviewUrl: (url) => ipcRenderer.invoke('get-youtube-preview-url', url),

  // Local File import
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  importAudioFilePaths: (filePaths) => ipcRenderer.invoke('import-audio-filepaths', filePaths),
  getFilePathFromDroppedFile: (file) => {
    try {
      const { webUtils } = require('electron');
      if (webUtils && webUtils.getPathForFile) {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return file?.path || '';
  },
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),

  // Global Hotkeys
  registerGlobalHotkey: (hotkey, soundId) => ipcRenderer.invoke('register-hotkey', { hotkey, soundId }),
  unregisterGlobalHotkey: (hotkey) => ipcRenderer.invoke('unregister-hotkey', hotkey),
  unregisterAllHotkeys: () => ipcRenderer.invoke('unregister-all-hotkeys'),
  
  onGlobalHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('hotkey-triggered');
    const handler = (_event, soundId) => callback(soundId);
    ipcRenderer.on('hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('hotkey-triggered', handler);
  },

  onPanicHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('panic-hotkey-triggered');
    const handler = () => callback();
    ipcRenderer.on('panic-hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('panic-hotkey-triggered', handler);
  },

  onRepeatLastHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('repeat-last-hotkey-triggered');
    const handler = () => callback();
    ipcRenderer.on('repeat-last-hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('repeat-last-hotkey-triggered', handler);
  },

  onOverlayHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('overlay-hotkey-triggered');
    const handler = () => callback();
    ipcRenderer.on('overlay-hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('overlay-hotkey-triggered', handler);
  },

  onRecordHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('record-hotkey-triggered');
    const handler = () => callback();
    ipcRenderer.on('record-hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('record-hotkey-triggered', handler);
  },

  onVideoClipHotkeyTriggered: (callback) => {
    ipcRenderer.removeAllListeners('video-clip-hotkey-triggered');
    const handler = () => callback();
    ipcRenderer.on('video-clip-hotkey-triggered', handler);
    return () => ipcRenderer.removeListener('video-clip-hotkey-triggered', handler);
  },

  // Audio helper
  readAudioBuffer: (filePath) => ipcRenderer.invoke('read-audio-buffer', filePath),

  // Window Controls
  getDesktopAudioSource: () => ipcRenderer.invoke('get-desktop-audio-source'),
  getDesktopScreenSources: () => ipcRenderer.invoke('get-desktop-screen-sources'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openSoundSettings: () => ipcRenderer.invoke('open-sound-settings'),
  openSoundsDirectory: () => ipcRenderer.invoke('open-sounds-directory'),
  openDeletedDirectory: () => ipcRenderer.invoke('open-deleted-directory'),
  loadDeletedSounds: () => ipcRenderer.invoke('load-deleted-sounds'),
  moveToDeleted: (sound) => ipcRenderer.invoke('move-to-deleted', sound),
  restoreDeletedSound: (soundId) => ipcRenderer.invoke('restore-deleted-sound', soundId),
  permanentlyDeleteSound: (soundId) => ipcRenderer.invoke('permanently-delete-sound', soundId),
  exportSoundboardBackup: () => ipcRenderer.invoke('export-soundboard-backup'),
  importSoundboardBackup: () => ipcRenderer.invoke('import-soundboard-backup'),
  saveRecordedAudio: (data) => ipcRenderer.invoke('save-recorded-audio', data),
  installVirtualDriver: () => ipcRenderer.invoke('install-virtual-driver'),
  renameVirtualMic: () => ipcRenderer.invoke('rename-virtual-mic'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  checkAppUpdates: () => ipcRenderer.invoke('check-app-updates'),
  onStartupUpdateAvailable: (callback) => {
    const handler = (_event, updateData) => callback(updateData);
    ipcRenderer.on('startup-update-available', handler);
    return () => ipcRenderer.removeListener('startup-update-available', handler);
  },
  downloadAndInstallUpdate: (downloadUrl) => ipcRenderer.invoke('download-and-install-update', downloadUrl),
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },

  // Inter-Window IPC Events (Overlay <-> Main sync)
  sendIpcCommand: (channel, data) => ipcRenderer.send(channel, data),
  onIpcCommand: (channel, callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // Video Clips & Storage APIs
  loadVideoClips: () => ipcRenderer.invoke('load-video-clips'),
  saveVideoClips: (clips) => ipcRenderer.invoke('save-video-clips', clips),
  saveRecordedVideoClip: (data) => ipcRenderer.invoke('save-recorded-video-clip', data),
  deleteVideoClip: (clipId) => ipcRenderer.invoke('delete-video-clip', clipId),
  renameVideoClip: (clipId, newTitle) => ipcRenderer.invoke('rename-video-clip', { clipId, newTitle }),
  toggleFavoriteVideoClip: (clipId) => ipcRenderer.invoke('toggle-favorite-video-clip', clipId),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  extractAudioFromVideoClip: (clip) => ipcRenderer.invoke('extract-audio-from-video-clip', clip),
  getStorageDirectories: () => ipcRenderer.invoke('get-storage-directories'),
  changeStorageLocation: (newRootPath) => ipcRenderer.invoke('change-storage-location', newRootPath),
  selectStorageFolderDialog: () => ipcRenderer.invoke('select-storage-folder-dialog'),
});

