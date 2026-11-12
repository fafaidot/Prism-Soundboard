import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SoundItem, ReproductionMode, YouTubeSearchResult } from '../types';
import {
  Volume2,
  VolumeX,
  Mic,
  Music,
  X,
  ExternalLink,
  Square,
  Headphones,
  RotateCcw,
  Sliders,
  Check,
  Plus,
  Disc,
  Keyboard,
  Scissors,
  SlidersHorizontal,
  BookOpen,
  Trash2,
  Copy,
  ArrowUpDown,
  Search,
  Video,
  Clapperboard,
  Star,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
} from 'lucide-react';
import prismLogo from '../assets/Prism.png';
import { audioEngine } from '../services/audioEngine';
import { YouTubeSearchModal } from './YouTubeSearchModal';

interface InGameOverlayModalProps {
  isOpen: boolean;
  isStandaloneOverlay?: boolean;
  sounds: SoundItem[];
  activeSoundIds: string[];
  pausedSoundIds?: string[];
  playbackProgressMap?: Record<string, number>;
  speakerVolume: number;
  micProjectionVolume?: number;
  hearMyself?: boolean;
  recordDuration?: number;
  recordSource?: 'all' | 'screen' | 'mic';
  onPlaySound: (sound: SoundItem) => void;
  onStopAll: () => void;
  onClose: () => void;
  onSpeakerVolumeChange: (vol: number) => void;
  onMicProjectionVolumeChange?: (vol: number) => void;
  onToggleHearMyself?: () => void;
  onStartRecordClip?: () => void;
  onChangeRecordDuration?: (duration: number) => void;
  onChangeRecordSource?: (source: 'all' | 'screen' | 'mic') => void;
  onReorderSounds?: (sounds: SoundItem[]) => void;
  onUpdateSound?: (sound: SoundItem) => void;
  onDeleteSound?: (soundId: string) => void;
  onDuplicateSound?: (sound: SoundItem) => void;
  onAddSound?: () => void;
  onDownloadSound?: (result: YouTubeSearchResult) => Promise<void>;
  accentColor?: string;
}

export const InGameOverlayModal: React.FC<InGameOverlayModalProps> = ({
  isOpen,
  isStandaloneOverlay = false,
  sounds: initialSounds,
  activeSoundIds,
  pausedSoundIds = [],
  playbackProgressMap = {},
  speakerVolume,
  micProjectionVolume = 100,
  hearMyself = false,
  recordDuration = 5,
  recordSource = 'screen',
  onPlaySound,
  onStopAll,
  onClose,
  onSpeakerVolumeChange,
  onMicProjectionVolumeChange,
  onToggleHearMyself,
  onStartRecordClip,
  onChangeRecordDuration,
  onChangeRecordSource,
  onReorderSounds,
  onUpdateSound,
  onDeleteSound,
  onDuplicateSound,
  onAddSound,
  onDownloadSound,
  accentColor,
}) => {
  const accent = accentColor || 'var(--accent-color, #8b5cf6)';
  const [sounds, setSounds] = useState<SoundItem[]>(initialSounds);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(() => {
    if (activeSoundIds && activeSoundIds.length > 0) {
      return activeSoundIds[activeSoundIds.length - 1];
    }
    return initialSounds.length > 0 ? initialSounds[0].id : null;
  });
  const [isHudYouTubeOpen, setIsHudYouTubeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'clips' | 'youtube' | 'favorites'>('all');
  const [sortBy, setSortBy] = useState<'custom' | 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration'>('custom');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showClipMenu, setShowClipMenu] = useState(false);
  const [isClipping, setIsClipping] = useState(false);
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  useEffect(() => {
    setSounds(initialSounds);
    if (activeSoundIds && activeSoundIds.length > 0) {
      const playingId = activeSoundIds[activeSoundIds.length - 1];
      if (playingId && initialSounds.some((s) => s.id === playingId)) {
        setSelectedSoundId(playingId);
      }
    } else if (!selectedSoundId && initialSounds.length > 0) {
      setSelectedSoundId(initialSounds[0].id);
    }
  }, [initialSounds]);

  // When opening overlay or when a sound starts playing, select the currently playing sound
  useEffect(() => {
    if (activeSoundIds && activeSoundIds.length > 0) {
      const playingId = activeSoundIds[activeSoundIds.length - 1];
      if (playingId) {
        setSelectedSoundId(playingId);
      }
    }
  }, [isOpen, activeSoundIds]);

  const [localPausedIds, setLocalPausedIds] = useState<string[]>(pausedSoundIds);
  const pauseLockUntilRef = useRef<number>(0);

  useEffect(() => {
    if (Date.now() < pauseLockUntilRef.current) return;
    setLocalPausedIds(pausedSoundIds);
  }, [pausedSoundIds]);

  // Synchronize live volume, speed, and paused sound updates from main app
  useEffect(() => {
    const cleanupVol = window.soundboardAPI?.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-sound-volume-updated', ({ soundId, volume }: { soundId: string; volume: number }) => {
          setSounds((prev) => prev.map((s) => (s.id === soundId ? { ...s, volume } : s)));
        })
      : () => {};

    const cleanupSpeed = window.soundboardAPI?.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('live-sound-speed-updated', ({ soundId, speed }: { soundId: string; speed: number }) => {
          setSounds((prev) => prev.map((s) => (s.id === soundId ? { ...s, speed } : s)));
        })
      : () => {};

    const cleanupPaused = window.soundboardAPI?.onIpcCommand
      ? window.soundboardAPI.onIpcCommand('paused-sounds-updated', (pIds: string[]) => {
          if (Date.now() < pauseLockUntilRef.current) return;
          setLocalPausedIds(pIds || []);
        })
      : () => {};

    return () => {
      cleanupVol();
      cleanupSpeed();
      cleanupPaused();
    };
  }, []);

  const isYouTubeSound = (s: SoundItem) => {
    if (s.source === 'youtube') return true;
    if (s.author && (s.author.toLowerCase().includes('youtube') || s.author.toLowerCase().includes('yt'))) return true;
    if (s.thumbnail && (s.thumbnail.includes('ytimg') || s.thumbnail.includes('youtube') || s.thumbnail.includes('ggpht'))) return true;
    return false;
  };

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

    if (sortBy === 'custom') {
      return result;
    }

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

  const sortLabels = {
    custom: 'Custom Order',
    newest: 'Newest First',
    oldest: 'Oldest First',
    alphabetical: 'Alphabetical (A-Z)',
    most_played: 'Most Played',
    duration: 'Duration',
  };

  const selectedSound = useMemo(() => {
    return sounds.find((s) => s.id === selectedSoundId) || sounds[0] || null;
  }, [sounds, selectedSoundId]);

  // Pointer Drag-to-Rearrange state for HUD
  const [draggedSoundId, setDraggedSoundId] = useState<string | null>(null);
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const [pointerDragSound, setPointerDragSound] = useState<SoundItem | null>(null);
  const [pointerDragRect, setPointerDragRect] = useState<{ width: number; height: number } | null>(null);
  const [pointerDragOffset, setPointerDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pointerCurrentPos, setPointerCurrentPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const isPointerDraggingRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerSoundRef = useRef<SoundItem | null>(null);
  const dragRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTargetSwapRef = useRef<string | null>(null);
  const justFinishedDragRef = useRef(false);

  // Global Esc key & window blur listener so Escape or clicking off ALWAYS closes overlay reliably
  useEffect(() => {
    if (!isOpen && !isStandaloneOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handleWindowBlur = () => {
      onClose();
    };

    const handleDocumentPointerDown = (e: MouseEvent | PointerEvent) => {
      // If click originated outside the overlay pods (on transparent background), close immediately
      const target = e.target as HTMLElement;
      if (!target.closest('[data-hud-pod]')) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pointerdown', handleDocumentPointerDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [isOpen, isStandaloneOverlay, onClose]);

  // Fluid Real-Time Drag-To-Rearrange Pointer Listeners for HUD
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!pointerStartRef.current || !activePointerSoundRef.current) return;

      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y
      );

      // Distance Threshold: 4px matching exact architecture
      if (!isPointerDraggingRef.current && dist > 4) {
        isPointerDraggingRef.current = true;
        setIsPointerDragging(true);
        setPointerDragSound(activePointerSoundRef.current);
        setPointerDragRect(dragRectRef.current);
        setPointerDragOffset(dragOffsetRef.current);
        setDraggedSoundId(activePointerSoundRef.current.id);
        lastTargetSwapRef.current = activePointerSoundRef.current.id;

        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
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
          if (onReorderSounds) {
            onReorderSounds(currentSounds);
          }
          return currentSounds;
        });
      }

      // Cleanup
      pointerStartRef.current = null;
      activePointerSoundRef.current = null;
      dragRectRef.current = null;
      lastTargetSwapRef.current = null;
      isPointerDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
  }, [onReorderSounds]);

  const handleCardPointerDown = (e: React.PointerEvent, sound: SoundItem) => {
    if (e.button !== 0) return; // Primary left click only
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    activePointerSoundRef.current = sound;
    dragRectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  if (!isOpen && !isStandaloneOverlay) return null;

  const isMuted = speakerVolume === 0;
  const hasActiveSounds = activeSoundIds.length > 0;

  const handleOpenMainApp = () => {
    if (window.soundboardAPI?.showMainWindow) {
      window.soundboardAPI.showMainWindow();
    }
    // Also dismiss the overlay when opening the main app
    onClose();
  };

  const handleModeChange = (mode: ReproductionMode) => {
    if (!selectedSound || !onUpdateSound) return;
    const updated = {
      ...selectedSound,
      reproductionMode: mode,
    };
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? updated : s)));
    onUpdateSound(updated);
  };

  const handleOptionToggle = (key: 'stopOtherSounds' | 'muteOtherSounds' | 'muteVoice' | 'loop') => {
    if (!selectedSound || !onUpdateSound) return;
    const opts = selectedSound.reproductionOptions || {
      stopOtherSounds: true,
      muteOtherSounds: false,
      muteVoice: false,
      loop: false,
    };
    const updated = {
      ...selectedSound,
      reproductionOptions: {
        ...opts,
        [key]: !opts[key],
      },
    };
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? updated : s)));
    onUpdateSound(updated);
  };

  const handleVolumeChange = (newVolume: number) => {
    if (!selectedSound) return;
    const clamped = Math.max(0, Math.min(200, newVolume));

    // Optimistically update local sounds array immediately (zero lag UI)
    setSounds((prev) =>
      prev.map((s) => (s.id === selectedSound.id ? { ...s, volume: clamped } : s))
    );

    // Audio Engine live gain update
    audioEngine.setSoundVolume(selectedSound.id, clamped);
    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-volume-live', { soundId: selectedSound.id, volume: clamped });
    }

    // Debounce the persistent save to disk (prevents disk write bottlenecks on drag)
    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
    }
    volumeDebounceRef.current = setTimeout(() => {
      if (onUpdateSound) {
        onUpdateSound({
          ...selectedSound,
          volume: clamped,
        });
      }
    }, 120);
  };

  const handleSpeedChange = (newSpeed: number) => {
    if (!selectedSound) return;
    const clamped = Math.max(0.25, Math.min(2.0, parseFloat(newSpeed.toFixed(2))));

    // Optimistically update local state immediately
    setSounds((prev) =>
      prev.map((s) => (s.id === selectedSound.id ? { ...s, speed: clamped } : s))
    );

    // Audio Engine live playback rate update
    audioEngine.setSoundSpeed(selectedSound.id, clamped);
    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-speed-live', { soundId: selectedSound.id, speed: clamped });
    }

    // Debounce the persistent save to disk
    if (speedDebounceRef.current) {
      clearTimeout(speedDebounceRef.current);
    }
    speedDebounceRef.current = setTimeout(() => {
      if (onUpdateSound) {
        onUpdateSound({
          ...selectedSound,
          speed: clamped,
        });
      }
    }, 120);
  };

  const selectedOptions = selectedSound?.reproductionOptions || {
    stopOtherSounds: true,
    muteOtherSounds: false,
    muteVoice: false,
    loop: false,
  };
  const selectedMode: ReproductionMode = selectedSound?.reproductionMode || 'stop';

  // Floating active chunk sound: Most recently triggered sound that is still playing
  const activeFloatingSound = useMemo(() => {
    if (!activeSoundIds || activeSoundIds.length === 0) return null;
    for (let i = activeSoundIds.length - 1; i >= 0; i--) {
      const match = sounds.find((s) => s.id === activeSoundIds[i]);
      if (match) return match;
    }
    return null;
  }, [activeSoundIds, sounds]);

  const activeFloatingProgress = activeFloatingSound ? (playbackProgressMap[activeFloatingSound.id] || 0) : 0;

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[9999] flex items-center justify-center select-none ${
        isStandaloneOverlay ? 'bg-transparent p-0' : 'bg-black/60 p-4'
      }`}
    >
      {/* Central Floating Overlay Pods (HUD Grid Pod on Left + Floating Sound Properties Panel on Right) */}
      <div
        data-hud-pod="true"
        onClick={(e) => e.stopPropagation()}
        className="relative flex items-stretch gap-5 max-w-[1440px] w-full px-5 h-[620px] max-h-[92vh]"
      >
        {/* Main Soundboard Grid Pod */}
        <div
          className="flex-1 bg-[var(--theme-bg-header,#090a0f)] border border-[var(--theme-border,#20232d)] rounded-[24px] p-6 flex flex-col justify-between text-white min-w-0 h-full overflow-hidden"
        >
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Header Row: Redesigned Sleek Header */}
            <div className="w-full flex items-center justify-between pb-3.5 mb-2 border-b border-[var(--theme-border,#20232d)]">
              {/* Left: App Logo + Title + Open Main App button + Hear Myself */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2 pl-1 mr-1">
                  <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
                  <span className="text-[13px] font-black uppercase tracking-wider text-white">
                    PRISM <span style={{ color: accent }}>HUD</span>
                  </span>
                </div>

                {/* Open Main App Button */}
                <button
                  onClick={handleOpenMainApp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] text-[var(--theme-text-secondary,#94a3b8)] hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                  title="Open full Prism Soundboard window"
                >
                  <ExternalLink size={12} style={{ color: accent }} />
                  <span>Open App</span>
                </button>

                {/* Hear Myself Headphone Monitor Toggle */}
                {onToggleHearMyself && (
                  <button
                    onClick={onToggleHearMyself}
                    style={
                      hearMyself
                        ? {
                            backgroundColor: `${accent}25`,
                            borderColor: accent,
                            color: accent,
                          }
                        : undefined
                    }
                    className={`w-[32px] h-[32px] flex items-center justify-center rounded-[9px] border transition-all cursor-pointer ${
                      hearMyself
                        ? ''
                        : 'bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border-[var(--theme-border,#20232d)] text-[#9ea6b8] hover:text-white'
                    }`}
                    title={hearMyself ? 'Hear Myself: ACTIVE' : 'Hear Myself: OFF'}
                  >
                    <Headphones size={15} />
                  </button>
                )}

                {/* Instant Replay Clip Last Seconds with Duration & Source Dropdown */}
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={async () => {
                      if (isClipping) return;
                      setIsClipping(true);
                      try {
                        if (onStartRecordClip) {
                          await onStartRecordClip();
                        } else if (window.soundboardAPI?.sendIpcCommand) {
                          window.soundboardAPI.sendIpcCommand('sync-trigger-clip');
                        }
                      } finally {
                        setTimeout(() => setIsClipping(false), 500);
                      }
                    }}
                    disabled={isClipping}
                    style={
                      isClipping
                        ? {
                            backgroundColor: `${accent}25`,
                            borderColor: accent,
                            color: accent,
                          }
                        : undefined
                    }
                    className={`h-[32px] flex items-center justify-center gap-1.5 px-2.5 rounded-l-[9px] text-[11px] font-bold border transition-all cursor-pointer box-border ${
                      isClipping
                        ? 'animate-pulse cursor-wait'
                        : 'bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border-[var(--theme-border,#20232d)] text-white'
                    }`}
                    title={`Clip last ${recordDuration}s of audio (Instant Replay)`}
                  >
                    <Clapperboard
                      size={13}
                      style={{ color: accent }}
                      className={isClipping ? 'animate-spin' : ''}
                    />
                    <span className="font-bold" style={{ color: accent }}>
                      {isClipping ? 'Clipping...' : `${recordDuration}s`}
                    </span>
                  </button>

                  {/* Dropdown Selector for Clip Duration & Audio Source */}
                  <button
                    type="button"
                    onClick={() => setShowClipMenu(!showClipMenu)}
                    className="h-[32px] px-1.5 rounded-r-[9px] border-y border-r border-[var(--theme-border,#20232d)] bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] text-[#8a92a6] hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    title="Configure Clip Duration and Source"
                  >
                    <ChevronDown size={11} />
                  </button>

                  {/* Clip Settings Dropdown Menu */}
                  {showClipMenu && (
                    <div className="absolute left-0 top-full mt-2 w-52 bg-[var(--theme-bg-surface,#111317)] border border-[var(--theme-border,#20232d)] rounded-[12px] shadow-[0_10px_35px_rgba(0,0,0,0.8)] py-2 z-[100] animate-in fade-in zoom-in-95 duration-100">
                      {/* Duration header */}
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8e97aa]">
                        Clip Buffer Length
                      </div>
                      {[3, 5, 10, 15, 30].map((dur) => (
                        <button
                          key={dur}
                          type="button"
                          onClick={() => {
                            if (onChangeRecordDuration) {
                              onChangeRecordDuration(dur);
                            }
                            setShowClipMenu(false);
                          }}
                          style={recordDuration === dur ? { color: accent } : undefined}
                          className={`w-full px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer ${
                            recordDuration === dur ? 'bg-white/5 font-bold' : 'text-white'
                          }`}
                        >
                          <span>Last {dur} Seconds</span>
                          {recordDuration === dur && <Check size={12} style={{ color: accent }} />}
                        </button>
                      ))}

                      {/* Source indicator */}
                      <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8e97aa] border-t border-[var(--theme-border,#20232d)] mt-1.5 flex items-center justify-between">
                        <span>Recording Source</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-white font-mono">LOCKED</span>
                      </div>
                      <div className="px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between text-white bg-white/5">
                        <span className="truncate">Screen + Mic Combined</span>
                        <Check size={12} style={{ color: accent }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Center-Right: Stop All sounds pill button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onStopAll}
                  disabled={!hasActiveSounds}
                  className={`h-[32px] px-3 rounded-[9px] text-[11px] font-bold flex items-center gap-1.5 transition-all duration-150 border box-border ${
                    hasActiveSounds
                      ? 'bg-[#e81123]/20 border-[#e81123] text-[#ff4d5e] cursor-pointer hover:bg-[#e81123]/30 active:scale-95'
                      : 'bg-[var(--theme-bg-card,#171920)] border-[var(--theme-border,#20232d)] text-[#5e6678] cursor-not-allowed opacity-60'
                  }`}
                >
                  <Square size={12} className={hasActiveSounds ? 'fill-current text-[#ff4d5e]' : 'text-[#5e6678]'} />
                  <span className={hasActiveSounds ? 'font-bold text-[#ff4d5e]' : 'font-semibold text-[#8a92a6]'}>Stop All</span>
                  {activeSoundIds.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#ff4d5e] text-white text-[10px] font-mono font-bold leading-tight">
                      {activeSoundIds.length}
                    </span>
                  )}
                </button>

                {/* Right: Close button */}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Close Overlay (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Search, Filter Tabs & Sorting Toolbar */}
            <div className="w-full flex items-center justify-between gap-3 mb-2 px-1">
              {/* Left: Search input */}
              <div className="relative w-48 h-[30px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#687084]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter HUD..."
                  className="w-full h-full pl-8 pr-6 bg-[var(--theme-bg-card,#171920)] border border-[var(--theme-border,#20232d)] focus:border-[var(--accent-color,#38bdf8)]/70 rounded-[8px] text-[11px] text-white placeholder-[#687084] focus:outline-none transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#687084] hover:text-white"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Center: Filter Tabs */}
              <div className="h-[30px] flex items-center gap-1 bg-[var(--theme-bg-card,#171920)] p-0.5 rounded-[8px] border border-[var(--theme-border,#20232d)]">
                {([
                  { id: 'all', label: 'All' },
                  { id: 'clips', label: 'Clips', icon: Clapperboard },
                  { id: 'youtube', label: 'YouTube', icon: Video },
                  { id: 'favorites', label: 'Fav', icon: Star },
                ] as const).map((tab) => {
                  const Icon = (tab as any).icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFilter(tab.id)}
                      className={`h-full px-2.5 flex items-center gap-1 justify-center rounded-[6px] text-[11px] font-bold transition-all cursor-pointer ${
                        activeFilter === tab.id
                          ? 'bg-[var(--theme-bg-surface,#111317)] text-white shadow-sm border border-[var(--theme-border,#20232d)]'
                          : 'text-[#9ea7ba] hover:text-white'
                      }`}
                    >
                      {Icon && <Icon size={11} style={activeFilter === tab.id ? { color: accent } : undefined} className={activeFilter !== tab.id ? 'text-[#7e8697]' : undefined} />}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Sorting Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="h-[30px] px-3 whitespace-nowrap min-w-fit flex items-center gap-1.5 bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] hover:border-[var(--theme-border-hover,#2d3240)] rounded-[8px] text-[#a4abbd] hover:text-white text-[11px] font-semibold transition-all cursor-pointer"
                >
                  <ArrowUpDown size={12} style={{ color: accent }} className="shrink-0" />
                  <span className="whitespace-nowrap">{sortLabels[sortBy] || 'Sort'}</span>
                </button>

                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-40 bg-[var(--theme-bg-surface,#111317)] border border-[var(--theme-border,#20232d)] rounded-[10px] py-1 z-[100] animate-in fade-in zoom-in-95 duration-100">
                    {(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          setSortBy(key);
                          setShowSortMenu(false);
                        }}
                        style={sortBy === key ? { color: accent } : undefined}
                        className={`w-full px-3 py-1.5 text-left text-[11px] font-semibold flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer ${
                          sortBy === key ? 'bg-white/5 font-bold' : 'text-white'
                        }`}
                      >
                        <span>{sortLabels[key]}</span>
                        {sortBy === key && <Check size={12} style={{ color: accent }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Center Grid of Soundboard Cards with Live Progress Bar Tint (Scrollbar hidden) */}
            <div className="w-full flex-1 overflow-y-auto p-3 grid grid-cols-6 gap-3.5 no-scrollbar min-h-0">
              {filteredSounds.length === 0 ? (
                <div className="col-span-6 py-12 text-center text-[#9ea7ba] text-[13px] font-semibold">
                  No sounds matched your filter.
                </div>
              ) : (
                filteredSounds.map((sound) => {
                  const isPlaying = activeSoundIds.includes(sound.id);
                  const isSelected = selectedSoundId === sound.id;
                  const hasThumbnail = !!sound.thumbnail;
                  const progress = playbackProgressMap[sound.id] || 0;
                  const isDragging = draggedSoundId === sound.id;
                  const isClipSound = sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped');

                  return (
                    <div
                      key={sound.id}
                      data-sound-id={sound.id}
                      draggable={false}
                      onPointerDown={(e) => handleCardPointerDown(e, sound)}
                      onClick={() => {
                        if (justFinishedDragRef.current || isPointerDraggingRef.current) return;
                        setSelectedSoundId(sound.id);
                        onPlaySound(sound);
                      }}
                      style={
                        isSelected || isPlaying
                          ? {
                              borderColor: accent,
                            }
                          : undefined
                      }
                      className={`group relative flex flex-col items-center p-2 rounded-[14px] transition-all duration-150 cursor-pointer select-none ${
                        isDragging
                          ? 'opacity-25 scale-95 border-2 border-dashed'
                          : isPlaying || isSelected
                          ? 'bg-[var(--theme-bg-card-selected,#252936)] ring-2'
                          : 'bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] hover:border-[var(--theme-border-hover,#2d3240)]'
                      }`}
                      title={`${sound.title} (Click to select & play)`}
                    >
                      {/* Integrated Artwork Container */}
                      <div className="relative w-full aspect-square rounded-[12px] bg-[var(--theme-bg-header,#090a0f)] flex items-center justify-center">
                        {/* Artwork / Thumbnail (overflow-hidden so blur stays inside thumbnail without clipping perimeter progress) */}
                        <div className="absolute inset-0 rounded-[12px] overflow-hidden flex items-center justify-center">
                          {hasThumbnail ? (
                            <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                              {/* Blurred background copy */}
                              <img
                                src={sound.thumbnail}
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-0 w-full h-full object-cover blur-md opacity-50 scale-110 pointer-events-none"
                              />
                              {/* Letterboxed foreground copy */}
                              <img
                                src={sound.thumbnail}
                                alt={sound.title}
                                className="relative w-full h-full object-contain z-[1] pointer-events-none"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--theme-bg-surface,#111317)] p-2 text-center pointer-events-none select-none">
                              {isClipSound ? (
                                <Clapperboard size={24} style={{ color: accent }} className="mb-1" />
                              ) : (
                                <Music size={24} style={{ color: `${accent}b3` }} className="mb-1" />
                              )}
                              <span className="text-[11px] font-bold text-white/90 line-clamp-2 px-1 leading-tight break-words">
                                {sound.title}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Circular Perimeter SVG Progress Ring wrapping exactly around the artwork border */}
                        {isPlaying && (
                          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none z-30" viewBox="0 0 100 100">
                            <rect
                              x="2"
                              y="2"
                              width="96"
                              height="96"
                              rx="12"
                              fill="none"
                              stroke={accent}
                              strokeWidth="3.5"
                              strokeDasharray="360"
                              strokeDashoffset={360 * (1 - Math.min(1, Math.max(0, progress)))}
                              className="transition-[stroke-dashoffset] duration-100 ease-linear"
                            />
                          </svg>
                        )}

                        {/* Top-Left Hotkey Badge */}
                        {sound.hotkey && (
                          <div className="absolute top-1.5 left-1.5 z-20 flex items-center">
                            <span
                              style={{ color: accent }}
                              className="px-1.5 py-0.5 rounded-[5px] bg-black/80 backdrop-blur-sm border border-white/10 text-[10px] font-mono font-bold leading-none pointer-events-none"
                            >
                              {sound.hotkey}
                            </span>
                          </div>
                        )}

                        {/* Top-Right Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteSound) {
                              onDeleteSound(sound.id);
                            }
                          }}
                          title="Delete Sound"
                          className="absolute top-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 text-[#8a92a6] hover:text-[#ff3b30] bg-black/70 hover:bg-black/90 transition-all pointer-events-auto z-20"
                        >
                          <Trash2 size={12} />
                        </button>

                        {/* Duration badge */}
                        {sound.duration > 0 && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-[5px] bg-black/80 backdrop-blur-sm text-[11px] font-mono font-bold text-white/90 border border-white/10 z-10 pointer-events-none">
                            {Math.floor(sound.duration / 60)}:{Math.floor(sound.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}

                        {/* Source Badge (YouTube only, no 5s clip tag) */}
                        {sound.source === 'youtube' && (
                          <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-[5px] bg-black/80 text-[10px] font-mono font-bold text-white/80 z-10 pointer-events-none border border-white/10">
                            YT
                          </div>
                        )}

                        {/* Playing Equalizer Animation Overlay */}
                        {isPlaying && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-15 pointer-events-none">
                            <div className="flex items-end gap-1 h-5">
                              <span className="w-1 rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '60%', backgroundColor: accent }} />
                              <span className="w-1 rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%', backgroundColor: accent }} />
                              <span className="w-1 rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%', backgroundColor: accent }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Title (2-line clamp clean integration) */}
                      <div className="w-full mt-2 px-1 text-center">
                        <span className="text-[11px] font-bold text-white/95 leading-tight line-clamp-2 break-words pointer-events-none">
                          {sound.title}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {/* "+ Add" Square Card */}
              <div
                onClick={() => {
                  setIsHudYouTubeOpen(true);
                }}
                className="group aspect-square rounded-[16px] border-2 border-dashed border-[#262936] hover:border-white/40 bg-[#141620]/70 hover:bg-[#1a1d28] flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                title="Search and add sound from YouTube"
              >
                <div
                  style={{ backgroundColor: `${accent}20`, color: accent }}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                >
                  <Plus size={18} className="stroke-[2.5]" />
                </div>
                <span className="text-[11.5px] font-bold text-[#8a92a6] group-hover:text-white transition-colors">
                  Add
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Dock Control Pod (Voice Vol & Sounds Vol stacked matching reference design) */}
          <div className="w-full px-5 py-2.5 rounded-[16px] bg-[#141620] border border-[#242938] flex items-center justify-between shadow-inner">
            <div className="flex flex-col gap-1.5 min-w-[210px] sm:min-w-[240px]">
              {/* Voice Vol (Top) */}
              {onMicProjectionVolumeChange && (
                <div className="flex items-center gap-2.5">
                  <Mic
                    size={15}
                    className={`flex-shrink-0 ${micProjectionVolume > 100 ? 'text-[#f59e0b]' : ''}`}
                    style={micProjectionVolume <= 100 ? { color: accent } : undefined}
                  />
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={micProjectionVolume}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      onMicProjectionVolumeChange(val);
                    }}
                    className="w-28 sm:w-36 h-1.5 bg-[#252834] rounded cursor-pointer"
                    style={{ accentColor: micProjectionVolume > 100 ? '#f59e0b' : accentColor }}
                  />
                  <span
                    style={{ color: micProjectionVolume > 100 ? '#f59e0b' : accent }}
                    className="font-mono text-[11px] font-bold w-9 text-right flex-shrink-0"
                  >
                    {micProjectionVolume}%
                  </span>
                </div>
              )}

              {/* Sounds Vol (Bottom) */}
              <div className="flex items-center gap-2.5">
                <Volume2
                  size={15}
                  className={`flex-shrink-0 ${isMuted ? 'text-[#e81123]' : ''}`}
                  style={!isMuted ? { color: accent } : undefined}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={speakerVolume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    onSpeakerVolumeChange(val);
                  }}
                  className="w-28 sm:w-36 h-1.5 bg-[#252834] rounded cursor-pointer"
                  style={{ accentColor: accent }}
                />
                <span
                  style={{ color: accent }}
                  className="font-mono text-[11px] font-bold w-9 text-right flex-shrink-0"
                >
                  {speakerVolume}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Sound Properties Panel for HUD */}
        <div className="flex flex-col gap-3 h-full">
          {selectedSound && (
            <div className="w-[340px] min-w-[340px] flex-1 bg-[var(--theme-bg-header,#090a0f)] border border-[var(--theme-border,#20232d)] rounded-[24px] p-5 flex flex-col justify-between text-white overflow-hidden">
            <div>
              {/* Header: Title, Author, Artwork */}
              <div className="flex items-start gap-3 p-1">
                <div className="relative w-14 h-14 rounded-[12px] overflow-hidden border border-white/20 shadow-lg bg-[#0c0d10] flex-shrink-0 flex items-center justify-center">
                  {selectedSound.thumbnail ? (
                    <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                      <img
                        src={selectedSound.thumbnail}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover blur-md opacity-50 scale-110 pointer-events-none"
                      />
                      <img
                        src={selectedSound.thumbnail}
                        alt={selectedSound.title}
                        className="relative w-full h-full object-contain z-[1]"
                      />
                    </div>
                  ) : selectedSound.source === 'clip' || selectedSound.title.toLowerCase().startsWith('clipped') ? (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: `${accent}20` }}
                    >
                      <Clapperboard size={22} style={{ color: accent }} />
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: `${accent}20` }}
                    >
                      <Disc size={22} style={{ color: accent }} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-[13px] font-bold text-white truncate flex-1" title={selectedSound.title}>
                      {selectedSound.title}
                    </h3>
                    {onDuplicateSound && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateSound(selectedSound);
                        }}
                        title="Duplicate Sound"
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-[#9ea7ba] hover:text-white transition-colors cursor-pointer"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9ea7ba] truncate">
                    by <strong className="text-white">@{selectedSound.author || 'Prism'}</strong>
                  </p>
                  {selectedSound.hotkey && (
                    <span
                      style={{ color: accent, borderColor: `${accent}40` }}
                      className="inline-block mt-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#1c1e26] border"
                    >
                      {selectedSound.hotkey}
                    </span>
                  )}
                </div>
              </div>

              {/* Volume & Speed Sliders Box */}
              <div className="mt-3.5 space-y-2">
                <div className={`p-2 bg-[#171922] rounded-[12px] border ${
                  (selectedSound.volume ?? 100) > 100 ? 'border-[#f59e0b]/40' : 'border-[#252834]'
                } flex items-center gap-2`}>
                  <Volume2
                    size={14}
                    className={(selectedSound.volume ?? 100) > 100 ? 'text-[#f59e0b]' : ''}
                    style={(selectedSound.volume ?? 100) <= 100 ? { color: accent } : undefined}
                  />
                  <span className="text-[11px] font-semibold text-white/90">Vol</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={selectedSound.volume ?? 100}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value) || 0)}
                    className="flex-1 h-1.5 bg-[#2d3140] rounded-lg cursor-pointer"
                    style={{
                      accentColor: (selectedSound.volume ?? 100) > 100 ? '#f59e0b' : accent,
                    }}
                  />
                  <span className={`text-[11px] font-mono font-bold w-8 text-right ${
                    (selectedSound.volume ?? 100) > 100 ? 'text-[#f59e0b]' : 'text-white'
                  }`}>
                    {selectedSound.volume ?? 100}%
                  </span>
                </div>

                <div className="p-2 bg-[#171922] rounded-[12px] border border-[#252834] flex items-center gap-2">
                  <SlidersHorizontal size={14} style={{ color: accent }} />
                  <span className="text-[11px] font-semibold text-white/90">Speed</span>
                  <input
                    type="range"
                    min={25}
                    max={200}
                    step={5}
                    value={Math.round((selectedSound.speed ?? 1.0) * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      handleSpeedChange(val);
                    }}
                    className="flex-1 h-1.5 bg-[#2d3140] rounded-lg cursor-pointer"
                    style={{ accentColor: accent }}
                  />
                  <span className="text-[11px] font-mono font-bold text-white w-9 text-right">
                    {(selectedSound.speed ?? 1.0).toFixed(2)}x
                  </span>
                </div>
              </div>

              {/* Reproduction Mode */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 text-white font-bold text-[11.5px] mb-2">
                  <RotateCcw size={13} style={{ color: accent }} />
                  <span>Reproduction Mode</span>
                </div>

                <div className="flex items-center justify-between gap-1 px-1">
                  {/* 1. Overlap */}
                  <button
                    onClick={() => handleModeChange('overlap')}
                    title="Play and Overlap"
                    style={
                      selectedMode === 'overlap'
                        ? { backgroundColor: accent, color: '#000000' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'overlap'
                        ? 'scale-105'
                        : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171920)] border border-[var(--theme-border,#20232d)]'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 4l10 8-10 8V4z" />
                      <path d="M12 4l10 8-10 8V4z" opacity="0.6" />
                    </svg>
                  </button>

                  {/* 2. Pause */}
                  <button
                    onClick={() => handleModeChange('pause')}
                    title="Play and Pause"
                    style={
                      selectedMode === 'pause'
                        ? { backgroundColor: accent, color: '#000000' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'pause'
                        ? 'scale-105'
                        : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171920)] border border-[var(--theme-border,#20232d)]'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 5l8 7-8 7V5z" />
                      <rect x="14" y="5" width="3" height="14" rx="1" />
                      <rect x="19" y="5" width="3" height="14" rx="1" />
                    </svg>
                  </button>

                  {/* 3. Stop */}
                  <button
                    onClick={() => handleModeChange('stop')}
                    title="Play and Stop"
                    style={
                      selectedMode === 'stop'
                        ? { backgroundColor: accent, color: '#000000' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'stop'
                        ? 'scale-105'
                        : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 5l7 7-7 7V5z" />
                      <rect x="14" y="6" width="7" height="12" rx="1.5" />
                    </svg>
                  </button>

                  {/* 4. Restart */}
                  <button
                    onClick={() => handleModeChange('restart')}
                    title="Play and Restart"
                    style={
                      selectedMode === 'restart'
                        ? { backgroundColor: accent, color: '#000000' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'restart'
                        ? 'scale-105'
                        : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 5l11 7-11 7V5z" />
                      <rect x="18" y="5" width="2.5" height="14" rx="1" />
                    </svg>
                  </button>

                  {/* 5. Push to Loop */}
                  <button
                    onClick={() => handleModeChange('push_loop')}
                    title="Push to Loop"
                    style={
                      selectedMode === 'push_loop'
                        ? { backgroundColor: accent, color: '#000000' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'push_loop'
                        ? 'scale-105'
                        : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  </button>
                </div>

                <div className="mt-1.5 text-center text-[11px] font-medium text-[#9ea7ba]">
                  {selectedMode === 'overlap' && 'Play and Overlap'}
                  {selectedMode === 'pause' && 'Play and Pause'}
                  {selectedMode === 'stop' && 'Play and Stop'}
                  {selectedMode === 'restart' && 'Play and Restart'}
                  {selectedMode === 'push_loop' && 'Push to Loop'}
                </div>
              </div>

              {/* Reproduction Options Section (4 Checkbox options) */}
              <div className="mt-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-white font-bold text-[11.5px] mb-1.5">
                  <Sliders size={13} style={{ color: accent }} />
                  <span>Reproduction Options</span>
                </div>

                {/* 1. Stop Other Sounds */}
                <div
                  onClick={() => handleOptionToggle('stopOtherSounds')}
                  style={
                    selectedOptions.stopOtherSounds
                      ? {
                          backgroundColor: `${accent}15`,
                          borderColor: `${accent}40`,
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between p-2 rounded-[9px] border cursor-pointer select-none transition-all ${
                    selectedOptions.stopOtherSounds
                      ? ''
                      : 'bg-[#15171e]/70 border-[#252834] hover:bg-[#1a1d26]'
                  }`}
                >
                  <span className={`text-[11.5px] font-semibold ${selectedOptions.stopOtherSounds ? 'text-white' : 'text-[#8a92a6]'}`}>
                    Stop Other Sounds
                  </span>
                  <div
                    style={
                      selectedOptions.stopOtherSounds
                        ? {
                            backgroundColor: accent,
                            borderColor: accent,
                          }
                        : undefined
                    }
                    className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all ${
                      selectedOptions.stopOtherSounds
                        ? ''
                        : 'bg-[#101217] border-[#2c3140]'
                    }`}
                  >
                    {selectedOptions.stopOtherSounds && <Check size={10} className="text-white stroke-[3.5]" />}
                  </div>
                </div>

                {/* 2. Mute Other Sounds */}
                <div
                  onClick={() => handleOptionToggle('muteOtherSounds')}
                  style={
                    selectedOptions.muteOtherSounds
                      ? {
                          backgroundColor: `${accent}15`,
                          borderColor: `${accent}40`,
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between p-2 rounded-[9px] border cursor-pointer select-none transition-all ${
                    selectedOptions.muteOtherSounds
                      ? ''
                      : 'bg-[#15171e]/70 border-[#252834] hover:bg-[#1a1d26]'
                  }`}
                >
                  <span className={`text-[11.5px] font-semibold ${selectedOptions.muteOtherSounds ? 'text-white' : 'text-[#8a92a6]'}`}>
                    Mute Other Sounds
                  </span>
                  <div
                    style={
                      selectedOptions.muteOtherSounds
                        ? {
                            backgroundColor: accent,
                            borderColor: accent,
                          }
                        : undefined
                    }
                    className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all ${
                      selectedOptions.muteOtherSounds
                        ? ''
                        : 'bg-[#101217] border-[#2c3140]'
                    }`}
                  >
                    {selectedOptions.muteOtherSounds && <Check size={10} className="text-white stroke-[3.5]" />}
                  </div>
                </div>

                {/* 3. Mute Voice */}
                <div
                  onClick={() => handleOptionToggle('muteVoice')}
                  style={
                    selectedOptions.muteVoice
                      ? {
                          backgroundColor: `${accent}15`,
                          borderColor: `${accent}40`,
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between p-2 rounded-[9px] border cursor-pointer select-none transition-all ${
                    selectedOptions.muteVoice
                      ? ''
                      : 'bg-[#15171e]/70 border-[#252834] hover:bg-[#1a1d26]'
                  }`}
                >
                  <span className={`text-[11.5px] font-semibold ${selectedOptions.muteVoice ? 'text-white' : 'text-[#8a92a6]'}`}>
                    Mute Voice
                  </span>
                  <div
                    style={
                      selectedOptions.muteVoice
                        ? {
                            backgroundColor: accent,
                            borderColor: accent,
                          }
                        : undefined
                    }
                    className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all ${
                      selectedOptions.muteVoice
                        ? ''
                        : 'bg-[#101217] border-[#2c3140]'
                    }`}
                  >
                    {selectedOptions.muteVoice && <Check size={10} className="text-white stroke-[3.5]" />}
                  </div>
                </div>

                {/* 4. Loop */}
                <div
                  onClick={() => handleOptionToggle('loop')}
                  style={
                    selectedOptions.loop
                      ? {
                          backgroundColor: `${accent}15`,
                          borderColor: `${accent}40`,
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between p-2 rounded-[9px] border cursor-pointer select-none transition-all ${
                    selectedOptions.loop
                      ? ''
                      : 'bg-[#15171e]/70 border-[#252834] hover:bg-[#1a1d26]'
                  }`}
                >
                  <span className={`text-[11.5px] font-semibold ${selectedOptions.loop ? 'text-white' : 'text-[#8a92a6]'}`}>
                    Loop
                  </span>
                  <div
                    style={
                      selectedOptions.loop
                        ? {
                            backgroundColor: accent,
                            borderColor: accent,
                          }
                        : undefined
                    }
                    className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all ${
                      selectedOptions.loop
                        ? ''
                        : 'bg-[#101217] border-[#2c3140]'
                    }`}
                  >
                    {selectedOptions.loop && <Check size={10} className="text-white stroke-[3.5]" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dedicated Mini-Player Window under Properties Panel (Matching Reference Image) */}
        {activeFloatingSound && (
          <div className="w-[340px] min-w-[340px] bg-[var(--theme-bg-header,#090a0f)] border border-[var(--theme-border,#20232d)] rounded-[20px] p-3.5 flex flex-col gap-2.5 text-white shadow-xl">
            {/* Header: Square artwork and Song title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] overflow-hidden bg-black flex-shrink-0 flex items-center justify-center border border-white/10 shadow">
                {activeFloatingSound.thumbnail ? (
                  <img src={activeFloatingSound.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : activeFloatingSound.source === 'clip' || activeFloatingSound.title.toLowerCase().startsWith('clipped') ? (
                  <Clapperboard size={18} style={{ color: accent }} />
                ) : (
                  <Music size={18} style={{ color: accent }} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-[12.5px] font-extrabold text-white truncate leading-tight" title={activeFloatingSound.title}>
                  {activeFloatingSound.title}
                </h4>
                <p className="text-[10px] text-[#71788e] truncate mt-0.5">
                  by <span className="text-white/80 font-medium">@{activeFloatingSound.author || 'User'}</span>
                </p>
              </div>
            </div>

            {/* Center row: Chevron Left (-5s), Pause/Resume, Stop, Chevron Right (+5s) */}
            <div className="flex items-center justify-center gap-5 py-0.5">
              {/* Skip Back 5s Arrow */}
              <button
                type="button"
                onClick={() => {
                  if (window.soundboardAPI?.sendIpcCommand) {
                    window.soundboardAPI.sendIpcCommand('sync-skip-sound', {
                      soundId: activeFloatingSound.id,
                      deltaSeconds: -5,
                    });
                  } else {
                    audioEngine.skipSound(activeFloatingSound.id, -5);
                  }
                }}
                title="Rewind 5 seconds"
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft size={20} />
              </button>

              {/* Pause / Resume Button */}
              {(() => {
                const isItemPaused = localPausedIds.includes(activeFloatingSound.id);
                return (
                  <button
                    type="button"
                    onClick={() => {
                      // Lock local paused state for 600ms so stale background syncs cannot flip it back
                      pauseLockUntilRef.current = Date.now() + 600;
                      setLocalPausedIds((prev) =>
                        prev.includes(activeFloatingSound.id)
                          ? prev.filter((id) => id !== activeFloatingSound.id)
                          : [...prev, activeFloatingSound.id]
                      );
                      if (window.soundboardAPI?.sendIpcCommand) {
                        window.soundboardAPI.sendIpcCommand('sync-toggle-pause-sound', activeFloatingSound.id);
                      } else {
                        audioEngine.togglePlayPauseSound(activeFloatingSound.id);
                      }
                    }}
                    style={{ backgroundColor: accent, color: '#000' }}
                    title={isItemPaused ? 'Resume Playback' : 'Pause Playback'}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-md"
                  >
                    {isItemPaused ? <Play size={15} className="fill-current translate-x-0.5" /> : <Pause size={15} className="fill-current" />}
                  </button>
                );
              })()}

              {/* Skip Forward 5s Arrow */}
              <button
                type="button"
                onClick={() => {
                  if (window.soundboardAPI?.sendIpcCommand) {
                    window.soundboardAPI.sendIpcCommand('sync-skip-sound', {
                      soundId: activeFloatingSound.id,
                      deltaSeconds: 5,
                    });
                  } else {
                    audioEngine.skipSound(activeFloatingSound.id, 5);
                  }
                }}
                title="Skip forward 5 seconds"
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Bottom row: Interactive Scrubber Slider */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={activeFloatingProgress}
                onChange={(e) => {
                  const prog = parseFloat(e.target.value);
                  if (window.soundboardAPI?.sendIpcCommand) {
                    window.soundboardAPI.sendIpcCommand('sync-seek-sound', {
                      soundId: activeFloatingSound.id,
                      progress: prog,
                    });
                  } else {
                    audioEngine.seekSound(activeFloatingSound.id, prog);
                  }
                }}
                className="w-full h-1 bg-[#222634] rounded cursor-pointer"
                style={{ accentColor: accent }}
              />
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Floating Drag Clone for HUD */}
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
            borderColor: accent,
          }}
          className="ring-2 rounded-[14px] overflow-hidden opacity-95 pointer-events-none select-none bg-[var(--theme-bg-card-selected,#252936)] p-2 flex flex-col items-center"
        >
          <div className="relative w-full aspect-square rounded-[10px] overflow-hidden bg-[#0a0c10] flex items-center justify-center">
            {pointerDragSound.thumbnail ? (
              <img src={pointerDragSound.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--theme-bg-surface,#111317)] p-2 text-center select-none">
                {pointerDragSound.source === 'clip' || pointerDragSound.title.toLowerCase().startsWith('clipped') ? (
                  <Clapperboard size={22} style={{ color: accent }} className="mb-1" />
                ) : (
                  <Music size={22} style={{ color: accent, opacity: 0.7 }} className="mb-1" />
                )}
                <span className="text-[11px] font-bold text-white/80 line-clamp-2 px-1 leading-tight break-words">
                  {pointerDragSound.title}
                </span>
              </div>
            )}
          </div>
          <span className="w-full mt-1.5 text-center text-[11px] font-bold text-white/90 truncate leading-tight">
            {pointerDragSound.title}
          </span>
        </div>
      )}

      {/* Embedded YouTube Search & Download Modal for HUD */}
      {isHudYouTubeOpen && (
        <YouTubeSearchModal
          isOpen={isHudYouTubeOpen}
          isHUD={true}
          onClose={() => setIsHudYouTubeOpen(false)}
          accentColor={accent}
          onDownloadSound={async (res) => {
            if (onDownloadSound) {
              await onDownloadSound(res);
            }
          }}
        />
      )}
    </div>
  );
};
