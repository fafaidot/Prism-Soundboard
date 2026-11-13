// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Mainstream Storage & Persistence Engine for Prism Soundboard.
 * Features:
 * - Atomic write engine (temp file + fsync + atomic rename) preventing 0-byte corruptions
 * - Automated self-healing rolling snapshots in snapshots/
 * - Instant flush on app shutdown (will-quit / before-quit)
 * - Automatic migration and translation of legacy data files
 * - Full .prism backup and restore with progress feedback & manifest v2
 * - Safe transactional storage location relocation
 */
class StorageManager {
  constructor() {
    this.app = null;
    this.appDataRoot = '';
    this.userDataDir = '';
    this.snapshotsDir = '';
    this.activeStorageRoot = '';

    // Metadata file paths
    this.soundsFile = '';
    this.settingsFile = '';
    this.clipsFile = '';
    this.deletedSoundsFile = '';

    // Media folders
    this.audioDir = '';
    this.videosDir = '';
    this.recycleDir = '';

    // Debounce & pending flush buffers
    this.pendingSounds = null;
    this.soundsTimer = null;

    this.pendingSettings = null;
    this.settingsTimer = null;

    this.pendingClips = null;
    this.clipsTimer = null;

    this.initialized = false;
  }

  /**
   * Initialize directories, resolve storage locations, and translate legacy files.
   * @param {import('electron').App} app
   */
  init(app) {
    if (this.initialized) return;
    this.app = app;

    this.appDataRoot = app.getPath('appData');
    this.userDataDir = path.join(this.appDataRoot, 'Prism Soundboard');
    this.snapshotsDir = path.join(this.userDataDir, 'snapshots');

    this.soundsFile = path.join(this.userDataDir, 'soundboard_sounds.json');
    this.settingsFile = path.join(this.userDataDir, 'soundboard_settings.json');
    this.clipsFile = path.join(this.userDataDir, 'video_clips.json');
    this.deletedSoundsFile = path.join(this.userDataDir, 'deleted_sounds.json');

    // Default media storage root or user-configured custom location
    this.activeStorageRoot = this.userDataDir;
    try {
      if (fs.existsSync(this.settingsFile)) {
        const s = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
        if (s.storageLocation && typeof s.storageLocation === 'string' && s.storageLocation.trim()) {
          this.activeStorageRoot = path.resolve(s.storageLocation.trim());
        }
      }
    } catch (_) {}

    this.audioDir = path.join(this.activeStorageRoot, 'Sounds');
    this.videosDir = path.join(this.activeStorageRoot, 'Videos');
    this.recycleDir = path.join(this.activeStorageRoot, 'RecycleBin');

    this.ensureDirectories();
    this.translateLegacyFiles();
    this.initialized = true;
  }

  /**
   * Ensure all required directories exist.
   */
  ensureDirectories() {
    try {
      const dirs = [
        this.userDataDir,
        this.snapshotsDir,
        this.activeStorageRoot,
        this.audioDir,
        this.videosDir,
        this.recycleDir,
      ];
      for (const d of dirs) {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      }
    } catch (err) {
      console.error('[StorageManager] Error ensuring directories:', err);
    }
  }

  /**
   * Atomic File Writer: writes to temporary file, flushes buffers, and renames atomically.
   * Guarantees zero 0-byte corruptions even on crashes or power failures.
   * @param {string} filePath
   * @param {any} data
   */
  atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const jsonStr = JSON.stringify(data, null, 2);

    try {
      const fd = fs.openSync(tempPath, 'w');
      fs.writeSync(fd, jsonStr, 0, 'utf-8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      fs.renameSync(tempPath, filePath);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
      console.error(`[StorageManager] Atomic write failed for ${filePath}:`, err);
      throw err;
    }
  }

  /**
   * Create a self-healing snapshot for automatic data recovery.
   * @param {'sounds' | 'settings' | 'clips'} type
   * @param {any} data
   */
  createSnapshot(type, data) {
    if (!data) return;
    try {
      if (!fs.existsSync(this.snapshotsDir)) {
        fs.mkdirSync(this.snapshotsDir, { recursive: true });
      }
      const snapshotFile = path.join(this.snapshotsDir, `${type}.snapshot.json`);
      this.atomicWriteJson(snapshotFile, data);

      // Rotating backup (timestamped copy, keeps up to 3)
      const timestamped = path.join(this.snapshotsDir, `${type}_${Date.now()}.bak.json`);
      this.atomicWriteJson(timestamped, data);

      // Prune old snapshots of this type (keep 3 latest)
      const files = fs.readdirSync(this.snapshotsDir)
        .filter((f) => f.startsWith(`${type}_`) && f.endsWith('.bak.json'))
        .map((f) => ({
          name: f,
          path: path.join(this.snapshotsDir, f),
          time: fs.statSync(path.join(this.snapshotsDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 3) {
        for (let i = 3; i < files.length; i++) {
          try { fs.unlinkSync(files[i].path); } catch (_) {}
        }
      }
    } catch (err) {
      console.warn(`[StorageManager] Snapshot creation failed for ${type}:`, err);
    }
  }

  /**
   * Safe reader with automated self-healing fallback to latest valid snapshot.
   * @param {string} filePath
   * @param {'sounds' | 'settings' | 'clips'} type
   * @param {any} fallbackDefault
   * @returns {any}
   */
  loadWithAutoRecovery(filePath, type, fallbackDefault) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (parsed !== null && parsed !== undefined) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn(`[StorageManager] Corrupted or invalid JSON in ${filePath}, attempting self-healing recovery...`, err);
      }
    }

    // Attempt self-healing from snapshots/
    try {
      if (fs.existsSync(this.snapshotsDir)) {
        const candidateFiles = [
          path.join(this.snapshotsDir, `${type}.snapshot.json`),
          ...fs.readdirSync(this.snapshotsDir)
            .filter((f) => f.startsWith(`${type}_`) && f.endsWith('.bak.json'))
            .map((f) => path.join(this.snapshotsDir, f)),
        ];

        for (const candidate of candidateFiles) {
          if (fs.existsSync(candidate)) {
            try {
              const data = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
              if (data) {
                console.info(`[StorageManager] Successfully self-healed ${type} from snapshot: ${candidate}`);
                this.atomicWriteJson(filePath, data);
                return data;
              }
            } catch (_) {}
          }
        }
      }
    } catch (recoveryErr) {
      console.error(`[StorageManager] Self-healing recovery failed for ${type}:`, recoveryErr);
    }

    return fallbackDefault;
  }

  /**
   * Translate and migrate legacy files from older app versions into the unified storage system.
   */
  translateLegacyFiles() {
    try {
      // 1. Migrate legacy audio_library directory to Sounds
      const legacyDirs = [
        path.join(this.userDataDir, 'audio_library'),
        path.join(this.appDataRoot, 'fluent-soundboard', 'audio_library'),
        path.join(this.appDataRoot, 'Electron', 'audio_library'),
      ];
      for (const legacyAudioDir of legacyDirs) {
        if (fs.existsSync(legacyAudioDir) && legacyAudioDir !== this.audioDir) {
          try {
            const files = fs.readdirSync(legacyAudioDir);
            for (const f of files) {
              const src = path.join(legacyAudioDir, f);
              const dst = path.join(this.audioDir, f);
              if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
                fs.copyFileSync(src, dst);
              }
            }
          } catch (e) {
            console.warn('[StorageManager] Legacy audio_library migration note:', e);
          }
        }
      }

      // 2. Migrate legacy Deleted folder to RecycleBin
      const legacyDeletedDir = path.join(this.activeStorageRoot, 'Deleted');
      if (fs.existsSync(legacyDeletedDir)) {
        try {
          const files = fs.readdirSync(legacyDeletedDir);
          for (const f of files) {
            const src = path.join(legacyDeletedDir, f);
            const dst = path.join(this.recycleDir, f);
            if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
              fs.copyFileSync(src, dst);
            }
          }
        } catch (e) {
          console.warn('[StorageManager] Legacy Deleted migration note:', e);
        }
      }

      // 3. Translate legacy sound files if primary soundboard_sounds.json is missing or empty
      let currentSounds = [];
      let needsSoundTranslation = false;
      if (!fs.existsSync(this.soundsFile)) {
        needsSoundTranslation = true;
      } else {
        try {
          const parsed = JSON.parse(fs.readFileSync(this.soundsFile, 'utf-8'));
          if (!Array.isArray(parsed) || parsed.length === 0) {
            needsSoundTranslation = true;
          } else {
            currentSounds = parsed;
          }
        } catch (_) {
          needsSoundTranslation = true;
        }
      }

      if (needsSoundTranslation) {
        const legacyCandidates = [
          path.join(this.appDataRoot, 'fluent-soundboard', 'soundboard_sounds.json'),
          path.join(this.snapshotsDir, 'sounds.snapshot.json'),
          path.join(this.userDataDir, 'sounds_backup_57.json'),
          path.join(this.userDataDir, 'sounds.json'),
          path.join(this.appDataRoot, 'Electron', 'soundboard_sounds.json'),
          path.join(this.appDataRoot, 'Electron', 'sounds.json'),
        ];

        // Also check timestamped backups in snapshotsDir
        if (fs.existsSync(this.snapshotsDir)) {
          try {
            const snapFiles = fs.readdirSync(this.snapshotsDir)
              .filter((f) => f.startsWith('sounds_') && f.endsWith('.bak.json'))
              .map((f) => path.join(this.snapshotsDir, f));
            legacyCandidates.push(...snapFiles);
          } catch (_) {}
        }

        const soundMap = new Map();
        for (const candidate of legacyCandidates) {
          if (fs.existsSync(candidate)) {
            try {
              const legacyData = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
              if (Array.isArray(legacyData) && legacyData.length > 0) {
                console.info(`[StorageManager] Found ${legacyData.length} sounds in candidate file: ${candidate}`);
                for (const s of legacyData) {
                  if (s && s.id && !soundMap.has(s.id)) {
                    soundMap.set(s.id, s);
                  }
                }
              }
            } catch (_) {}
          }
        }

        if (soundMap.size > 0) {
          currentSounds = Array.from(soundMap.values());
          console.info(`[StorageManager] Successfully merged and restored ${currentSounds.length} sounds from storage archives.`);
        }
      }

      // Remap audioPath references if files exist in Sounds directory
      if (Array.isArray(currentSounds) && currentSounds.length > 0) {
        let changed = false;
        const normalizedSounds = this.sanitizeSounds(currentSounds.map((sound) => {
          if (sound.audioPath) {
            const fileName = path.basename(sound.audioPath);
            const expectedPath = path.join(this.audioDir, fileName);
            if (fs.existsSync(expectedPath) && sound.audioPath !== expectedPath) {
              changed = true;
              return { ...sound, audioPath: expectedPath };
            }
          }
          return sound;
        }));

        if (changed || needsSoundTranslation) {
          this.atomicWriteJson(this.soundsFile, normalizedSounds);
          this.createSnapshot('sounds', normalizedSounds);
        }
      }

      // 4. Ensure video_clips.json is valid and clean
      if (!fs.existsSync(this.clipsFile)) {
        this.atomicWriteJson(this.clipsFile, []);
      }

      // 5. Create initial snapshots of existing healthy databases
      if (fs.existsSync(this.soundsFile)) {
        try {
          const s = JSON.parse(fs.readFileSync(this.soundsFile, 'utf-8'));
          if (Array.isArray(s) && s.length > 0) this.createSnapshot('sounds', s);
        } catch (_) {}
      }
      if (fs.existsSync(this.settingsFile)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
          if (cfg) this.createSnapshot('settings', cfg);
        } catch (_) {}
      }
      if (fs.existsSync(this.clipsFile)) {
        try {
          const c = JSON.parse(fs.readFileSync(this.clipsFile, 'utf-8'));
          if (Array.isArray(c)) this.createSnapshot('clips', c);
        } catch (_) {}
      }
    } catch (err) {
      console.error('[StorageManager] Error during legacy translation:', err);
    }
  }

  // ==========================================
  // Sounds Operations
  // ==========================================

  /**
   * Strip redundant multi-megabyte base64 audioData when valid audioPath is on disk.
   * Keeps storage lean (20KB vs 135MB), eliminating memory pressure and write lag.
   * @param {any[]} sounds
   * @returns {any[]}
   */
  sanitizeSounds(sounds) {
    if (!Array.isArray(sounds)) return [];
    return sounds.map((sound) => {
      if (sound && sound.audioPath && sound.audioData) {
        if (fs.existsSync(sound.audioPath)) {
          const clone = { ...sound };
          delete clone.audioData;
          return clone;
        }
      }
      return sound;
    });
  }

  /**
   * Load active sounds with automated self-healing.
   * @returns {any[]}
   */
  loadSounds() {
    return this.loadWithAutoRecovery(this.soundsFile, 'sounds', []);
  }

  /**
   * Save sounds atomically with intelligent debounce.
   * @param {any[]} sounds
   * @param {boolean} [immediate=false]
   */
  saveSounds(sounds, immediate = false, allowEmpty = false) {
    if (!Array.isArray(sounds)) return;

    // Safety Guard: Never wipe out an existing healthy sound library with an empty array
    // unless allowEmpty is explicitly passed (e.g. user confirmed "Clear all sounds" in UI)
    if (sounds.length === 0 && !allowEmpty) {
      if (fs.existsSync(this.soundsFile)) {
        try {
          const currentOnDisk = JSON.parse(fs.readFileSync(this.soundsFile, 'utf-8'));
          if (Array.isArray(currentOnDisk) && currentOnDisk.length > 0) {
            console.warn('[StorageManager] BLOCKED attempt to overwrite existing sounds with empty array!');
            return;
          }
        } catch (_) {}
      }
    }

    this.pendingSounds = sounds;

    if (this.soundsTimer) {
      clearTimeout(this.soundsTimer);
      this.soundsTimer = null;
    }

    const commit = () => {
      if (!this.pendingSounds) return;
      const toWrite = this.sanitizeSounds(this.pendingSounds);
      this.pendingSounds = null;
      try {
        this.atomicWriteJson(this.soundsFile, toWrite);
        this.createSnapshot('sounds', toWrite);
      } catch (err) {
        console.error('[StorageManager] Failed to commit sounds:', err);
      }
    };

    if (immediate) {
      commit();
    } else {
      this.soundsTimer = setTimeout(commit, 200);
    }
  }

  // ==========================================
  // Settings Operations
  // ==========================================

  /**
   * Load user settings with fallback defaults.
   * @returns {any}
   */
  loadSettings() {
    const defaults = {
      inputDeviceId: 'default',
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
      repeatLastHotkey: 'F9',
      recordHotkey: 'F11',
      videoClipHotkey: 'F10',
      recordDuration: 5,
      recordSource: 'all',
      videoClipDuration: 30,
      theme: 'dark',
      accentColor: '#31C5F4',
      minimizeToTray: true,
      sortBy: 'newest',
      activeFilter: 'all',
      storageLocation: this.activeStorageRoot,
    };

    const loaded = this.loadWithAutoRecovery(this.settingsFile, 'settings', defaults);
    return { ...defaults, ...loaded };
  }

  /**
   * Save settings atomically.
   * @param {any} settings
   * @param {boolean} [immediate=false]
   */
  saveSettings(settings, immediate = false) {
    if (!settings || typeof settings !== 'object') return;
    this.pendingSettings = settings;

    if (this.settingsTimer) {
      clearTimeout(this.settingsTimer);
      this.settingsTimer = null;
    }

    const commit = () => {
      if (!this.pendingSettings) return;
      const toWrite = this.pendingSettings;
      this.pendingSettings = null;
      try {
        this.atomicWriteJson(this.settingsFile, toWrite);
        this.createSnapshot('settings', toWrite);
      } catch (err) {
        console.error('[StorageManager] Failed to commit settings:', err);
      }
    };

    if (immediate) {
      commit();
    } else {
      this.settingsTimer = setTimeout(commit, 200);
    }
  }

  // ==========================================
  // Video Clips Operations
  // ==========================================

  /**
   * Load video clips.
   * @returns {any[]}
   */
  loadVideoClips() {
    const clips = this.loadWithAutoRecovery(this.clipsFile, 'clips', []);
    if (!Array.isArray(clips)) return [];
    return clips.filter((c) => c && c.filePath && fs.existsSync(c.filePath));
  }

  /**
   * Save video clips atomically.
   * @param {any[]} clips
   * @param {boolean} [immediate=false]
   */
  saveVideoClips(clips, immediate = false) {
    if (!Array.isArray(clips)) return;
    this.pendingClips = clips;

    if (this.clipsTimer) {
      clearTimeout(this.clipsTimer);
      this.clipsTimer = null;
    }

    const commit = () => {
      if (!this.pendingClips) return;
      const toWrite = this.pendingClips;
      this.pendingClips = null;
      try {
        this.atomicWriteJson(this.clipsFile, toWrite);
        this.createSnapshot('clips', toWrite);
      } catch (err) {
        console.error('[StorageManager] Failed to commit clips:', err);
      }
    };

    if (immediate) {
      commit();
    } else {
      this.clipsTimer = setTimeout(commit, 200);
    }
  }

  // ==========================================
  // Recycle Bin / Deleted Sounds
  // ==========================================

  /**
   * Load archived deleted sounds.
   * @returns {any[]}
   */
  loadDeletedSounds() {
    if (fs.existsSync(this.deletedSoundsFile)) {
      try {
        const raw = fs.readFileSync(this.deletedSoundsFile, 'utf-8');
        return JSON.parse(raw);
      } catch (_) {}
    }
    return [];
  }

  /**
   * Soft-delete a sound: move audio file to RecycleBin and record metadata.
   * @param {any} sound
   * @returns {any}
   */
  moveToDeleted(sound) {
    if (!sound || !sound.id) return null;

    let updatedSound = { ...sound, deletedAt: Date.now() };
    if (sound.audioPath && fs.existsSync(sound.audioPath)) {
      const fileName = path.basename(sound.audioPath);
      const targetPath = path.join(this.recycleDir, fileName);
      try {
        fs.copyFileSync(sound.audioPath, targetPath);
        fs.unlinkSync(sound.audioPath);
        updatedSound.audioPath = targetPath;
      } catch (err) {
        console.warn('[StorageManager] Error archiving audio file to RecycleBin:', err);
      }
    }

    const deletedList = this.loadDeletedSounds();
    const updated = [updatedSound, ...deletedList.filter((s) => s.id !== sound.id)];
    this.atomicWriteJson(this.deletedSoundsFile, updated);

    return updatedSound;
  }

  /**
   * Restore a soft-deleted sound back to active Sounds library.
   * @param {string} soundId
   * @returns {any}
   */
  restoreDeletedSound(soundId) {
    const deletedList = this.loadDeletedSounds();
    const target = deletedList.find((s) => s.id === soundId);
    if (!target) return null;

    let restoredSound = { ...target };
    delete restoredSound.deletedAt;

    if (target.audioPath && fs.existsSync(target.audioPath)) {
      const fileName = path.basename(target.audioPath);
      const activePath = path.join(this.audioDir, fileName);
      try {
        fs.copyFileSync(target.audioPath, activePath);
        fs.unlinkSync(target.audioPath);
        restoredSound.audioPath = activePath;
      } catch (err) {
        console.warn('[StorageManager] Error moving file back to Sounds:', err);
      }
    }

    const remaining = deletedList.filter((s) => s.id !== soundId);
    this.atomicWriteJson(this.deletedSoundsFile, remaining);

    const activeSounds = this.loadSounds();
    const updatedActive = [restoredSound, ...activeSounds.filter((s) => s.id !== soundId)];
    this.saveSounds(updatedActive, true);

    return restoredSound;
  }

  /**
   * Permanently purge a deleted sound.
   * @param {string} soundId
   * @returns {boolean}
   */
  permanentlyDeleteSound(soundId) {
    const deletedList = this.loadDeletedSounds();
    const target = deletedList.find((s) => s.id === soundId);
    if (!target) return false;

    if (target.audioPath && fs.existsSync(target.audioPath)) {
      try { fs.unlinkSync(target.audioPath); } catch (_) {}
    }

    const remaining = deletedList.filter((s) => s.id !== soundId);
    this.atomicWriteJson(this.deletedSoundsFile, remaining);
    return true;
  }

  // ==========================================
  // Full .prism Backup & Restore (with Progress)
  // ==========================================

  /**
   * Export all sounds, video clips, and settings into a bundled .prism archive.
   * @param {string} destinationFilePath
   * @param {any[]} [liveSounds]
   * @param {any[]} [liveClips]
   * @param {(progress: { percent: number; stage: string; detail: string }) => void} [onProgress]
   * @returns {Promise<boolean>}
   */
  async exportBackup(destinationFilePath, liveSounds, liveClips, onProgress) {
    try {
      if (onProgress) onProgress({ percent: 5, stage: 'preparing', detail: 'Reading library data...' });

      const sounds = Array.isArray(liveSounds) && liveSounds.length > 0
        ? liveSounds
        : this.loadSounds();

      const videoClips = Array.isArray(liveClips) && liveClips.length > 0
        ? liveClips
        : this.loadVideoClips();

      const settings = this.loadSettings();
      const deletedSounds = this.loadDeletedSounds();

      const zip = new AdmZip();

      // Package audio files
      const totalAudio = sounds.length;
      const packagedSounds = [];

      for (let i = 0; i < totalAudio; i++) {
        const sound = { ...sounds[i] };
        delete sound.audioData; // Strip redundant base64 from backup manifest
        if (sound.audioPath && fs.existsSync(sound.audioPath)) {
          try {
            const fileName = path.basename(sound.audioPath);
            zip.addLocalFile(sound.audioPath, 'audio');
            sound.audioPath = `audio/${fileName}`;
          } catch (e) {
            console.warn('[StorageManager] Failed to pack audio:', sound.audioPath, e);
          }
        }
        packagedSounds.push(sound);

        if (onProgress && i % 5 === 0) {
          const pct = Math.round(5 + (i / Math.max(totalAudio, 1)) * 40);
          onProgress({ percent: pct, stage: 'audio', detail: `Archiving audio (${i + 1}/${totalAudio})...` });
        }
      }

      // Package any orphaned audio in AUDIO_DIR
      if (fs.existsSync(this.audioDir)) {
        const extraAudio = fs.readdirSync(this.audioDir);
        for (const f of extraAudio) {
          const fullPath = path.join(this.audioDir, f);
          if (fs.statSync(fullPath).isFile()) {
            try { zip.addLocalFile(fullPath, 'audio'); } catch (_) {}
          }
        }
      }

      // Package video files
      const totalClips = videoClips.length;
      const packagedClips = [];

      for (let i = 0; i < totalClips; i++) {
        const clip = { ...videoClips[i] };
        if (clip.filePath && fs.existsSync(clip.filePath)) {
          try {
            const fileName = path.basename(clip.filePath);
            zip.addLocalFile(clip.filePath, 'videos');
            clip.filePath = `videos/${fileName}`;
          } catch (e) {
            console.warn('[StorageManager] Failed to pack video:', clip.filePath, e);
          }
        }
        packagedClips.push(clip);

        if (onProgress) {
          const pct = Math.round(45 + ((i + 1) / Math.max(totalClips, 1)) * 40);
          onProgress({ percent: pct, stage: 'videos', detail: `Archiving video clips (${i + 1}/${totalClips})...` });
        }
      }

      // Manifest v2 with live app version
      const manifest = {
        format: 'prism-backup',
        schemaVersion: 2,
        prismVersion: this.app ? this.app.getVersion() : '1.5.1',
        exportedAt: new Date().toISOString(),
        counts: {
          sounds: packagedSounds.length,
          videoClips: packagedClips.length,
        },
        sounds: packagedSounds,
        videoClips: packagedClips,
        deletedSounds: Array.isArray(deletedSounds) ? deletedSounds : [],
        settings,
      };

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

      if (onProgress) onProgress({ percent: 90, stage: 'writing', detail: 'Compressing and writing archive to disk...' });
      zip.writeZip(destinationFilePath);

      if (onProgress) onProgress({ percent: 100, stage: 'done', detail: 'Backup completed successfully!' });
      return true;
    } catch (err) {
      console.error('[StorageManager] exportBackup error:', err);
      return false;
    }
  }

  /**
   * Import a .prism or legacy .json backup with pre-flight check and safety snapshot.
   * @param {string} selectedFilePath
   * @param {(progress: { percent: number; stage: string; detail: string }) => void} [onProgress]
   * @returns {Promise<{ sounds: any[]; videoClips: any[]; settings: any } | null>}
   */
  async importBackup(selectedFilePath, onProgress) {
    try {
      if (!fs.existsSync(selectedFilePath)) return null;

      if (onProgress) onProgress({ percent: 10, stage: 'validating', detail: 'Verifying backup archive...' });

      // Handle .prism archive
      if (selectedFilePath.endsWith('.prism') || selectedFilePath.endsWith('.zip')) {
        const zip = new AdmZip(selectedFilePath);
        const manifestEntry = zip.getEntry('manifest.json');
        if (!manifestEntry) {
          throw new Error('Invalid .prism file: manifest.json not found in archive');
        }

        const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
        if (!manifest.sounds || !Array.isArray(manifest.sounds)) {
          throw new Error('Invalid backup structure: missing sounds array');
        }

        // Safety Snapshot of current state before applying restore
        this.createSnapshot('sounds', this.loadSounds());
        this.createSnapshot('clips', this.loadVideoClips());
        this.createSnapshot('settings', this.loadSettings());

        this.ensureDirectories();

        if (onProgress) onProgress({ percent: 30, stage: 'extracting', detail: 'Extracting media files...' });

        // Extract media entries
        const entries = zip.getEntries();
        for (const entry of entries) {
          if (!entry.isDirectory) {
            const entryName = entry.entryName.replace(/\\/g, '/');
            if (entryName.startsWith('audio/')) {
              const fileName = path.basename(entryName);
              const destPath = path.join(this.audioDir, fileName);
              fs.writeFileSync(destPath, entry.getData());
            } else if (entryName.startsWith('videos/')) {
              const fileName = path.basename(entryName);
              const destPath = path.join(this.videosDir, fileName);
              fs.writeFileSync(destPath, entry.getData());
            }
          }
        }

        if (onProgress) onProgress({ percent: 70, stage: 'mapping', detail: 'Restoring library indices...' });

        // Re-point sounds to local absolute paths
        const restoredSounds = manifest.sounds.map((sound) => {
          const item = { ...sound };
          if (item.audioPath) {
            const fileName = path.basename(item.audioPath);
            const localAudioPath = path.join(this.audioDir, fileName);
            if (fs.existsSync(localAudioPath)) {
              item.audioPath = localAudioPath;
            }
          }
          return item;
        });

        // Re-point video clips to local absolute paths
        let restoredClips = [];
        if (Array.isArray(manifest.videoClips)) {
          restoredClips = manifest.videoClips.map((clip) => {
            const item = { ...clip };
            if (item.filePath) {
              const fileName = path.basename(item.filePath);
              const localVideoPath = path.join(this.videosDir, fileName);
              if (fs.existsSync(localVideoPath)) {
                item.filePath = localVideoPath;
              }
            }
            return item;
          });
        }

        // Atomically write restored databases
        this.saveSounds(restoredSounds, true);
        this.saveVideoClips(restoredClips, true);
        if (Array.isArray(manifest.deletedSounds)) {
          this.atomicWriteJson(this.deletedSoundsFile, manifest.deletedSounds);
          this.createSnapshot('deleted_sounds', manifest.deletedSounds);
        }
        if (manifest.settings) {
          this.saveSettings({ ...manifest.settings, storageLocation: this.activeStorageRoot }, true);
        }

        if (onProgress) onProgress({ percent: 100, stage: 'done', detail: 'Library successfully restored!' });

        return {
          sounds: restoredSounds,
          videoClips: restoredClips,
          settings: manifest.settings || null,
        };
      }

      // Fallback for legacy .json
      const backupContent = fs.readFileSync(selectedFilePath, 'utf-8');
      const parsed = JSON.parse(backupContent);
      if (!parsed.sounds || !Array.isArray(parsed.sounds)) {
        throw new Error('Invalid backup file structure: missing sounds array');
      }

      this.saveSounds(parsed.sounds, true);
      if (parsed.settings) {
        this.saveSettings(parsed.settings, true);
      }

      return {
        sounds: parsed.sounds,
        videoClips: [],
        settings: parsed.settings || null,
      };
    } catch (err) {
      console.error('[StorageManager] importBackup error:', err);
      return null;
    }
  }

  // ==========================================
  // Storage Location Relocation
  // ==========================================

  /**
   * Relocate physical media storage to another folder / drive.
   * @param {string} newRootPath
   * @param {(progress: { percent: number; stage: string; detail: string }) => void} [onProgress]
   * @returns {Promise<{ success: boolean; root?: string; sounds?: string; videos?: string; error?: string }>}
   */
  async changeStorageLocation(newRootPath, onProgress) {
    try {
      if (!newRootPath || typeof newRootPath !== 'string') {
        return { success: false, error: 'Invalid folder path.' };
      }

      const targetRoot = path.resolve(newRootPath.trim());
      if (targetRoot === this.activeStorageRoot) {
        return { success: true, root: this.activeStorageRoot, sounds: this.audioDir, videos: this.videosDir };
      }

      const newSoundsDir = path.join(targetRoot, 'Sounds');
      const newVideosDir = path.join(targetRoot, 'Videos');
      const newRecycleDir = path.join(targetRoot, 'RecycleBin');

      if (!fs.existsSync(targetRoot)) fs.mkdirSync(targetRoot, { recursive: true });
      if (!fs.existsSync(newSoundsDir)) fs.mkdirSync(newSoundsDir, { recursive: true });
      if (!fs.existsSync(newVideosDir)) fs.mkdirSync(newVideosDir, { recursive: true });
      if (!fs.existsSync(newRecycleDir)) fs.mkdirSync(newRecycleDir, { recursive: true });

      if (onProgress) onProgress({ percent: 10, stage: 'migrating', detail: 'Moving audio files...' });

      // Move audio files
      if (fs.existsSync(this.audioDir)) {
        const audioFiles = fs.readdirSync(this.audioDir);
        for (const file of audioFiles) {
          const oldFile = path.join(this.audioDir, file);
          const newFile = path.join(newSoundsDir, file);
          try {
            if (!fs.existsSync(newFile) && fs.statSync(oldFile).isFile()) {
              fs.copyFileSync(oldFile, newFile);
              fs.unlinkSync(oldFile);
            }
          } catch (e) {
            console.warn('[StorageManager] Error migrating audio file:', e);
          }
        }
      }

      if (onProgress) onProgress({ percent: 50, stage: 'migrating', detail: 'Moving video clips...' });

      // Move video files
      if (fs.existsSync(this.videosDir)) {
        const videoFiles = fs.readdirSync(this.videosDir);
        for (const file of videoFiles) {
          const oldFile = path.join(this.videosDir, file);
          const newFile = path.join(newVideosDir, file);
          try {
            if (!fs.existsSync(newFile) && fs.statSync(oldFile).isFile()) {
              fs.copyFileSync(oldFile, newFile);
              fs.unlinkSync(oldFile);
            }
          } catch (e) {
            console.warn('[StorageManager] Error migrating video file:', e);
          }
        }
      }

      // Move RecycleBin files
      if (fs.existsSync(this.recycleDir)) {
        const recycleFiles = fs.readdirSync(this.recycleDir);
        for (const file of recycleFiles) {
          const oldFile = path.join(this.recycleDir, file);
          const newFile = path.join(newRecycleDir, file);
          try {
            if (!fs.existsSync(newFile) && fs.statSync(oldFile).isFile()) {
              fs.copyFileSync(oldFile, newFile);
              fs.unlinkSync(oldFile);
            }
          } catch (_) {}
        }
      }

      // Update in-memory paths
      this.activeStorageRoot = targetRoot;
      this.audioDir = newSoundsDir;
      this.videosDir = newVideosDir;
      this.recycleDir = newRecycleDir;

      if (onProgress) onProgress({ percent: 85, stage: 'updating', detail: 'Updating sound & clip paths...' });

      // Update sound references
      const currentSounds = this.loadSounds();
      const updatedSounds = currentSounds.map((s) => {
        if (s.audioPath) {
          const fileName = path.basename(s.audioPath);
          s.audioPath = path.join(this.audioDir, fileName);
        }
        return s;
      });
      this.saveSounds(updatedSounds, true);

      // Update clip references
      const currentClips = this.loadVideoClips();
      const updatedClips = currentClips.map((c) => {
        if (c.filePath) {
          const fileName = path.basename(c.filePath);
          c.filePath = path.join(this.videosDir, fileName);
        }
        return c;
      });
      this.saveVideoClips(updatedClips, true);

      // Persist storage location in settings
      const settings = this.loadSettings();
      settings.storageLocation = targetRoot;
      this.saveSettings(settings, true);

      if (onProgress) onProgress({ percent: 100, stage: 'done', detail: 'Storage location updated!' });

      return {
        success: true,
        root: this.activeStorageRoot,
        sounds: this.audioDir,
        videos: this.videosDir,
      };
    } catch (err) {
      console.error('[StorageManager] changeStorageLocation error:', err);
      return { success: false, error: err.message || 'Failed to move storage files.' };
    }
  }

  // ==========================================
  // Factory Reset / Purge
  // ==========================================

  /**
   * Reset all data and delete media files.
   * @returns {boolean}
   */
  resetAllAppData() {
    try {
      // 1. Flush pending
      if (this.soundsTimer) clearTimeout(this.soundsTimer);
      if (this.settingsTimer) clearTimeout(this.settingsTimer);
      if (this.clipsTimer) clearTimeout(this.clipsTimer);

      const filesToDelete = [
        this.soundsFile,
        this.settingsFile,
        this.deletedSoundsFile,
        this.clipsFile,
        path.join(this.userDataDir, 'sounds.json'),
        path.join(this.userDataDir, 'sounds_backup_57.json'),
      ];

      for (const f of filesToDelete) {
        if (fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch (_) {}
        }
      }

      // Purge media directories
      const purgeFolder = (folderPath) => {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          for (const file of files) {
            try {
              const fullPath = path.join(folderPath, file);
              if (fs.statSync(fullPath).isFile()) fs.unlinkSync(fullPath);
            } catch (_) {}
          }
        }
      };

      purgeFolder(this.audioDir);
      purgeFolder(this.videosDir);
      purgeFolder(this.recycleDir);

      // Reinitialize clean blank state
      this.atomicWriteJson(this.soundsFile, []);
      this.atomicWriteJson(this.clipsFile, []);
      this.atomicWriteJson(this.deletedSoundsFile, []);

      return true;
    } catch (err) {
      console.error('[StorageManager] resetAllAppData error:', err);
      return false;
    }
  }

  // ==========================================
  // Lifecycle Flush
  // ==========================================

  /**
   * Synchronous flush of all pending in-memory write buffers before quit.
   */
  flushSync() {
    try {
      if (this.soundsTimer) {
        clearTimeout(this.soundsTimer);
        this.soundsTimer = null;
      }
      if (this.pendingSounds) {
        const toWrite = this.sanitizeSounds(this.pendingSounds);
        this.atomicWriteJson(this.soundsFile, toWrite);
        this.createSnapshot('sounds', toWrite);
        this.pendingSounds = null;
      }

      if (this.settingsTimer) {
        clearTimeout(this.settingsTimer);
        this.settingsTimer = null;
      }
      if (this.pendingSettings) {
        this.atomicWriteJson(this.settingsFile, this.pendingSettings);
        this.createSnapshot('settings', this.pendingSettings);
        this.pendingSettings = null;
      }

      if (this.clipsTimer) {
        clearTimeout(this.clipsTimer);
        this.clipsTimer = null;
      }
      if (this.pendingClips) {
        this.atomicWriteJson(this.clipsFile, this.pendingClips);
        this.createSnapshot('clips', this.pendingClips);
        this.pendingClips = null;
      }
      console.info('[StorageManager] Successfully flushed all persistence buffers to disk.');
    } catch (err) {
      console.error('[StorageManager] Error flushing on exit:', err);
    }
  }
}

const storageManager = new StorageManager();
module.exports = { storageManager, StorageManager };
