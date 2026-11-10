import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { CommandBar } from './components/CommandBar';
import { SoundCard } from './components/SoundCard';
import { ControlPanel } from './components/ControlPanel';
import { BottomToolbar } from './components/BottomToolbar';
import { YouTubeSearchModal } from './components/YouTubeSearchModal';
import { AudioTrimmerModal } from './components/AudioTrimmerModal';
import { SettingsModal } from './components/SettingsModal';
import { DeleteConfirmationModal } from './components/DeleteConfirmationModal';
import { RestoreDeletedModal } from './components/RestoreDeletedModal';
import { EditSoundModal } from './components/EditSoundModal';
import { InGameOverlayModal } from './components/InGameOverlayModal';
import { audioEngine } from './services/audioEngine';
import { SoundItem, AudioSettings, YouTubeSearchResult } from './types';
import { SortOption } from './components/CommandBar';
import { getTheme, applyThemeToDom } from './themes';
import { Plus } from 'lucide-react';

const DEFAULT_SETTINGS: AudioSettings = {
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
  recordSource: 'screen',
  theme: 'dark',
  accentColor: '#38bdf8',
  minimizeToTray: true,
  sortBy: 'newest',
  activeFilter: 'all',
};

export const App: React.FC = () => {
  const isStandaloneOverlay = useMemo(() => {
    return new URLSearchParams(window.location.search).get('overlay') === 'true';
  }, []);
  const [sounds, setSounds] = useState<SoundItem[]>([]);
  const [deletedSounds, setDeletedSounds] = useState<SoundItem[]>([]);
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [activeSoundIds, setActiveSoundIds] = useState<string[]>([]);
  const [pausedSoundIds, setPausedSoundIds] = useState<string[]>([]);
  const [playbackProgressMap, setPlaybackProgressMap] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'clips' | 'youtube' | 'favorites'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [listeningSoundId, setListeningSoundId] = useState<string | null>(null);
  const [draggedSoundId, setDraggedSoundId] = useState<string | null>(null);
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [pointerDragSound, setPointerDragSound] = useState<SoundItem | null>(null);
  const [pointerDragRect, setPointerDragRect] = useState<{ width: number; height: number } | null>(null);
  const [pointerDragOffset, setPointerDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pointerCurrentPos, setPointerCurrentPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [stopAllFlash, setStopAllFlash] = useState(false);
  const flashTimerRef = useRef<any>(null);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(0);

  // Pointer drag refs for fluid real-time drag-to-rearrange
  const isPointerDraggingRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerSoundRef = useRef<SoundItem | null>(null);
  const dragRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTargetSwapRef = useRef<string | null>(null);
  const justFinishedDragRef = useRef(false);

  // Modals state
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTrimmerModalOpen, setIsTrimmerModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  // Synchronize audio engine with active state and real-time mic meter (MAIN WINDOW ONLY)
  useEffect(() => {
    if (isStandaloneOverlay) return;

    audioEngine.init();

    const unsubscribeState = audioEngine.subscribe(() => {
      const activeIds = audioEngine.getActiveSoundIds();
      const pausedIds = audioEngine.getPausedSoundIds();
      setActiveSoundIds(activeIds);
      setPausedSoundIds(pausedIds);
      if (window.soundboardAPI?.sendIpcCommand) {
        window.soundboardAPI.sendIpcCommand('sync-active-sounds', activeIds);
        window.soundboardAPI.sendIpcCommand('sync-paused-sounds', pausedIds);
      }
    });

    const unsubscribeMic = audioEngine.onMicLevel((level) => {
      setMicLevel(level);
    });

    const handleUnload = () => {
      audioEngine.cleanup();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      unsubscribeState();
      unsubscribeMic();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isStandaloneOverlay]);

  // Live playback progress polling loop (throttled smoothly at ~15fps when sounds are playing to prevent overlay lag)
  useEffect(() => {
    let intervalId: any;
    if (activeSoundIds.length > 0) {
      intervalId = setInterval(() => {
        const progress = audioEngine.getAllPlaybackProgress();
        setPlaybackProgressMap((prev) => {
          let changed = false;
          for (const key of Object.keys(progress)) {
            if (Math.abs((prev[key] || 0) - progress[key]) > 0.005) {
              changed = true;
              break;
            }
          }
          return changed ? progress : prev;
        });

        if (window.soundboardAPI?.sendIpcCommand && !isStandaloneOverlay) {
          window.soundboardAPI.sendIpcCommand('sync-progress-map', progress);
        }
      }, 66);
    } else {
      setPlaybackProgressMap({});
      if (window.soundboardAPI?.sendIpcCommand && !isStandaloneOverlay) {
        window.soundboardAPI.sendIpcCommand('sync-progress-map', {});
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSoundIds.length, isStandaloneOverlay]);

  const currentTheme = useMemo(() => {
    return getTheme(settings.theme, settings.accentColor);
  }, [settings.theme, settings.accentColor]);

  // Update dynamic CSS theme variables and accent
  useEffect(() => {
    applyThemeToDom(currentTheme);
  }, [currentTheme]);

  // Load persistence, auto-lock physical microphone, and register hotkeys
  useEffect(() => {
    const initData = async () => {
      if (window.soundboardAPI) {
        // In standalone overlay, only load settings and sounds for UI display; audio runs in main window
        if (isStandaloneOverlay) {
          try {
            const savedSettings = await window.soundboardAPI.loadSettings();
            if (savedSettings) {
              const themeDef = getTheme(savedSettings.theme, savedSettings.accentColor);
              setSettings({
                ...DEFAULT_SETTINGS,
                ...savedSettings,
                theme: themeDef.id,
                accentColor: themeDef.accent,
              });
              if (savedSettings.sortBy) setSortBy(savedSettings.sortBy);
              if (savedSettings.activeFilter) setActiveFilter(savedSettings.activeFilter);
            }
            const savedSounds = await window.soundboardAPI.loadSounds();
            if (savedSounds && savedSounds.length > 0) {
              setSounds(savedSounds.filter((s) => s.audioData || s.audioPath));
            }
            // Request latest live playback status and active sounds from main window
            window.soundboardAPI?.sendIpcCommand?.('request-sync-from-main');
          } catch (e) {}
          return;
        }

        // Load Settings
        const savedSettings = await window.soundboardAPI.loadSettings();
        let effectiveSettings = savedSettings ? { ...DEFAULT_SETTINGS, ...savedSettings } : DEFAULT_SETTINGS;

        const themeDef = getTheme(savedSettings?.theme, savedSettings?.accentColor);
        effectiveSettings = {
          ...effectiveSettings,
          theme: themeDef.id,
          accentColor: themeDef.accent,
        };

        // Clean up any invalid values
        if (effectiveSettings.primaryDeviceId === 'communications') {
          effectiveSettings.primaryDeviceId = 'default';
        }

        // 1. Output Virtual Cable pipe (guaranteed dedicated hardware GUID, never 'default' or 'communications')
        const cableId = await audioEngine.findCableInputDeviceId();
        if (cableId) {
          effectiveSettings = {
            ...effectiveSettings,
            secondaryDeviceId: cableId,
          };
        }

        // 2. Physical Microphone (Strictly real hardware HyperX SoloCast, never virtual CABLE Output)
        const realMic = await audioEngine.findRealPhysicalMicId();
        if (realMic) {
          effectiveSettings = {
            ...effectiveSettings,
            inputDeviceId: realMic,
          };
        }

        // 3. Physical Speakers / Headphones (Strictly real headset, never virtual cable)
        const realSpeaker = await audioEngine.findPhysicalSpeakerId();
        if ((!effectiveSettings.primaryDeviceId || effectiveSettings.primaryDeviceId === 'default') && realSpeaker) {
          effectiveSettings = {
            ...effectiveSettings,
            primaryDeviceId: realSpeaker,
          };
        }

        window.soundboardAPI.saveSettings(effectiveSettings);

        setSettings(effectiveSettings);
        if (effectiveSettings.sortBy) setSortBy(effectiveSettings.sortBy);
        if (effectiveSettings.activeFilter) setActiveFilter(effectiveSettings.activeFilter);
        await audioEngine.updateSettings(effectiveSettings);

        // Load Sounds
        let savedSounds = await window.soundboardAPI.loadSounds();
        if (savedSounds && savedSounds.length > 0) {
          savedSounds = savedSounds.filter((s) => s.audioData || s.audioPath);
          setSounds(savedSounds);
          setSelectedSoundId(savedSounds[0].id);

          // Register hotkeys
          savedSounds.forEach((s) => {
            if (s.hotkey) {
              window.soundboardAPI?.registerGlobalHotkey(s.hotkey, s.id);
            }
          });
        }

        // Load Deleted Sounds
        if (window.soundboardAPI?.loadDeletedSounds) {
          const savedDeleted = await window.soundboardAPI.loadDeletedSounds();
          if (savedDeleted && Array.isArray(savedDeleted)) {
            setDeletedSounds(savedDeleted);
          }
        }
      }
    };

    initData();
  }, []);

  const soundsRef = useRef(sounds);
  useEffect(() => {
    soundsRef.current = sounds;
  }, [sounds]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Dedicated single global hotkey listener with debouncing
  useEffect(() => {
    if (!window.soundboardAPI) return;

    let lastTriggerTime = 0;
    let lastSoundId = '';

    const cleanupHotkeys = window.soundboardAPI.onGlobalHotkeyTriggered((soundId) => {
      // If user is currently typing in an input or textarea inside the soundboard, do not trigger sound
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastTriggerTime < 250 && lastSoundId === soundId) {
        return; // Debounce rapid repeat key triggers
      }
      lastTriggerTime = now;
      lastSoundId = soundId;

      const currentList = soundsRef.current;
      const target = currentList.find((s) => s.id === soundId);
      if (target) {
        setSelectedSoundId(target.id);
        audioEngine.triggerSound(target, currentList);
      }
    });

    const cleanupPanic = window.soundboardAPI.onPanicHotkeyTriggered(() => {
      handleStopAll();
    });

    const cleanupRepeatLast = window.soundboardAPI.onRepeatLastHotkeyTriggered
      ? window.soundboardAPI.onRepeatLastHotkeyTriggered(() => {
          const lastId = lastPlayedSoundIdRef.current;
          if (lastId) {
            const soundToRepeat = soundsRef.current.find((s) => s.id === lastId);
            if (soundToRepeat) {
              setSelectedSoundId(soundToRepeat.id);
              audioEngine.triggerSound(soundToRepeat, soundsRef.current);
            }
          }
        })
      : () => {};

    const cleanupOverlay = window.soundboardAPI.onOverlayHotkeyTriggered
      ? window.soundboardAPI.onOverlayHotkeyTriggered(() => {
          setIsOverlayOpen((prev) => !prev);
        })
      : () => {};

    const cleanupRecord = window.soundboardAPI.onRecordHotkeyTriggered
      ? window.soundboardAPI.onRecordHotkeyTriggered(() => {
          handleStartRecordClip();
        })
      : () => {};

    // Listen for cross-window synchronized state (Overlay <-> Main)
    const cleanupActiveSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('active-sounds-updated', (activeIds: string[]) => {
          setActiveSoundIds(activeIds);
          if (activeIds && activeIds.length > 0) {
            setSelectedSoundId(activeIds[activeIds.length - 1]);
          }
        })
      : () => {};

    const cleanupPausedSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('paused-sounds-updated', (pausedIds: string[]) => {
          setPausedSoundIds(pausedIds);
        })
      : () => {};

    const cleanupSettingsSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('settings-sync', (newSettings: AudioSettings) => {
          setSettings(newSettings);
          audioEngine.updateSettings(newSettings);
        })
      : () => {};

    const cleanupProgressSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('progress-map-updated', (progMap: Record<string, number>) => {
          setPlaybackProgressMap(progMap);
        })
      : () => {};

    const cleanupSoundsSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('sounds-updated', (newSounds: SoundItem[]) => {
          setSounds(newSounds);
        })
      : () => {};

    const cleanupLiveVolumeSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-sound-volume-updated', ({ soundId, volume }: { soundId: string; volume: number }) => {
          audioEngine.setSoundVolume(soundId, volume);
          setSounds((prev) => prev.map((s) => (s.id === soundId ? { ...s, volume } : s)));
        })
      : () => {};

    const cleanupLiveSpeedSync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-sound-speed-updated', ({ soundId, speed }: { soundId: string; speed: number }) => {
          audioEngine.setSoundSpeed(soundId, speed);
          setSounds((prev) => prev.map((s) => (s.id === soundId ? { ...s, speed } : s)));
        })
      : () => {};

    const cleanupLiveSeek = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-seek-sound', ({ soundId, progress }: { soundId: string; progress: number }) => {
          audioEngine.seekSound(soundId, progress);
        })
      : () => {};

    const cleanupLiveSkip = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-skip-sound', ({ soundId, deltaSeconds }: { soundId: string; deltaSeconds: number }) => {
          audioEngine.skipSound(soundId, deltaSeconds);
        })
      : () => {};

    const cleanupLiveTogglePause = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-toggle-pause-sound', (soundId: string) => {
          audioEngine.togglePlayPauseSound(soundId);
          const updatedPausedIds = audioEngine.getPausedSoundIds();
          setPausedSoundIds(updatedPausedIds);
          if (window.soundboardAPI?.sendIpcCommand) {
            window.soundboardAPI.sendIpcCommand('sync-paused-sounds', updatedPausedIds);
          }
        })
      : () => {};

    const cleanupOpenAddModal = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('open-add-sound-modal', () => {
          setIsYouTubeModalOpen(true);
        })
      : () => {};

    const cleanupRequestOverlaySync = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('request-overlay-sync', () => {
          if (!isStandaloneOverlay) {
            const activeIds = audioEngine.getActiveSoundIds();
            const pausedIds = audioEngine.getPausedSoundIds();
            const progress = audioEngine.getAllPlaybackProgress();
            window.soundboardAPI?.sendIpcCommand?.('sync-active-sounds', activeIds);
            window.soundboardAPI?.sendIpcCommand?.('sync-paused-sounds', pausedIds);
            window.soundboardAPI?.sendIpcCommand?.('sync-progress-map', progress);
            window.soundboardAPI?.sendIpcCommand?.('sync-sounds-updated', soundsRef.current);
            window.soundboardAPI?.sendIpcCommand?.('sync-settings-changed', settingsRef.current);
          }
        })
      : () => {};

    const cleanupTriggerClip = window.soundboardAPI.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('trigger-record-clip', () => {
          if (!isStandaloneOverlay) {
            handleStartRecordClip();
          }
        })
      : () => {};

    return () => {
      cleanupHotkeys();
      cleanupPanic();
      cleanupRepeatLast();
      cleanupOverlay();
      cleanupRecord();
      cleanupTriggerClip();
      cleanupActiveSync();
      cleanupPausedSync();
      cleanupSettingsSync();
      cleanupProgressSync();
      cleanupSoundsSync();
      cleanupLiveVolumeSync();
      cleanupLiveSpeedSync();
      cleanupLiveSeek();
      cleanupLiveSkip();
      cleanupLiveTogglePause();
      cleanupOpenAddModal();
      cleanupRequestOverlaySync();
    };
  }, [isStandaloneOverlay]);

  // Fluid Real-Time Drag-To-Rearrange Pointer Listeners
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!pointerStartRef.current || !activePointerSoundRef.current) return;

      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y
      );

      // Distance Threshold: 4px
      if (!isPointerDraggingRef.current && dist > 4) {
        isPointerDraggingRef.current = true;
        setIsPointerDragging(true);
        setPointerDragSound(activePointerSoundRef.current);
        setPointerDragRect(dragRectRef.current);
        setPointerDragOffset(dragOffsetRef.current);
        setDraggedSoundId(activePointerSoundRef.current.id);
        lastTargetSwapRef.current = activePointerSoundRef.current.id;

        document.body.style.cursor = 'grabbing';
      }

      if (isPointerDraggingRef.current) {
        setPointerCurrentPos({ x: e.clientX, y: e.clientY });

        // Piercing Hit-Testing
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        let targetId: string | null = null;
        for (const el of elements) {
          const card = el.closest('[data-sound-id]');
          if (card) {
            targetId = card.getAttribute('data-sound-id');
            break;
          }
        }

        // Live Array Splice
        if (targetId && activePointerSoundRef.current) {
          const currentDraggedId = activePointerSoundRef.current.id;

          if (targetId !== currentDraggedId && lastTargetSwapRef.current !== targetId) {
            lastTargetSwapRef.current = targetId;

            setSounds((prevSounds) => {
              const srcIdx = prevSounds.findIndex((s) => s.id === currentDraggedId);
              const tgtIdx = prevSounds.findIndex((s) => s.id === targetId);
              if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return prevSounds;

              const next = [...prevSounds];
              const [movedItem] = next.splice(srcIdx, 1);
              next.splice(tgtIdx, 0, movedItem);
              return next;
            });
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (isPointerDraggingRef.current && activePointerSoundRef.current) {
        justFinishedDragRef.current = true;
        setTimeout(() => {
          justFinishedDragRef.current = false;
        }, 250);

        setSounds((currentSounds) => {
          updateAndSaveSounds(currentSounds);
          return currentSounds;
        });

        // Automatically switch sorting to 'custom' and persist it
        setSortBy('custom');
        setSettings((prev) => {
          const updated = { ...prev, sortBy: 'custom' as const };
          if (window.soundboardAPI?.saveSettings) {
            window.soundboardAPI.saveSettings(updated);
          }
          return updated;
        });
      }

      // Cleanup
      pointerStartRef.current = null;
      activePointerSoundRef.current = null;
      dragRectRef.current = null;
      lastTargetSwapRef.current = null;
      isPointerDraggingRef.current = false;
      document.body.style.cursor = '';
      setIsPointerDragging(false);
      setPointerDragSound(null);
      setPointerDragRect(null);
      setDraggedSoundId(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true });
    window.addEventListener('mouseup', handlePointerUp, { capture: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('pointercancel', handlePointerUp, { capture: true });
      window.removeEventListener('mouseup', handlePointerUp, { capture: true });
    };
  }, []);

  // Inline Hotkey Recorder Listener (Changes 'Add shortcut' to 'Listening...')
  useEffect(() => {
    if (!listeningSoundId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Cancel on Escape
      if (e.key === 'Escape') {
        setListeningSoundId(null);
        return;
      }

      // Ignore lone modifier keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let key = e.key;
      if (e.code.startsWith('Numpad')) {
        const num = e.code.replace('Numpad', '');
        key = `Num ${num}`;
      } else if (key === ' ') {
        key = 'Space';
      } else if (key.length === 1) {
        key = key.toUpperCase();
      }

      parts.push(key);
      const combo = parts.join('+');

      const target = soundsRef.current.find((s) => s.id === listeningSoundId);
      if (target) {
        handleUpdateSound({
          ...target,
          hotkey: combo,
        });
      }

      setListeningSoundId(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningSoundId]);

  // Window-level keydown listener for Stop All shortcut (guaranteed to work inside app even with no sounds playing)
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if user is actively typing in text inputs or textareas
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (listeningSoundId) return;

      const panic = (settings.panicHotkey || 'Escape').trim().toLowerCase();
      const pressedKey = e.key.trim().toLowerCase();
      const pressedCode = e.code.trim().toLowerCase();

      const isMatch =
        pressedKey === panic ||
        pressedCode === panic ||
        (panic === 'esc' && pressedKey === 'escape') ||
        (panic === 'escape' && pressedKey === 'escape') ||
        (pressedKey === 'escape' && !settings.panicHotkey);

      if (isMatch) {
        e.preventDefault();
        e.stopPropagation();
        handleStopAll();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [settings.panicHotkey, listeningSoundId]);

  // Sync sounds state with persistence
  const updateAndSaveSounds = (updated: SoundItem[]) => {
    setSounds(updated);
    if (window.soundboardAPI) {
      window.soundboardAPI.saveSounds(updated);
      if (window.soundboardAPI.sendIpcCommand) {
        window.soundboardAPI.sendIpcCommand('sync-sounds-updated', updated);
      }
    }
  };

  const selectedSound = useMemo(() => {
    return sounds.find((s) => s.id === selectedSoundId) || null;
  }, [sounds, selectedSoundId]);

  // Handle single sound update
  const handleUpdateSound = (updatedItem: SoundItem) => {
    const newSounds = sounds.map((s) => (s.id === updatedItem.id ? updatedItem : s));
    updateAndSaveSounds(newSounds);

    // If hotkey was changed, update OS registry
    const old = sounds.find((s) => s.id === updatedItem.id);
    if (old && old.hotkey !== updatedItem.hotkey && window.soundboardAPI) {
      if (old.hotkey) window.soundboardAPI.unregisterGlobalHotkey(old.hotkey);
      if (updatedItem.hotkey) window.soundboardAPI.registerGlobalHotkey(updatedItem.hotkey, updatedItem.id);
    }
  };

  // Handle card pointer down
  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, sound: SoundItem) => {
    if (listeningSoundId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    activePointerSoundRef.current = sound;
    dragRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Play a sound
  const lastPlayedSoundIdRef = useRef<string | null>(null);

  const handlePlaySound = (sound: SoundItem) => {
    setSelectedSoundId(sound.id);
    lastPlayedSoundIdRef.current = sound.id;
    audioEngine.triggerSound(sound, sounds);
  };

  const triggerStopAllFeedback = () => {
    setStopAllFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setStopAllFlash(false);
    }, 450);
  };

  // Stop all sounds
  const handleStopAll = () => {
    triggerStopAllFeedback();
    audioEngine.stopAll();
    setActiveSoundIds([]);
  };

  // Handle YouTube Download
  const handleYouTubeDownload = async (item: YouTubeSearchResult, openTrimmer = false) => {
    if (!window.soundboardAPI) return;

    try {
      const downloaded = await window.soundboardAPI.downloadYouTubeAudio(item.url, item.title);
      const newSound: SoundItem = {
        id: `sound_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        title: downloaded.title,
        author: downloaded.author,
        source: 'youtube',
        audioPath: downloaded.filePath,
        audioData: downloaded.audioData,
        thumbnail: downloaded.thumbnail || item.thumbnail,
        duration: downloaded.duration || item.durationSec || 0,
        hotkey: '',
        volume: 100,
        reproductionMode: 'stop',
        reproductionOptions: {
          stopOtherSounds: true,
          muteOtherSounds: false,
          muteVoice: false,
          loop: false,
        },
        playCount: 0,
        isFavorite: false,
        dateAdded: Date.now(),
      };

      // Always read latest sounds from ref to prevent concurrent downloads overwriting each other
      const currentSounds = soundsRef.current;
      const updatedList = [newSound, ...currentSounds];
      updateAndSaveSounds(updatedList);
      setSelectedSoundId(newSound.id);

      if (openTrimmer) {
        setIsYouTubeModalOpen(false);
        setIsTrimmerModalOpen(true);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Instant Replay Clip of the Last N Seconds
  const handleStartRecordClip = async () => {
    if (isRecordingClip) return;
    const duration = settings.recordDuration || 5;
    setIsRecordingClip(true);

    try {
      // Instantly extracts the previous N seconds from the rolling PCM buffer
      const clip = await audioEngine.clipLastSeconds(duration);
      setIsRecordingClip(false);

      if (window.soundboardAPI?.saveRecordedAudio) {
        const title = `Clipped (${duration}s) ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        const saved = await window.soundboardAPI.saveRecordedAudio({
          base64: clip.base64,
          duration: clip.duration,
          title,
        });

        const newSound: SoundItem = {
          id: `sound_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          title: saved.title,
          author: 'Clipped Moment',
          source: 'clip',
          audioPath: saved.filePath,
          audioData: saved.audioData,
          thumbnail: '',
          duration: saved.duration,
          hotkey: '',
          volume: 125,
          reproductionMode: 'stop',
          reproductionOptions: {
            stopOtherSounds: true,
            muteOtherSounds: false,
            muteVoice: false,
            loop: false,
          },
          playCount: 0,
          isFavorite: false,
          dateAdded: Date.now(),
        };

        const currentSounds = soundsRef.current;
        const updatedList = [newSound, ...currentSounds];
        updateAndSaveSounds(updatedList);
        setSelectedSoundId(newSound.id);
      }
    } catch (err) {
      setIsRecordingClip(false);
      console.error('Clip last seconds failed:', err);
    }
  };

  // Duplicate sound
  const handleDuplicateSound = (soundToDuplicate: SoundItem) => {
    const duplicated: SoundItem = {
      ...soundToDuplicate,
      id: `sound_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      title: `${soundToDuplicate.title} (Copy)`,
      hotkey: '', // Clear hotkey to avoid duplicate key conflicts
      playCount: 0,
      dateAdded: Date.now(),
    };
    const updated = [duplicated, ...soundsRef.current];
    updateAndSaveSounds(updated);
    setSelectedSoundId(duplicated.id);
  };

  // Import local audio files or process dropped file paths
  const handleImportAudioItems = (imported: Array<{ name: string; filePath: string; audioData: string; duration: number }>) => {
    if (!imported || imported.length === 0) return;
    const newItems: SoundItem[] = imported.map((imp) => ({
      id: `sound_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      title: imp.name,
      author: 'Local File',
      source: 'local',
      audioPath: imp.filePath,
      audioData: imp.audioData,
      thumbnail: '',
      duration: imp.duration || 0,
      hotkey: '',
      volume: 100,
      reproductionMode: 'stop',
      reproductionOptions: {
        stopOtherSounds: true,
        muteOtherSounds: false,
        muteVoice: false,
        loop: false,
      },
      playCount: 0,
      isFavorite: false,
      dateAdded: Date.now(),
    }));

    const merged = [...newItems, ...sounds];
    updateAndSaveSounds(merged);
    if (newItems.length > 0) {
      setSelectedSoundId(newItems[0].id);
    }
  };

  const handleImportLocalFiles = async () => {
    if (!window.soundboardAPI) return;
    const imported = await window.soundboardAPI.selectAudioFiles();
    handleImportAudioItems(imported);
  };

  // Delete sound: Moves to deleted folder where it can be restored
  const handleConfirmDelete = async () => {
    if (!selectedSound) return;
    const targetSound = selectedSound;

    // Unregister hotkey
    if (targetSound.hotkey && window.soundboardAPI) {
      window.soundboardAPI.unregisterGlobalHotkey(targetSound.hotkey);
    }

    // Call API to move physical file to deleted folder and record in deleted_sounds.json
    if (window.soundboardAPI?.moveToDeleted) {
      const archived = await window.soundboardAPI.moveToDeleted(targetSound);
      if (archived && typeof archived === 'object') {
        setDeletedSounds((prev) => [archived, ...prev.filter((s) => s.id !== targetSound.id)]);
      }
    } else {
      setDeletedSounds((prev) => [{ ...targetSound, deletedAt: Date.now() }, ...prev]);
    }

    const filtered = sounds.filter((s) => s.id !== targetSound.id);
    updateAndSaveSounds(filtered);
    setSelectedSoundId(filtered.length > 0 ? filtered[0].id : null);
    setIsDeleteModalOpen(false);
  };

  // Restore sound from deleted folder
  const handleRestoreSound = async (soundId: string) => {
    if (window.soundboardAPI?.restoreDeletedSound) {
      const restored = await window.soundboardAPI.restoreDeletedSound(soundId);
      if (restored) {
        setDeletedSounds((prev) => prev.filter((s) => s.id !== soundId));
        setSounds((prev) => [restored, ...prev.filter((s) => s.id !== soundId)]);
        if (restored.hotkey) {
          window.soundboardAPI.registerGlobalHotkey(restored.hotkey, restored.id);
        }
        setSelectedSoundId(restored.id);
      }
    } else {
      const target = deletedSounds.find((s) => s.id === soundId);
      if (target) {
        const restored = { ...target };
        delete restored.deletedAt;
        setDeletedSounds((prev) => prev.filter((s) => s.id !== soundId));
        const updated = [restored, ...sounds.filter((s) => s.id !== soundId)];
        updateAndSaveSounds(updated);
        setSelectedSoundId(restored.id);
      }
    }
  };

  // Permanently delete sound from deleted tab
  const handlePermanentlyDelete = async (soundId: string) => {
    if (window.soundboardAPI?.permanentlyDeleteSound) {
      await window.soundboardAPI.permanentlyDeleteSound(soundId);
    }
    setDeletedSounds((prev) => prev.filter((s) => s.id !== soundId));
  };

  // Trimmer Save
  const handleSaveTrim = (soundId: string, trimStart: number, trimEnd: number) => {
    const target = sounds.find((s) => s.id === soundId);
    if (target) {
      handleUpdateSound({
        ...target,
        trimStart,
        trimEnd,
      });
    }
  };

  // Settings Save
  const handleSaveSettings = (newSettings: AudioSettings) => {
    setSettings(newSettings);
    audioEngine.updateSettings(newSettings);
    if (window.soundboardAPI) {
      window.soundboardAPI.saveSettings(newSettings);
      if (window.soundboardAPI.sendIpcCommand) {
        window.soundboardAPI.sendIpcCommand('sync-settings-changed', newSettings);
      }
    }
  };

  // Toggle Hear Myself
  const handleToggleHearMyself = () => {
    const updated = { ...settings, hearMyself: !settings.hearMyself };
    handleSaveSettings(updated);
  };

  // Toggle Mic Pass-Through
  const handleToggleMicPassThrough = () => {
    const updated = { ...settings, isMicPassThroughEnabled: !settings.isMicPassThroughEnabled };
    handleSaveSettings(updated);
  };

  // Helper to check if a sound came from YouTube
  const isYouTubeSound = (s: SoundItem) => {
    if (s.source === 'youtube') return true;
    if (s.author && (s.author.toLowerCase().includes('youtube') || s.author.toLowerCase().includes('yt'))) return true;
    if (s.thumbnail && (s.thumbnail.includes('ytimg') || s.thumbnail.includes('youtube') || s.thumbnail.includes('ggpht'))) return true;
    return false;
  };

  // Filtered and Sorted sounds
  const filteredSounds = useMemo(() => {
    let result = sounds.filter((s) => {
      const matchSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.author.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchFilter = true;
      if (activeFilter === 'favorites') {
        matchFilter = !!s.isFavorite;
      } else if (activeFilter === 'clips') {
        matchFilter = s.source === 'clip' || s.title.toLowerCase().startsWith('clipped');
      } else if (activeFilter === 'youtube') {
        matchFilter = isYouTubeSound(s);
      }

      return matchSearch && matchFilter;
    });

    // Apply Sorting
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (b.dateAdded || 0) - (a.dateAdded || 0);
        case 'oldest':
          return (a.dateAdded || 0) - (b.dateAdded || 0);
        case 'alphabetical':
          return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
        case 'most_played':
          return (b.playCount || 0) - (a.playCount || 0);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        default:
          return 0;
      }
    });
  }, [sounds, searchQuery, activeFilter, sortBy]);

  if (isStandaloneOverlay) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-transparent flex items-center justify-center p-0 m-0">
        <InGameOverlayModal
          isOpen={true}
          isStandaloneOverlay={true}
          sounds={sounds}
          activeSoundIds={activeSoundIds}
          playbackProgressMap={playbackProgressMap}
          speakerVolume={settings.masterSpeakerVolume}
          micProjectionVolume={settings.micInputVolume}
          hearMyself={settings.hearMyself}
          recordDuration={settings.recordDuration || 5}
          recordSource={settings.recordSource || 'screen'}
          onToggleHearMyself={handleToggleHearMyself}
          onStartRecordClip={() => {
            if (window.soundboardAPI?.sendIpcCommand) {
              window.soundboardAPI.sendIpcCommand('sync-trigger-clip');
            } else {
              handleStartRecordClip();
            }
          }}
          onChangeRecordDuration={(dur) => {
            handleSaveSettings({ ...settings, recordDuration: dur });
          }}
          onChangeRecordSource={(src) => {
            handleSaveSettings({ ...settings, recordSource: src });
          }}
          onPlaySound={(s) => {
            // Send trigger to main window so audio plays through the primary engine and state stays synced
            if (window.soundboardAPI?.sendIpcCommand) {
              window.soundboardAPI.sendIpcCommand('sync-trigger-sound', s.id);
            } else {
              handlePlaySound(s);
            }
          }}
          onStopAll={() => {
            if (window.soundboardAPI?.sendIpcCommand) {
              window.soundboardAPI.sendIpcCommand('sync-stop-all');
            } else {
              handleStopAll();
            }
          }}
          onClose={() => {
            if (window.soundboardAPI?.closeOverlay) {
              window.soundboardAPI.closeOverlay();
            }
          }}
          onSpeakerVolumeChange={(vol) => {
            handleSaveSettings({ ...settings, masterSpeakerVolume: vol, masterMicVolume: vol });
          }}
          onMicProjectionVolumeChange={(vol) => {
            handleSaveSettings({ ...settings, micInputVolume: vol });
          }}
          onReorderSounds={(newSounds) => {
            updateAndSaveSounds(newSounds);
          }}
          onUpdateSound={handleUpdateSound}
          onDeleteSound={(soundId) => {
            const target = sounds.find((s) => s.id === soundId);
            if (target && target.hotkey && window.soundboardAPI) {
              window.soundboardAPI.unregisterGlobalHotkey(target.hotkey);
            }
            const filtered = sounds.filter((s) => s.id !== soundId);
            updateAndSaveSounds(filtered);
            if (selectedSoundId === soundId) {
              setSelectedSoundId(filtered.length > 0 ? filtered[0].id : null);
            }
          }}
          onDownloadSound={async (res) => {
            await handleYouTubeDownload(res);
          }}
          onAddSound={() => {
            if (window.soundboardAPI?.sendIpcCommand) {
              window.soundboardAPI.sendIpcCommand('sync-open-add-sound');
            } else if (window.soundboardAPI?.showMainWindow) {
              window.soundboardAPI.showMainWindow();
              setIsYouTubeModalOpen(true);
            }
          }}
          accentColor={settings.accentColor}
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const paths: string[] = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            let p = '';
            if (window.soundboardAPI?.getFilePathFromDroppedFile) {
              p = window.soundboardAPI.getFilePathFromDroppedFile(f);
            }
            if (!p && (f as any).path) {
              p = (f as any).path;
            }
            if (p) {
              paths.push(p);
            }
          }
          if (paths.length > 0 && window.soundboardAPI?.importAudioFilePaths) {
            const imported = await window.soundboardAPI.importAudioFilePaths(paths);
            handleImportAudioItems(imported);
          }
        }
      }}
      style={{ backgroundColor: currentTheme.bgApp }}
      className="flex flex-col h-screen w-screen overflow-hidden text-white transition-colors duration-200"
    >
      {/* 36px TitleBar */}
      <TitleBar
        accentColor={settings.accentColor}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isMicActive={settings.isMicPassThroughEnabled}
        deletedCount={deletedSounds.length}
        onOpenDeletedArchive={() => setIsRestoreModalOpen(true)}
      />

      {/* Top Command Shelf */}
      <CommandBar
        totalSounds={sounds.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={(f) => {
          setActiveFilter(f as any);
          handleSaveSettings({ ...settings, activeFilter: f as any });
        }}
        sortBy={sortBy}
        onSortChange={(s) => {
          setSortBy(s);
          handleSaveSettings({ ...settings, sortBy: s });
        }}
        deletedCount={deletedSounds.length}
        onOpenDeletedModal={() => setIsRestoreModalOpen(true)}
        onStopAll={handleStopAll}
        hasActiveSounds={activeSoundIds.length > 0}
        activeSoundsCount={activeSoundIds.length}
        isStopAllActive={stopAllFlash}
        onOpenYouTubeSearch={() => setIsYouTubeModalOpen(true)}
        onImportLocalFiles={handleImportLocalFiles}
        accentColor={settings.accentColor}
        panicHotkey={settings.panicHotkey}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        isVirtualActive={!!(settings.secondaryDeviceId && settings.isSecondaryEnabled)}
        micLevel={micLevel}
        micVolume={settings.micInputVolume}
        onMicVolumeChange={(vol) => {
          audioEngine.setMicInputVolume(vol);
          handleSaveSettings({ ...settings, micInputVolume: vol });
        }}
        hearMyself={settings.hearMyself}
        onToggleHearMyself={handleToggleHearMyself}
        isRecording={isRecordingClip}
        recordingSecondsLeft={recordSecondsLeft}
        recordDuration={settings.recordDuration || 5}
        recordSource={settings.recordSource || 'screen'}
        recordHotkey={settings.recordHotkey || 'F9'}
        onStartRecord={handleStartRecordClip}
        onChangeRecordDuration={(dur) => {
          handleSaveSettings({ ...settings, recordDuration: dur });
        }}
        onChangeRecordSource={(src) => {
          handleSaveSettings({ ...settings, recordSource: src });
        }}
      />

      {/* Main Workspace: Left Soundboard Grid + Bottom Toolbar Dock, Right Control Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Responsive Sound Grid + Bottom Dock Toolbar */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={async (e) => {
            // Check if external audio files from Windows explorer were dropped
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              const paths: string[] = [];
              for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const f = e.dataTransfer.files[i];
                let p = '';
                if (window.soundboardAPI?.getFilePathFromDroppedFile) {
                  p = window.soundboardAPI.getFilePathFromDroppedFile(f);
                }
                if (!p && (f as any).path) {
                  p = (f as any).path;
                }
                if (p) {
                  paths.push(p);
                }
              }
              if (paths.length > 0 && window.soundboardAPI?.importAudioFilePaths) {
                const imported = await window.soundboardAPI.importAudioFilePaths(paths);
                handleImportAudioItems(imported);
              }
            }
          }}
          className="relative flex-1 flex flex-col overflow-hidden"
        >
          <main className="flex-1 overflow-y-auto px-5 pt-5 pb-28 select-none">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
              {filteredSounds.map((sound) => (
                <SoundCard
                  key={sound.id}
                  sound={sound}
                  isSelected={selectedSoundId === sound.id}
                  isPlaying={activeSoundIds.includes(sound.id)}
                  playbackProgress={playbackProgressMap[sound.id] || 0}
                  accentColor={settings.accentColor}
                  isListeningHotkey={listeningSoundId === sound.id}
                  isDragging={draggedSoundId === sound.id}
                  onCardPointerDown={handleCardPointerDown}
                  onSelect={() => {
                    if (justFinishedDragRef.current || isPointerDraggingRef.current) return;
                    setSelectedSoundId(sound.id);
                  }}
                  onPlay={() => {
                    if (justFinishedDragRef.current || isPointerDraggingRef.current) return;
                    handlePlaySound(sound);
                  }}
                  onToggleFavorite={(e) => {
                    e.stopPropagation();
                    handleUpdateSound({
                      ...sound,
                      isFavorite: !sound.isFavorite,
                    });
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    setSelectedSoundId(sound.id);
                    setIsDeleteModalOpen(true);
                  }}
                  onStartListeningHotkey={() => {
                    setSelectedSoundId(sound.id);
                    setListeningSoundId(sound.id);
                  }}
                  onClearHotkey={() => {
                    handleUpdateSound({
                      ...sound,
                      hotkey: '',
                    });
                  }}
                />
              ))}

              {/* "+ Add" Square Tile (Matches Voicemod Reference Grid) */}
              <div
                onClick={() => setIsYouTubeModalOpen(true)}
                style={{
                  backgroundColor: 'var(--theme-bg-card, #171826)',
                  borderColor: 'var(--theme-border, #222436)',
                }}
                className="group aspect-square rounded-[14px] border-2 border-dashed hover:border-[var(--theme-border-highlight)] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                title="Add new sound from YouTube"
              >
                <div
                  style={{ backgroundColor: `${currentTheme.accent}20`, color: currentTheme.accent }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                >
                  <Plus size={20} className="stroke-[2.5]" />
                </div>
                <span className="text-[12px] font-bold text-[#656c7d] group-hover:text-white transition-colors">
                  Add
                </span>
              </div>
            </div>
          </main>

          {/* Bottom Dock Control Pod (Floating padded pod matching HUD bottom dock design) */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 pointer-events-none z-50 [isolation:isolate]">
            {(() => {
              const activeSound = activeSoundIds.length > 0
                ? sounds.find((s) => s.id === activeSoundIds[activeSoundIds.length - 1]) || null
                : null;
              const progress = activeSound ? playbackProgressMap[activeSound.id] || 0 : 0;
              return (
                <div className="pointer-events-auto relative z-10 [isolation:isolate]">
                  <BottomToolbar
                    speakerVolume={settings.masterSpeakerVolume}
                    onSpeakerVolumeChange={(vol) => {
                      audioEngine.setMasterSpeakerVolume(vol);
                      handleSaveSettings({ ...settings, masterSpeakerVolume: vol, masterMicVolume: vol });
                    }}
                    micProjectionVolume={settings.micInputVolume}
                    onMicProjectionVolumeChange={(vol) => {
                      audioEngine.setMicInputVolume(vol);
                      handleSaveSettings({ ...settings, micInputVolume: vol });
                    }}
                    accentColor={settings.accentColor}
                    activeSound={activeSound}
                    playbackProgress={progress}
                    isPaused={activeSound ? (pausedSoundIds.includes(activeSound.id) || audioEngine.isPaused(activeSound.id)) : false}
                    onStopSound={() => {
                      if (activeSound) {
                        audioEngine.stopSound(activeSound.id);
                      }
                    }}
                    onSeekSound={(prog) => {
                      if (activeSound) {
                        audioEngine.seekSound(activeSound.id, prog);
                      }
                    }}
                    onSkipSound={(delta) => {
                      if (activeSound) {
                        audioEngine.skipSound(activeSound.id, delta);
                      }
                    }}
                    onTogglePause={() => {
                      if (activeSound) {
                        audioEngine.togglePlayPauseSound(activeSound.id);
                      }
                    }}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right: Sound Control Panel (Matching user reference) */}
        <ControlPanel
          sound={selectedSound}
          isPlaying={selectedSound ? activeSoundIds.includes(selectedSound.id) : false}
          accentColor={settings.accentColor}
          isListeningHotkey={selectedSound ? listeningSoundId === selectedSound.id : false}
          onUpdateSound={handleUpdateSound}
          onPlaySound={() => selectedSound && handlePlaySound(selectedSound)}
          onStartListeningHotkey={() => selectedSound && setListeningSoundId(selectedSound.id)}
          onClearHotkey={() => selectedSound && handleUpdateSound({ ...selectedSound, hotkey: '' })}
          onOpenTrimmer={() => setIsTrimmerModalOpen(true)}
          onDeleteSound={() => setIsDeleteModalOpen(true)}
          onEditDetails={() => setIsEditModalOpen(true)}
          onDuplicateSound={() => selectedSound && handleDuplicateSound(selectedSound)}
        />
      </div>

      {/* Modals */}
      <YouTubeSearchModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        accentColor={settings.accentColor}
        onDownloadSound={handleYouTubeDownload}
      />

      <AudioTrimmerModal
        sound={selectedSound}
        isOpen={isTrimmerModalOpen}
        onClose={() => setIsTrimmerModalOpen(false)}
        accentColor={settings.accentColor}
        onSaveTrim={handleSaveTrim}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        settings={settings}
        onClose={() => setIsSettingsModalOpen(false)}
        onSaveSettings={handleSaveSettings}
        deletedCount={deletedSounds.length}
        onOpenDeletedArchive={() => setIsRestoreModalOpen(true)}
        onReloadSounds={async () => {
          if (window.soundboardAPI?.loadSounds) {
            const reloaded = await window.soundboardAPI.loadSounds();
            if (reloaded) {
              setSounds(reloaded);
              if (reloaded.length > 0) setSelectedSoundId(reloaded[0].id);
            }
          }
        }}
      />

      <RestoreDeletedModal
        isOpen={isRestoreModalOpen}
        deletedSounds={deletedSounds}
        accentColor={settings.accentColor}
        onClose={() => setIsRestoreModalOpen(false)}
        onRestore={handleRestoreSound}
        onPermanentlyDelete={handlePermanentlyDelete}
        onOpenDeletedFolder={() => {
          if (window.soundboardAPI?.openDeletedDirectory) {
            window.soundboardAPI.openDeletedDirectory();
          }
        }}
      />

      <DeleteConfirmationModal
        sound={selectedSound}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
      />

      <EditSoundModal
        sound={selectedSound}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        accentColor={settings.accentColor}
        onSave={handleUpdateSound}
      />

      {/* In-Game Always-On-Top Overlay Window */}
      <InGameOverlayModal
        isOpen={isOverlayOpen}
        sounds={sounds}
        activeSoundIds={activeSoundIds}
        pausedSoundIds={pausedSoundIds}
        playbackProgressMap={playbackProgressMap}
        speakerVolume={settings.masterSpeakerVolume}
        micProjectionVolume={settings.micInputVolume}
        hearMyself={settings.hearMyself}
        recordDuration={settings.recordDuration || 5}
        recordSource={settings.recordSource || 'screen'}
        onToggleHearMyself={handleToggleHearMyself}
        onStartRecordClip={handleStartRecordClip}
        onChangeRecordDuration={(dur) => {
          handleSaveSettings({ ...settings, recordDuration: dur });
        }}
        onChangeRecordSource={(src) => {
          handleSaveSettings({ ...settings, recordSource: src });
        }}
        onPlaySound={handlePlaySound}
        onStopAll={handleStopAll}
        onClose={() => setIsOverlayOpen(false)}
        onSpeakerVolumeChange={(vol) => {
          audioEngine.setMasterSpeakerVolume(vol);
          handleSaveSettings({ ...settings, masterSpeakerVolume: vol, masterMicVolume: vol });
        }}
        onMicProjectionVolumeChange={(vol) => {
          audioEngine.setMicInputVolume(vol);
          handleSaveSettings({ ...settings, micInputVolume: vol });
        }}
        onReorderSounds={(newSounds) => {
          updateAndSaveSounds(newSounds);
        }}
        onUpdateSound={handleUpdateSound}
        onDuplicateSound={(sound) => handleDuplicateSound(sound)}
        onDeleteSound={(soundId) => {
          const target = sounds.find((s) => s.id === soundId);
          if (target && target.hotkey && window.soundboardAPI) {
            window.soundboardAPI.unregisterGlobalHotkey(target.hotkey);
          }
          const filtered = sounds.filter((s) => s.id !== soundId);
          updateAndSaveSounds(filtered);
          if (selectedSoundId === soundId) {
            setSelectedSoundId(filtered.length > 0 ? filtered[0].id : null);
          }
        }}
        onAddSound={() => {
          if (window.soundboardAPI?.showMainWindow) {
            window.soundboardAPI.showMainWindow();
          }
          setIsYouTubeModalOpen(true);
        }}
        accentColor={settings.accentColor}
      />

      {/* GPU Accelerated Floating Drag Clone Card */}
      {isPointerDragging && pointerDragSound && pointerDragRect && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate3d(${pointerCurrentPos.x - pointerDragOffset.x}px, ${pointerCurrentPos.y - pointerDragOffset.y}px, 0) scale(1.05) rotate(1.5deg)`,
            width: pointerDragRect.width,
            height: pointerDragRect.height,
            zIndex: 99999,
            pointerEvents: 'none',
            willChange: 'transform',
          }}
          className="shadow-2xl ring-2 ring-[#00d2ff] rounded-[14px] overflow-hidden opacity-95 pointer-events-none select-none"
        >
          <SoundCard
            sound={pointerDragSound}
            isSelected={true}
            isPlaying={activeSoundIds.includes(pointerDragSound.id)}
            accentColor={settings.accentColor}
            onSelect={() => {}}
            onPlay={() => {}}
            onToggleFavorite={() => {}}
            onDelete={() => {}}
            onStartListeningHotkey={() => {}}
            onClearHotkey={() => {}}
          />
        </div>
      )}
    </div>
  );
};

export default App;
