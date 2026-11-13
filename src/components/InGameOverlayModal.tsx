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
  Pencil,
} from 'lucide-react';
import prismLogo from '../assets/Prism.png';
import { audioEngine } from '../services/audioEngine';
import { YouTubeSearchModal } from './YouTubeSearchModal';
import { AudioTrimmerModal } from './AudioTrimmerModal';
import { Slider } from './Slider';

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
  const accent = accentColor || '#31C5F4';
  const [sounds, setSounds] = useState<SoundItem[]>(initialSounds);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(() => {
    if (activeSoundIds && activeSoundIds.length > 0) {
      return activeSoundIds[activeSoundIds.length - 1];
    }
    return initialSounds.length > 0 ? initialSounds[0].id : null;
  });
  const [isHudYouTubeOpen, setIsHudYouTubeOpen] = useState(false);
  const [isHudTrimmerOpen, setIsHudTrimmerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'clips' | 'youtube' | 'favorites'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration'>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  const isHudTrimmerOpenRef = useRef(isHudTrimmerOpen);
  isHudTrimmerOpenRef.current = isHudTrimmerOpen;
  const isHudYouTubeOpenRef = useRef(isHudYouTubeOpen);
  isHudYouTubeOpenRef.current = isHudYouTubeOpen;

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
    newest: 'Newest First',
    oldest: 'Oldest First',
    alphabetical: 'Alphabetical (A-Z)',
    most_played: 'Most Played',
    duration: 'Duration',
  };

  const selectedSound = useMemo(() => {
    return sounds.find((s) => s.id === selectedSoundId) || sounds[0] || null;
  }, [sounds, selectedSoundId]);

  useEffect(() => {
    setEditedTitle(selectedSound?.title || '');
    setIsEditingTitle(false);
  }, [selectedSound?.id, selectedSound?.title]);

  const handleSaveTitle = () => {
    if (!selectedSound) return;
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== selectedSound.title) {
      if (onUpdateSound) {
        onUpdateSound({
          ...selectedSound,
          title: trimmed,
        });
      }
    } else {
      setEditedTitle(selectedSound.title);
    }
    setIsEditingTitle(false);
  };

  // Global Esc key & window blur listener so Escape or clicking off ALWAYS closes overlay reliably
  useEffect(() => {
    if (!isOpen && !isStandaloneOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isHudTrimmerOpenRef.current) {
          setIsHudTrimmerOpen(false);
          return;
        }
        if (isHudYouTubeOpenRef.current) {
          setIsHudYouTubeOpen(false);
          return;
        }
        onClose();
      }
    };

    const handleWindowBlur = () => {
      if (isHudTrimmerOpenRef.current || isHudYouTubeOpenRef.current) {
        return;
      }
      onClose();
    };

    const handleDocumentPointerDown = (e: MouseEvent | PointerEvent) => {
      if (isHudTrimmerOpenRef.current || isHudYouTubeOpenRef.current) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('[data-hud-pod]') || target.closest('[data-hud-modal]')) {
        return;
      }
      onClose();
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isHudTrimmerOpen && !isHudYouTubeOpen) {
          onClose();
        }
      }}
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
          className="flex-1 bg-[#0B0E14] border border-[#1B222E] rounded-2xl p-6 flex flex-col justify-between text-white min-w-0 h-full overflow-hidden shadow-2xl"
        >
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Header Row: Sleek Obsidian & Cyan Header */}
            <div className="w-full flex items-center justify-between pb-3.5 mb-2 border-b border-[#1B222E]">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8e95a5] hover:text-white text-[11px] font-bold transition-all cursor-pointer"
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
                    className={`w-[32px] h-[32px] flex items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      hearMyself
                        ? ''
                        : 'bg-[#151B25] hover:bg-[#1B222E] border-[#1B222E] text-[#8e95a5] hover:text-white'
                    }`}
                    title={hearMyself ? 'Hear Myself: ACTIVE' : 'Hear Myself: OFF'}
                  >
                    <Headphones size={15} />
                  </button>
                )}
              </div>

              {/* Center-Right: Stop All sounds pill button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onStopAll}
                  disabled={!hasActiveSounds}
                  className={`h-[32px] px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all duration-150 border box-border ${
                    hasActiveSounds
                      ? 'bg-[#e81123]/20 border-[#e81123] text-[#ff4d5e] cursor-pointer hover:bg-[#e81123]/30 active:scale-95'
                      : 'bg-[#151B25] border-[#1B222E] text-[#5a687c] cursor-not-allowed opacity-60'
                  }`}
                >
                  <Square size={12} className={hasActiveSounds ? 'fill-current text-[#ff4d5e]' : 'text-[#5a687c]'} />
                  <span className={hasActiveSounds ? 'font-bold text-[#ff4d5e]' : 'font-semibold text-[#8e95a5]'}>Stop All</span>
                  {activeSoundIds.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#ff4d5e] text-white text-[10px] font-mono font-bold leading-tight">
                      {activeSoundIds.length}
                    </span>
                  )}
                </button>

                {/* Right: Close button */}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Close Overlay (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Search, Filter Tabs & Sorting Toolbar */}
            <div className="w-full flex items-center justify-between gap-3 mb-2 px-1">
              {/* Left: Search input */}
              <div className="relative w-48 h-[32px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5a687c]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter sounds..."
                  className="w-full h-full pl-8 pr-6 bg-[#151B25] border border-[#1B222E] focus:border-[#31C5F4]/60 rounded-xl text-[11px] text-white placeholder-[#5a687c] focus:outline-none transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5a687c] hover:text-white"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Center: Filter Tabs */}
              <div className="h-[32px] flex items-center gap-1 bg-[#151B25] p-1 rounded-xl border border-[#1B222E]">
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
                      className={`h-full px-2.5 flex items-center gap-1 justify-center rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        activeFilter === tab.id
                          ? 'bg-[#123244] text-[#31C5F4] border border-[#31C5F4]/40 shadow-sm'
                          : 'text-[#8e95a5] hover:text-white'
                      }`}
                    >
                      {Icon && <Icon size={11} style={activeFilter === tab.id ? { color: accent } : undefined} className={activeFilter !== tab.id ? 'text-[#5a687c]' : undefined} />}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Sorting Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="h-[32px] px-3 whitespace-nowrap min-w-fit flex items-center gap-1.5 bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 rounded-xl text-[#8e95a5] hover:text-white text-[11px] font-semibold transition-all cursor-pointer"
                >
                  <ArrowUpDown size={12} style={{ color: accent }} className="shrink-0" />
                  <span className="whitespace-nowrap">{sortLabels[sortBy] || 'Sort'}</span>
                </button>

                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-40 bg-[#10141C] border border-[#1B222E] rounded-xl py-1 z-[100] animate-in fade-in zoom-in-95 duration-100 shadow-xl">
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

            {/* Center Grid of Soundboard Cards with Live Progress Bar Tint (Scrollbar hidden, natural compact rows) */}
            <div className="w-full flex-1 overflow-y-auto p-3 grid grid-cols-6 gap-3.5 no-scrollbar min-h-0 content-start auto-rows-max items-start">
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
                  const isClipSound = sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped');

                  return (
                    <div
                      key={sound.id}
                      data-sound-id={sound.id}
                      draggable={false}
                      onClick={() => {
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
                      className={`group relative flex flex-col items-center p-2 rounded-xl transition-all duration-150 cursor-pointer select-none ${
                        isPlaying || isSelected
                          ? 'bg-[#123244]/40 border-2 border-[#31C5F4] ring-1 ring-[#31C5F4]/30'
                          : 'bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/50'
                      }`}
                      title={`${sound.title} (Click to select & play)`}
                    >
                      {/* Integrated Artwork Container */}
                      <div className="relative w-full aspect-square rounded-xl bg-[#0E131A] border border-[#1B222E] flex items-center justify-center overflow-hidden">
                        {/* Artwork / Thumbnail */}
                        <div className="absolute inset-0 rounded-xl overflow-hidden flex items-center justify-center">
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
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0E131A] p-2 text-center pointer-events-none select-none">
                              {isClipSound ? (
                                <Clapperboard size={24} style={{ color: accent }} className="mb-1" />
                              ) : (
                                <Music size={24} style={{ color: accent }} className="mb-1" />
                              )}
                              <span className="text-[11px] font-bold text-white/90 line-clamp-2 px-1 leading-tight break-words">
                                {sound.title}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Top-Left Hotkey Badge */}
                        {sound.hotkey && (
                          <div className="absolute top-1.5 left-1.5 z-20 flex items-center">
                            <span
                              style={{ color: accent }}
                              className="px-1.5 py-0.5 rounded-md bg-[#123244] border border-[#31C5F4]/40 text-[10px] font-mono font-bold leading-none pointer-events-none shadow-sm"
                            >
                              {sound.hotkey}
                            </span>
                          </div>
                        )}

                        {/* Top-Right Favorite / Delete Button */}
                        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-20 pointer-events-auto">
                          {sound.isFavorite && (
                            <div className="p-1 rounded-full bg-black/70 text-yellow-400">
                              <Star size={11} className="fill-yellow-400" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteSound) {
                                onDeleteSound(sound.id);
                              }
                            }}
                            title="Delete Sound"
                            className="p-1 rounded-full opacity-0 group-hover:opacity-100 text-[#8e95a5] hover:text-[#ff453a] bg-black/70 hover:bg-black/90 transition-all cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Duration badge */}
                        {sound.duration > 0 && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[10px] font-mono font-bold text-white/90 border border-white/10 z-10 pointer-events-none">
                            {Math.floor(sound.duration / 60)}:{Math.floor(sound.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}

                        {/* Source Badge (YouTube only) */}
                        {sound.source === 'youtube' && (
                          <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[9px] font-mono font-bold text-[#31C5F4] z-10 pointer-events-none border border-[#31C5F4]/30">
                            YT
                          </div>
                        )}

                        {/* Playing Equalizer Animation Indicator (Subtle & Soft) */}
                        {isPlaying && (
                          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-15 pointer-events-none">
                            <div className="w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-[#31C5F4]/50 shadow-md flex items-center justify-center">
                              <div className="flex items-end gap-[3px] h-3.5 w-3.5 justify-center">
                                <span className="w-[2px] rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '55%', backgroundColor: accent }} />
                                <span className="w-[2px] rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%', backgroundColor: accent }} />
                                <span className="w-[2px] rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%', backgroundColor: accent }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Title (2-line clamp clean integration) */}
                      <div className="w-full mt-2 px-1 text-center">
                        <span className="text-[11px] font-bold text-white leading-tight line-clamp-2 break-words pointer-events-none">
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
                className="group relative flex flex-col items-center justify-center p-2 rounded-xl border-2 border-dashed border-[#1B222E] hover:border-[#31C5F4]/50 bg-[#151B25]/50 hover:bg-[#151B25] cursor-pointer transition-all hover:scale-[1.02] shadow-sm self-stretch min-h-[140px]"
                title="Search and add sound from YouTube"
              >
                <div
                  style={{ backgroundColor: `${accent}20`, color: accent }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors mb-2"
                >
                  <Plus size={20} className="stroke-[2.5]" />
                </div>
                <span className="text-[11.5px] font-bold text-[#8e95a5] group-hover:text-white transition-colors">
                  Add Sound
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Dock Control Pod (Matching Main App: Volume Sliders Pod + Now Playing Pill) */}
          <div className="w-full flex items-stretch gap-3 select-none">
            {/* Left Pod: Stacked Speaker & Mic Volume */}
            <div className="px-4 py-2 rounded-2xl bg-[#10141C] border border-[#1B222E] flex flex-col justify-center gap-2 shadow-xl flex-shrink-0 min-w-[220px] h-[64px]">
              {/* Speaker Volume */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isMuted) {
                      onSpeakerVolumeChange(100);
                    } else {
                      onSpeakerVolumeChange(0);
                    }
                  }}
                  className="flex items-center justify-center focus:outline-none cursor-pointer flex-shrink-0 text-[#31C5F4] hover:brightness-110"
                  title={isMuted ? 'Unmute Sounds' : 'Mute Sounds'}
                >
                  {isMuted ? <VolumeX size={15} className="text-[#ff3b30]" /> : <Volume2 size={15} />}
                </button>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={speakerVolume}
                  onChange={(val) => onSpeakerVolumeChange(val)}
                  className="w-28 sm:w-32"
                />
                <span className="font-mono text-[11px] font-semibold text-[#31C5F4] w-9 text-right flex-shrink-0">
                  {speakerVolume}%
                </span>
              </div>

              {/* Mic Volume */}
              {onMicProjectionVolumeChange && (
                <div className="flex items-center gap-2.5">
                  <Mic size={15} className="flex-shrink-0 text-[#31C5F4]" />
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={micProjectionVolume}
                    onChange={(val) => onMicProjectionVolumeChange(val)}
                    className="w-28 sm:w-32"
                  />
                  <span className="font-mono text-[11px] font-semibold text-[#31C5F4] w-9 text-right flex-shrink-0">
                    {micProjectionVolume}%
                  </span>
                </div>
              )}
            </div>

            {/* Right Pod: Now Playing Pill (Cover, Title/Subtitle, Scrubber Slider, Transport Controls) */}
            <div className="flex-1 px-4 py-2 rounded-2xl bg-[#10141C] border border-[#1B222E] flex items-center justify-between gap-4 shadow-xl min-w-0 h-[64px]">
              {/* Sound Cover & Name */}
              <div className="flex items-center gap-2.5 min-w-0 max-w-[200px]">
                <div className="w-10 h-10 rounded-lg bg-[#0E131A] border border-[#1B222E] overflow-hidden flex items-center justify-center text-[#5a687c] flex-shrink-0 shadow-sm">
                  {activeFloatingSound?.thumbnail ? (
                    <img
                      src={activeFloatingSound.thumbnail}
                      alt={activeFloatingSound.title}
                      className="w-full h-full object-cover"
                    />
                  ) : activeFloatingSound ? (
                    <Music size={18} className="text-[#31C5F4]" />
                  ) : (
                    <Music size={18} className="text-[#5a687c]" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-semibold text-white truncate" title={activeFloatingSound?.title || 'No Sound Playing'}>
                    {activeFloatingSound ? activeFloatingSound.title : 'No Sound Playing'}
                  </span>
                  <span className="text-[10px] text-[#5a687c] truncate">
                    {activeFloatingSound?.author ? (activeFloatingSound.author.startsWith('@') ? activeFloatingSound.author : `@${activeFloatingSound.author}`) : (activeFloatingSound ? 'Ready' : 'Select a sound to play')}
                  </span>
                </div>
              </div>

              {/* Scrubber Timeline */}
              <div className="flex-1 flex items-center min-w-0 px-1">
                <Slider
                  min={0}
                  max={1}
                  step={0.002}
                  value={activeFloatingProgress}
                  onChange={(val) => {
                    if (activeFloatingSound) {
                      if (window.soundboardAPI?.sendIpcCommand) {
                        window.soundboardAPI.sendIpcCommand('sync-seek-sound', {
                          soundId: activeFloatingSound.id,
                          progress: val,
                        });
                      } else {
                        audioEngine.seekSound(activeFloatingSound.id, val);
                      }
                    }
                  }}
                  disabled={!activeFloatingSound}
                  className="w-full"
                />
              </div>

              {/* Transport Controls: Previous, Play/Pause, Next */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!activeFloatingSound) return;
                    if (window.soundboardAPI?.sendIpcCommand) {
                      window.soundboardAPI.sendIpcCommand('sync-skip-sound', {
                        soundId: activeFloatingSound.id,
                        deltaSeconds: -5,
                      });
                    } else {
                      audioEngine.skipSound(activeFloatingSound.id, -5);
                    }
                  }}
                  disabled={!activeFloatingSound}
                  title="Rewind 5s"
                  className="p-1 rounded-lg text-[#5a687c] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!activeFloatingSound) return;
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
                  disabled={!activeFloatingSound}
                  title={activeFloatingSound && localPausedIds.includes(activeFloatingSound.id) ? 'Resume Playback' : 'Pause Playback'}
                  className="w-8 h-8 rounded-full border border-[#31C5F4] text-[#31C5F4] hover:bg-[#31C5F4] hover:text-[#090B10] flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
                >
                  {activeFloatingSound && !localPausedIds.includes(activeFloatingSound.id) ? (
                    <Pause size={13} className="fill-current" />
                  ) : (
                    <Play size={13} className="fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!activeFloatingSound) return;
                    if (window.soundboardAPI?.sendIpcCommand) {
                      window.soundboardAPI.sendIpcCommand('sync-skip-sound', {
                        soundId: activeFloatingSound.id,
                        deltaSeconds: 5,
                      });
                    } else {
                      audioEngine.skipSound(activeFloatingSound.id, 5);
                    }
                  }}
                  disabled={!activeFloatingSound}
                  title="Forward 5s"
                  className="p-1 rounded-lg text-[#5a687c] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Sound Properties Panel for HUD */}
        <div className="flex flex-col gap-3 h-full">
          {selectedSound && (
            <div className="w-[340px] min-w-[340px] flex-1 bg-[#10141C] border border-[#1B222E] rounded-2xl p-5 flex flex-col justify-between text-white overflow-hidden shadow-2xl">
            <div>
              {/* Action Buttons Row: Scissors, Duplicate, Star, Delete (Matching Reference Design) */}
              <div className="grid grid-cols-4 gap-2 mb-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsHudTrimmerOpen(true);
                  }}
                  title="Open Audio Trimmer"
                  className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-[#31C5F4] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Scissors size={15} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onDuplicateSound) {
                      onDuplicateSound(selectedSound);
                    }
                  }}
                  title="Duplicate Sound"
                  className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Copy size={15} />
                </button>

                {onUpdateSound && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateSound({ ...selectedSound, isFavorite: !selectedSound.isFavorite });
                    }}
                    title={selectedSound.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
                    className={`h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                      selectedSound.isFavorite
                        ? 'bg-[#292212] border-yellow-500/50 text-yellow-400'
                        : 'bg-[#151B25] border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
                    }`}
                  >
                    <Star size={15} className={selectedSound.isFavorite ? 'fill-yellow-400' : ''} />
                  </button>
                )}

                {onDeleteSound && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSound(selectedSound.id);
                    }}
                    title="Delete Sound"
                    className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-red-500/50 text-[#8e95a5] hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Selected Sound Info Card: Thumbnail, Title & Sound Creator */}
              <div className="flex items-center gap-3 p-1">
                <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-[#1B222E] shadow-sm bg-[#0E131A] flex-shrink-0 flex items-center justify-center">
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
                      <Clapperboard size={20} style={{ color: accent }} />
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: `${accent}20` }}
                    >
                      <Music size={20} style={{ color: accent }} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        type="text"
                        autoFocus
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle();
                          if (e.key === 'Escape') {
                            setEditedTitle(selectedSound.title);
                            setIsEditingTitle(false);
                          }
                        }}
                        onBlur={handleSaveTitle}
                        className="w-full bg-[#151B25] border border-[#31C5F4] rounded-lg px-2 py-0.5 text-[13px] text-white font-bold focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSaveTitle();
                        }}
                        className="w-6 h-6 rounded-md bg-[#31C5F4] text-[#090C12] flex items-center justify-center hover:brightness-110 shrink-0 cursor-pointer"
                        title="Save title"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0 group/title">
                      <h3 className="text-[13.5px] font-bold text-white truncate" title={selectedSound.title}>
                        {selectedSound.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingTitle(true);
                          setEditedTitle(selectedSound.title);
                        }}
                        title="Rename sound"
                        className="p-1 text-[#5a687c] hover:text-[#31C5F4] transition-colors cursor-pointer shrink-0"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-[#5a687c] truncate mt-0.5">
                    {selectedSound.author
                      ? (selectedSound.author.startsWith('@') ? `by ${selectedSound.author}` : `by @${selectedSound.author}`)
                      : selectedSound.source === 'clip'
                      ? 'from Game Clip'
                      : selectedSound.source === 'youtube'
                      ? 'from YouTube'
                      : 'Sound effect'}
                  </p>
                  {selectedSound.hotkey && (
                    <span
                      style={{ color: accent, borderColor: `${accent}40` }}
                      className="inline-block mt-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#123244] border"
                    >
                      Shortcut: {selectedSound.hotkey}
                    </span>
                  )}
                </div>
              </div>

              {/* Volume & Speed Sliders Box */}
              <div className="mt-3.5 space-y-2">
                <div className="p-2.5 bg-[#151B25] rounded-xl border border-[#1B222E] flex items-center gap-2.5">
                  <Volume2
                    size={14}
                    className={(selectedSound.volume ?? 100) > 100 ? 'text-[#f59e0b]' : ''}
                    style={(selectedSound.volume ?? 100) <= 100 ? { color: accent } : undefined}
                  />
                  <span className="text-[11px] font-semibold text-[#8e95a5] w-7">Vol</span>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={selectedSound.volume ?? 100}
                    onChange={(val) => handleVolumeChange(val)}
                    className="flex-1"
                  />
                  <span className={`text-[11px] font-mono font-bold w-10 text-right ${
                    (selectedSound.volume ?? 100) > 100 ? 'text-[#f59e0b]' : 'text-[#31C5F4]'
                  }`}>
                    {selectedSound.volume ?? 100}%
                  </span>
                </div>

                <div className="p-2.5 bg-[#151B25] rounded-xl border border-[#1B222E] flex items-center gap-2.5">
                  <SlidersHorizontal size={14} style={{ color: accent }} />
                  <span className="text-[11px] font-semibold text-[#8e95a5] w-9">Speed</span>
                  <Slider
                    min={0.25}
                    max={2.0}
                    step={0.05}
                    value={selectedSound.speed ?? 1.0}
                    onChange={(val) => handleSpeedChange(val)}
                    className="flex-1"
                  />
                  <span className="text-[11px] font-mono font-bold text-[#31C5F4] w-10 text-right">
                    {(selectedSound.speed ?? 1.0).toFixed(2)}x
                  </span>
                </div>
              </div>

              {/* Reproduction Mode */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 text-white font-bold text-[11px] mb-2">
                  <RotateCcw size={13} style={{ color: accent }} />
                  <span className="uppercase tracking-wider text-[#5a687c] text-[10px]">Playback Mode</span>
                </div>

                <div className="flex items-center justify-between gap-1 px-1">
                  {/* 1. Play & Overlap */}
                  <button
                    onClick={() => handleModeChange('overlap')}
                    title="Play & Overlap"
                    style={
                      selectedMode === 'overlap'
                        ? { backgroundColor: accent, color: '#090B10' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'overlap'
                        ? 'scale-105 shadow-lg'
                        : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24">
                      <path d="M7 5C4.5 7.5 4.5 16.5 7 19" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      <path d="M10 5l10 7-10 7V5z" fill="currentColor" />
                    </svg>
                  </button>

                  {/* 2. Play & Pause */}
                  <button
                    onClick={() => handleModeChange('pause')}
                    title="Play & Pause"
                    style={
                      selectedMode === 'pause'
                        ? { backgroundColor: accent, color: '#090B10' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'pause'
                        ? 'scale-105 shadow-lg'
                        : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 5l8 7-8 7V5z" />
                      <rect x="14" y="5" width="3" height="14" rx="1" />
                      <rect x="19" y="5" width="3" height="14" rx="1" />
                    </svg>
                  </button>

                  {/* 3. Play & Stop */}
                  <button
                    onClick={() => handleModeChange('stop')}
                    title="Play & Stop"
                    style={
                      selectedMode === 'stop'
                        ? { backgroundColor: accent, color: '#090B10' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'stop'
                        ? 'scale-105 shadow-lg'
                        : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 5l7 7-7 7V5z" />
                      <rect x="14" y="6" width="7" height="12" rx="1.5" />
                    </svg>
                  </button>

                  {/* 4. Play & Restart */}
                  <button
                    onClick={() => handleModeChange('restart')}
                    title="Play & Restart"
                    style={
                      selectedMode === 'restart'
                        ? { backgroundColor: accent, color: '#090B10' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'restart'
                        ? 'scale-105 shadow-lg'
                        : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4.5" y="5" width="2.5" height="14" rx="1" />
                      <path d="M9.5 5l10 7-10 7V5z" />
                    </svg>
                  </button>

                  {/* 5. Play & Loop */}
                  <button
                    onClick={() => handleModeChange('push_loop')}
                    title="Play & Loop"
                    style={
                      selectedMode === 'push_loop'
                        ? { backgroundColor: accent, color: '#090B10' }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedMode === 'push_loop'
                        ? 'scale-105 shadow-lg'
                        : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
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

                <div className="mt-1.5 text-center text-[11px] font-medium text-[#8e95a5]">
                  {selectedMode === 'overlap' && 'Play and Overlap'}
                  {selectedMode === 'pause' && 'Play and Pause'}
                  {selectedMode === 'stop' && 'Play and Stop'}
                  {selectedMode === 'restart' && 'Play and Restart'}
                  {selectedMode === 'push_loop' && 'Play and Loop'}
                </div>
              </div>

              {/* Reproduction Options Section (4 Checkbox options) */}
              <div className="mt-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-white font-bold text-[11px] mb-1.5">
                  <Sliders size={13} style={{ color: accent }} />
                  <span className="uppercase tracking-wider text-[#5a687c] text-[10px]">Playback Options</span>
                </div>

                {/* 1. Stop Other Sounds */}
                <div
                  onClick={() => handleOptionToggle('stopOtherSounds')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 cursor-pointer select-none transition-all"
                >
                  <span className="text-[11.5px] font-medium text-[#8e95a5]">
                    Stop Other Sounds
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      selectedOptions.stopOtherSounds
                        ? 'bg-[#31C5F4] text-[#090B10]'
                        : 'border border-[#233346] bg-[#0E131A]'
                    }`}
                  >
                    {selectedOptions.stopOtherSounds && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>

                {/* 2. Mute Other Sounds */}
                <div
                  onClick={() => handleOptionToggle('muteOtherSounds')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 cursor-pointer select-none transition-all"
                >
                  <span className="text-[11.5px] font-medium text-[#8e95a5]">
                    Mute Other Sounds
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      selectedOptions.muteOtherSounds
                        ? 'bg-[#31C5F4] text-[#090B10]'
                        : 'border border-[#233346] bg-[#0E131A]'
                    }`}
                  >
                    {selectedOptions.muteOtherSounds && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>

                {/* 3. Mute Voice */}
                <div
                  onClick={() => handleOptionToggle('muteVoice')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 cursor-pointer select-none transition-all"
                >
                  <span className="text-[11.5px] font-medium text-[#8e95a5]">
                    Mute Voice
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      selectedOptions.muteVoice
                        ? 'bg-[#31C5F4] text-[#090B10]'
                        : 'border border-[#233346] bg-[#0E131A]'
                    }`}
                  >
                    {selectedOptions.muteVoice && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>

                {/* 4. Loop */}
                <div
                  onClick={() => handleOptionToggle('loop')}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 cursor-pointer select-none transition-all"
                >
                  <span className="text-[11.5px] font-medium text-[#8e95a5]">
                    Loop
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      selectedOptions.loop
                        ? 'bg-[#31C5F4] text-[#090B10]'
                        : 'border border-[#233346] bg-[#0E131A]'
                    }`}
                  >
                    {selectedOptions.loop && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

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

      {/* Embedded Audio Trimmer Modal for HUD */}
      {isHudTrimmerOpen && selectedSound && (
        <AudioTrimmerModal
          sound={selectedSound}
          isOpen={isHudTrimmerOpen}
          onClose={() => setIsHudTrimmerOpen(false)}
          accentColor={accent}
          onSaveTrim={(id, start, end) => {
            if (onUpdateSound) {
              onUpdateSound({
                ...selectedSound,
                trimStart: start,
                trimEnd: end,
                duration: Math.max(0.1, end - start),
              });
            }
            setIsHudTrimmerOpen(false);
          }}
          onSaveAsNewTrim={(id, start, end) => {
            if (onDuplicateSound) {
              onDuplicateSound({
                ...selectedSound,
                title: `${selectedSound.title} (Trimmed)`,
                trimStart: start,
                trimEnd: end,
                duration: Math.max(0.1, end - start),
              });
            }
            setIsHudTrimmerOpen(false);
          }}
        />
      )}
    </div>
  );
};
