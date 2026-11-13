import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SoundItem, ReproductionMode, YouTubeSearchResult } from '../types';
import {
  Volume2,
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
  Scissors,
  SlidersHorizontal,
  Trash2,
  Copy,
  ArrowUpDown,
  Search,
  Video,
  Clapperboard,
  Star,
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
import { EditSoundModal } from './EditSoundModal';
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
  onPlaySound,
  onStopAll,
  onClose,
  onSpeakerVolumeChange,
  onMicProjectionVolumeChange,
  onToggleHearMyself,
  onUpdateSound,
  onDeleteSound,
  onDuplicateSound,
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
  const [isHudEditOpen, setIsHudEditOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites' | 'clips' | 'youtube'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration'>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  const isHudTrimmerOpenRef = useRef(isHudTrimmerOpen);
  isHudTrimmerOpenRef.current = isHudTrimmerOpen;
  const isHudYouTubeOpenRef = useRef(isHudYouTubeOpen);
  isHudYouTubeOpenRef.current = isHudYouTubeOpen;
  const isHudEditOpenRef = useRef(isHudEditOpen);
  isHudEditOpenRef.current = isHudEditOpen;

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
        (s.author && s.author.toLowerCase().includes(searchQuery.toLowerCase()));

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
    newest: 'Recently added',
    oldest: 'Oldest first',
    alphabetical: 'Alphabetical (A-Z)',
    most_played: 'Most played',
    duration: 'Duration',
  };

  const selectedSound = useMemo(() => {
    return sounds.find((s) => s.id === selectedSoundId) || sounds[0] || null;
  }, [sounds, selectedSoundId]);

  // Global Esc key & window blur listener so Escape or clicking off closes overlay
  useEffect(() => {
    if (!isOpen && !isStandaloneOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isHudEditOpenRef.current) {
          setIsHudEditOpen(false);
          return;
        }
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
      if (isHudTrimmerOpenRef.current || isHudYouTubeOpenRef.current || isHudEditOpenRef.current) {
        return;
      }
      onClose();
    };

    const handleDocumentPointerDown = (e: MouseEvent | PointerEvent) => {
      if (isHudTrimmerOpenRef.current || isHudYouTubeOpenRef.current || isHudEditOpenRef.current) {
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

  const hasActiveSounds = activeSoundIds.length > 0;

  const handleOpenMainApp = () => {
    if (window.soundboardAPI?.showMainWindow) {
      window.soundboardAPI.showMainWindow();
    }
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

    setSounds((prev) =>
      prev.map((s) => (s.id === selectedSound.id ? { ...s, volume: clamped } : s))
    );

    audioEngine.setSoundVolume(selectedSound.id, clamped);
    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-volume-live', { soundId: selectedSound.id, volume: clamped });
    }

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

    setSounds((prev) =>
      prev.map((s) => (s.id === selectedSound.id ? { ...s, speed: clamped } : s))
    );

    audioEngine.setSoundSpeed(selectedSound.id, clamped);
    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-speed-live', { soundId: selectedSound.id, speed: clamped });
    }

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
        if (e.target === e.currentTarget && !isHudTrimmerOpen && !isHudYouTubeOpen && !isHudEditOpen) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-[9999] flex items-center justify-center select-none ${
        isStandaloneOverlay ? 'bg-transparent p-0' : 'bg-black/75 backdrop-blur-md p-4'
      }`}
    >
      {/* Central Unified Mainstream Overlay Dashboard Container */}
      <div
        data-hud-pod="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1380px] h-[720px] max-h-[94vh] bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_30px_90px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden animate-in fade-in duration-150"
      >
        {/* Top Header Bar: Edge-to-Edge Desktop Bar (Matching Main App Image) */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/80 backdrop-blur-md shrink-0">
          {/* Left: PRISM HUD Brand & Open Main App */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
              <span className="text-[13px] font-black uppercase tracking-wider text-white">
                PRISM <span style={{ color: accent }}>HUD</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenMainApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white text-[11px] font-bold transition-all cursor-pointer"
              title="Open full Prism Soundboard desktop app"
            >
              <ExternalLink size={12} style={{ color: accent }} />
              <span>Open App</span>
            </button>
          </div>

          {/* Center: Search & Filter Tabs */}
          <div className="flex items-center gap-3">
            <div className="relative w-64 md:w-80">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5A687C]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sounds, clips, tags..."
                className="w-full pl-9 pr-8 py-2 bg-[#151B25] border border-[#1B222E] focus:border-[#31C5F4]/60 rounded-xl text-[12px] text-white placeholder-[#5A687C] focus:outline-none transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A687C] hover:text-white cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[#151B25] p-1 rounded-xl border border-[#1B222E] shrink-0">
              {([
                { id: 'all', label: 'All' },
                { id: 'favorites', label: 'Favorites', icon: Star },
                { id: 'clips', label: 'Clips', icon: Clapperboard },
                { id: 'youtube', label: 'YouTube', icon: Video },
              ] as const).map((tab) => {
                const Icon = (tab as any).icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`h-7 px-2.5 flex items-center gap-1 justify-center rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      activeFilter === tab.id
                        ? 'bg-[#123244] text-[#31C5F4] border border-[#31C5F4]/40 shadow-sm'
                        : 'text-[#8E95A5] hover:text-white'
                    }`}
                  >
                    {Icon && <Icon size={11} style={activeFilter === tab.id ? { color: accent } : undefined} />}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Toolbar: Stop All, Headphones, Add Sound, Close */}
          <div className="flex items-center gap-2">
            {/* Stop All Button */}
            <button
              type="button"
              onClick={onStopAll}
              disabled={!hasActiveSounds}
              className={`h-8 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all border ${
                hasActiveSounds
                  ? 'bg-red-500/20 border-red-500 text-red-400 cursor-pointer hover:bg-red-500/30 active:scale-95'
                  : 'bg-[#151B25] border-[#1B222E] text-[#5A687C] cursor-not-allowed opacity-50'
              }`}
            >
              <Square size={11} className={hasActiveSounds ? 'fill-current' : ''} />
              <span>Stop All</span>
              {activeSoundIds.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[9.5px] font-mono font-bold leading-tight">
                  {activeSoundIds.length}
                </span>
              )}
            </button>

            {/* Hear Myself Headphone Monitor Toggle */}
            {onToggleHearMyself && (
              <button
                type="button"
                onClick={onToggleHearMyself}
                style={
                  hearMyself
                    ? { backgroundColor: `${accent}25`, borderColor: accent, color: accent }
                    : undefined
                }
                className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  hearMyself
                    ? ''
                    : 'bg-[#151B25] hover:bg-[#1B222E] border-[#1B222E] text-[#8E95A5] hover:text-white'
                }`}
                title={hearMyself ? 'Hear Myself: ACTIVE' : 'Hear Myself: OFF'}
              >
                <Headphones size={14} />
              </button>
            )}

            {/* Add Sound / YouTube Downloader */}
            <button
              type="button"
              onClick={() => setIsHudYouTubeOpen(true)}
              style={{ backgroundColor: accent, color: '#090C12' }}
              className="w-8 h-8 rounded-xl flex items-center justify-center font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
              title="Download Sound from YouTube"
            >
              <Plus size={16} className="stroke-[2.5]" />
            </button>

            {/* Close HUD */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close Overlay (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Main Content Area: Left Center Sound Library + Right Integrated Properties Panel */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Center Library Grid Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0B0E14] overflow-hidden">
            {/* Library Subheader */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2 shrink-0">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[17px] font-extrabold text-white tracking-wide">
                  Sound library
                </h2>
                <span className="text-[11.5px] text-[#5A687C] font-semibold">
                  {filteredSounds.length} sounds
                </span>
              </div>

              {/* Sorting Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="h-8 px-3 flex items-center gap-1.5 bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 rounded-xl text-[#8E95A5] hover:text-white text-[11px] font-semibold transition-all cursor-pointer"
                >
                  <ArrowUpDown size={12} style={{ color: accent }} className="shrink-0" />
                  <span>SORT BY <strong className="text-white font-bold">{sortLabels[sortBy] || 'Recently added'}</strong></span>
                </button>

                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#10141C] border border-[#1B222E] rounded-xl py-1 z-[100] animate-in fade-in zoom-in-95 duration-100 shadow-xl">
                    {(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map((key) => (
                      <button
                        key={key}
                        type="button"
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

            {/* Sound Cards Grid */}
            <div className="flex-1 overflow-y-auto px-6 py-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3.5 content-start auto-rows-max">
              {filteredSounds.length === 0 ? (
                <div className="col-span-full py-20 text-center text-[#5A687C] text-[13px] font-semibold">
                  No sounds matched your filter query.
                </div>
              ) : (
                filteredSounds.map((sound) => {
                  const isPlaying = activeSoundIds.includes(sound.id);
                  const isSelected = selectedSoundId === sound.id;
                  const hasThumbnail = !!sound.thumbnail;
                  const isClipSound = sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped');

                  return (
                    <div
                      key={sound.id}
                      onClick={() => {
                        setSelectedSoundId(sound.id);
                        onPlaySound(sound);
                      }}
                      style={
                        isSelected || isPlaying
                          ? { borderColor: accent }
                          : undefined
                      }
                      className={`group relative flex flex-col justify-between p-2.5 rounded-2xl transition-all duration-150 cursor-pointer select-none shadow-sm ${
                        isPlaying || isSelected
                          ? 'bg-[#151B25] border-2 border-[#31C5F4] ring-1 ring-[#31C5F4]/30 shadow-[0_0_15px_rgba(49,197,244,0.15)]'
                          : 'bg-[#10141C] hover:bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40'
                      }`}
                      title={`${sound.title} (Click to select & play)`}
                    >
                      {/* Artwork Box */}
                      <div className="relative w-full aspect-[4/3] rounded-xl bg-[#090C12] border border-[#1B222E] flex items-center justify-center overflow-hidden">
                        {hasThumbnail ? (
                          <img
                            src={sound.thumbnail}
                            alt={sound.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#090C12] p-2 text-center">
                            {isClipSound ? (
                              <Clapperboard size={24} style={{ color: accent }} className="mb-1" />
                            ) : (
                              <Music size={24} style={{ color: accent }} className="mb-1" />
                            )}
                          </div>
                        )}

                        {/* Top-Left Hotkey Badge */}
                        {sound.hotkey && (
                          <div className="absolute top-1.5 left-1.5 z-20 flex items-center">
                            <span
                              style={{ color: accent }}
                              className="px-1.5 py-0.5 rounded-md bg-[#123244] border border-[#31C5F4]/40 text-[10px] font-mono font-bold leading-none shadow-sm"
                            >
                              {sound.hotkey}
                            </span>
                          </div>
                        )}

                        {/* Top-Right Favorite Star */}
                        {sound.isFavorite && (
                          <div className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-yellow-400 z-20">
                            <Star size={11} className="fill-yellow-400" />
                          </div>
                        )}

                        {/* Duration Badge */}
                        {sound.duration > 0 && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[10px] font-mono font-bold text-white/90 border border-white/10 z-10 pointer-events-none">
                            {Math.floor(sound.duration / 60)}:{Math.floor(sound.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}

                        {/* Playing Equalizer Animation Indicator */}
                        {isPlaying && (
                          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center z-15 pointer-events-none">
                            <div className="w-9 h-9 rounded-full bg-black/70 backdrop-blur-md border border-[#31C5F4]/50 shadow-md flex items-center justify-center">
                              <div className="flex items-end gap-[3px] h-3.5 w-3.5 justify-center">
                                <span className="w-[2px] rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '55%', backgroundColor: accent }} />
                                <span className="w-[2px] rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%', backgroundColor: accent }} />
                                <span className="w-[2px] rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%', backgroundColor: accent }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <div className="w-full mt-2 px-0.5 text-center">
                        <span className="text-[11.5px] font-bold text-white leading-tight line-clamp-2 break-words">
                          {sound.title}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Dock: Dual-Pod Volume & Transport Bar */}
            <div className="px-6 py-3 border-t border-[#1B222E] bg-[#0E121A] flex items-center justify-between gap-4 shrink-0">
              {/* Left Pod: Speaker Volume & Mic Gain */}
              <div className="px-4 py-2 rounded-2xl bg-[#10141C] border border-[#1B222E] flex items-center gap-4 shadow-xl shrink-0 h-[60px]">
                <div className="flex items-center gap-2">
                  <Volume2 size={15} style={{ color: accent }} className="flex-shrink-0" />
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={speakerVolume}
                    onChange={(val) => onSpeakerVolumeChange(val)}
                    className="w-24 sm:w-28"
                  />
                  <span className="font-mono text-[11px] font-semibold text-[#31C5F4] w-8 text-right flex-shrink-0">
                    {speakerVolume}%
                  </span>
                </div>

                {onMicProjectionVolumeChange && (
                  <div className="flex items-center gap-2">
                    <Mic size={15} style={{ color: accent }} className="flex-shrink-0" />
                    <Slider
                      min={0}
                      max={200}
                      step={1}
                      value={micProjectionVolume}
                      onChange={(val) => onMicProjectionVolumeChange(val)}
                      className="w-24 sm:w-28"
                    />
                    <span className="font-mono text-[11px] font-semibold text-[#31C5F4] w-8 text-right flex-shrink-0">
                      {micProjectionVolume}%
                    </span>
                  </div>
                )}
              </div>

              {/* Right Pod: Now Playing Pill */}
              <div className="flex-1 px-4 py-2 rounded-2xl bg-[#10141C] border border-[#1B222E] flex items-center justify-between gap-4 shadow-xl min-w-0 h-[60px]">
                {/* Sound Cover & Name */}
                <div className="flex items-center gap-2.5 min-w-0 max-w-[200px]">
                  <div className="w-9 h-9 rounded-xl bg-[#151B25] border border-[#1B222E] overflow-hidden flex items-center justify-center text-[#5A687C] flex-shrink-0 shadow-sm">
                    {activeFloatingSound?.thumbnail ? (
                      <img
                        src={activeFloatingSound.thumbnail}
                        alt={activeFloatingSound.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music size={16} style={{ color: accent }} />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-semibold text-white truncate" title={activeFloatingSound?.title || 'No Sound Playing'}>
                      {activeFloatingSound ? activeFloatingSound.title : 'No Sound Playing'}
                    </span>
                    <span className="text-[10px] text-[#5A687C] truncate">
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
                <div className="flex items-center gap-1 flex-shrink-0">
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
                    className="p-1 rounded-lg text-[#5A687C] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
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
                    className="w-8 h-8 rounded-full border border-[#31C5F4] text-[#31C5F4] hover:bg-[#31C5F4] hover:text-[#090C12] flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
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
                    className="p-1 rounded-lg text-[#5A687C] hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Integrated Sound Properties Panel */}
          {selectedSound ? (
            <aside className="w-[340px] min-w-[340px] bg-[#0E121A] border-l border-[#1B222E] p-5 flex flex-col justify-between overflow-y-auto shrink-0 select-none">
              <div>
                {/* Action Buttons Row: Scissors, Duplicate, Star, Delete */}
                <div className="grid grid-cols-4 gap-2 mb-3.5">
                  <button
                    type="button"
                    onClick={() => setIsHudTrimmerOpen(true)}
                    title="Open Audio Trimmer"
                    className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-[#31C5F4] flex items-center justify-center transition-colors cursor-pointer"
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
                    className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
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
                          : 'bg-[#151B25] border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
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
                      className="h-9 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-red-500/50 text-[#8E95A5] hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Selected Sound Info Card: Artwork + Title + PENCIL BUTTON opens EditSoundModal */}
                <div className="flex items-center gap-3 p-1">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-[#1B222E] shadow-sm bg-[#090C12] flex-shrink-0 flex items-center justify-center">
                    {selectedSound.thumbnail ? (
                      <img
                        src={selectedSound.thumbnail}
                        alt={selectedSound.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music size={20} style={{ color: accent }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-[13.5px] font-bold text-white truncate" title={selectedSound.title}>
                        {selectedSound.title}
                      </h3>
                      {/* PENCIL BUTTON: Opens EditSoundModal */}
                      <button
                        type="button"
                        onClick={() => setIsHudEditOpen(true)}
                        title="Edit sound details"
                        className="p-1 text-[#5A687C] hover:text-[#31C5F4] transition-colors cursor-pointer shrink-0"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                    <p className="text-[11px] text-[#5A687C] truncate mt-0.5">
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

                {/* Volume & Speed Sliders */}
                <div className="mt-4 space-y-2.5">
                  <div className="p-3 bg-[#151B25] rounded-xl border border-[#1B222E] flex items-center gap-2.5">
                    <Volume2
                      size={14}
                      className={(selectedSound.volume ?? 100) > 100 ? 'text-[#f59e0b]' : ''}
                      style={(selectedSound.volume ?? 100) <= 100 ? { color: accent } : undefined}
                    />
                    <span className="text-[11px] font-semibold text-[#8E95A5] w-7">Vol</span>
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

                  <div className="p-3 bg-[#151B25] rounded-xl border border-[#1B222E] flex items-center gap-2.5">
                    <SlidersHorizontal size={14} style={{ color: accent }} />
                    <span className="text-[11px] font-semibold text-[#8E95A5] w-9">Speed</span>
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
                    <span className="uppercase tracking-wider text-[#5A687C] text-[10px]">Playback Mode</span>
                  </div>

                  <div className="flex items-center justify-between gap-1 px-1">
                    {/* 1. Play & Overlap */}
                    <button
                      type="button"
                      onClick={() => handleModeChange('overlap')}
                      title="Play & Overlap"
                      style={
                        selectedMode === 'overlap'
                          ? { backgroundColor: accent, color: '#090C12' }
                          : undefined
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        selectedMode === 'overlap'
                          ? 'scale-105 shadow-lg'
                          : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24">
                        <path d="M7 5C4.5 7.5 4.5 16.5 7 19" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M10 5l10 7-10 7V5z" fill="currentColor" />
                      </svg>
                    </button>

                    {/* 2. Play & Pause */}
                    <button
                      type="button"
                      onClick={() => handleModeChange('pause')}
                      title="Play & Pause"
                      style={
                        selectedMode === 'pause'
                          ? { backgroundColor: accent, color: '#090C12' }
                          : undefined
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        selectedMode === 'pause'
                          ? 'scale-105 shadow-lg'
                          : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
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
                      type="button"
                      onClick={() => handleModeChange('stop')}
                      title="Play & Stop"
                      style={
                        selectedMode === 'stop'
                          ? { backgroundColor: accent, color: '#090C12' }
                          : undefined
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        selectedMode === 'stop'
                          ? 'scale-105 shadow-lg'
                          : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 5l7 7-7 7V5z" />
                        <rect x="14" y="6" width="7" height="12" rx="1.5" />
                      </svg>
                    </button>

                    {/* 4. Play & Restart */}
                    <button
                      type="button"
                      onClick={() => handleModeChange('restart')}
                      title="Play & Restart"
                      style={
                        selectedMode === 'restart'
                          ? { backgroundColor: accent, color: '#090C12' }
                          : undefined
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        selectedMode === 'restart'
                          ? 'scale-105 shadow-lg'
                          : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
                      }`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4.5" y="5" width="2.5" height="14" rx="1" />
                        <path d="M9.5 5l10 7-10 7V5z" />
                      </svg>
                    </button>

                    {/* 5. Play & Loop */}
                    <button
                      type="button"
                      onClick={() => handleModeChange('push_loop')}
                      title="Play & Loop"
                      style={
                        selectedMode === 'push_loop'
                          ? { backgroundColor: accent, color: '#090C12' }
                          : undefined
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        selectedMode === 'push_loop'
                          ? 'scale-105 shadow-lg'
                          : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8E95A5] hover:text-white'
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

                  <div className="mt-1.5 text-center text-[11px] font-medium text-[#8E95A5]">
                    {selectedMode === 'overlap' && 'Play and Overlap'}
                    {selectedMode === 'pause' && 'Play and Pause'}
                    {selectedMode === 'stop' && 'Play and Stop'}
                    {selectedMode === 'restart' && 'Play and Restart'}
                    {selectedMode === 'push_loop' && 'Play and Loop'}
                  </div>
                </div>

                {/* Reproduction Options Section (4 Checkbox options) */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-white font-bold text-[11px] mb-1.5">
                    <Sliders size={13} style={{ color: accent }} />
                    <span className="uppercase tracking-wider text-[#5A687C] text-[10px]">Playback Options</span>
                  </div>

                  {/* 1. Stop Other Sounds */}
                  <div
                    onClick={() => handleOptionToggle('stopOtherSounds')}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 cursor-pointer select-none transition-all"
                  >
                    <span className="text-[11.5px] font-medium text-[#8E95A5]">
                      Stop Other Sounds
                    </span>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        selectedOptions.stopOtherSounds
                          ? 'bg-[#31C5F4] text-[#090C12]'
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
                    <span className="text-[11.5px] font-medium text-[#8E95A5]">
                      Mute Other Sounds
                    </span>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        selectedOptions.muteOtherSounds
                          ? 'bg-[#31C5F4] text-[#090C12]'
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
                    <span className="text-[11.5px] font-medium text-[#8E95A5]">
                      Mute Voice
                    </span>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        selectedOptions.muteVoice
                          ? 'bg-[#31C5F4] text-[#090C12]'
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
                    <span className="text-[11.5px] font-medium text-[#8E95A5]">
                      Loop
                    </span>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        selectedOptions.loop
                          ? 'bg-[#31C5F4] text-[#090C12]'
                          : 'border border-[#233346] bg-[#0E131A]'
                      }`}
                    >
                      {selectedOptions.loop && <Check size={11} strokeWidth={3} />}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
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

      {/* Embedded Edit Sound Modal for HUD */}
      {isHudEditOpen && selectedSound && (
        <EditSoundModal
          isOpen={isHudEditOpen}
          sound={selectedSound}
          onClose={() => setIsHudEditOpen(false)}
          accentColor={accent}
          onSave={(updated) => {
            if (onUpdateSound) {
              onUpdateSound(updated);
            }
            setSounds((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setIsHudEditOpen(false);
          }}
        />
      )}
    </div>
  );
};
