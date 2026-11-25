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
  SlidersHorizontal,
  Check,
  Plus,
  Scissors,
  Trash2,
  Copy,
  ArrowUpDown,
  Search,
  Clapperboard,
  Star,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  Pencil,
  RotateCcw,
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
  enableFrostedGlass?: boolean;
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
  enableFrostedGlass = true,
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
  const accent = accentColor || 'var(--accent-color)';
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
          return a.title.localeCompare(b.title);
        case 'most_played':
          return (b.playCount || 0) - (a.playCount || 0);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        default:
          return 0;
      }
    });
  }, [sounds, searchQuery, activeFilter, sortBy]);

  const selectedSound = useMemo(() => {
    if (!selectedSoundId) return null;
    return sounds.find((s) => s.id === selectedSoundId) || null;
  }, [sounds, selectedSoundId]);

  // Handle hotkeys (Esc closes overlay)
  useEffect(() => {
    if (!isOpen && !isStandaloneOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHudYouTubeOpen) {
          setIsHudYouTubeOpen(false);
          return;
        }
        if (isHudTrimmerOpen) {
          setIsHudTrimmerOpen(false);
          return;
        }
        if (isHudEditOpen) {
          setIsHudEditOpen(false);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isStandaloneOverlay, isHudYouTubeOpen, isHudTrimmerOpen, isHudEditOpen, onClose]);

  if (!isOpen && !isStandaloneOverlay) return null;

  const hasActiveSounds = activeSoundIds.length > 0;

  const handleOpenMainApp = () => {
    if (window.soundboardAPI?.showMainWindow) {
      window.soundboardAPI.showMainWindow();
      onClose();
    }
  };

  const sortLabels: Record<string, string> = {
    newest: 'Recently added',
    oldest: 'Oldest added',
    alphabetical: 'Alphabetical',
    most_played: 'Most played',
    duration: 'Duration',
  };

  const handleModeChange = (mode: ReproductionMode) => {
    if (!selectedSound || !onUpdateSound) return;
    const updated = { ...selectedSound, reproductionMode: mode };
    onUpdateSound(updated);
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? updated : s)));
  };

  const handleOptionToggle = (key: 'stopOtherSounds' | 'muteOtherSounds' | 'muteVoice' | 'loop') => {
    if (!selectedSound || !onUpdateSound) return;
    const currentOptions = selectedSound.reproductionOptions || {
      stopOtherSounds: true,
      muteOtherSounds: false,
      muteVoice: false,
      loop: false,
    };
    const updatedOptions = { ...currentOptions, [key]: !currentOptions[key] };
    const updated = { ...selectedSound, reproductionOptions: updatedOptions };
    onUpdateSound(updated);
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? updated : s)));
  };

  const handleVolumeChange = (vol: number) => {
    if (!selectedSound) return;
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? { ...s, volume: vol } : s)));
    audioEngine.setSoundVolume(selectedSound.id, vol);

    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-volume-live', { soundId: selectedSound.id, volume: vol });
    }

    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      if (onUpdateSound) onUpdateSound({ ...selectedSound, volume: vol });
    }, 120);
  };

  const handleSpeedChange = (speed: number) => {
    if (!selectedSound) return;
    const clamped = Math.round(speed * 20) / 20;
    setSounds((prev) => prev.map((s) => (s.id === selectedSound.id ? { ...s, speed: clamped } : s)));
    audioEngine.setSoundSpeed(selectedSound.id, clamped);

    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-speed-live', { soundId: selectedSound.id, speed: clamped });
    }

    if (speedDebounceRef.current) clearTimeout(speedDebounceRef.current);
    speedDebounceRef.current = setTimeout(() => {
      if (onUpdateSound) onUpdateSound({ ...selectedSound, speed: clamped });
    }, 120);
  };

  const selectedOptions = selectedSound?.reproductionOptions || {
    stopOtherSounds: true,
    muteOtherSounds: false,
    muteVoice: false,
    loop: false,
  };
  const selectedMode: ReproductionMode = selectedSound?.reproductionMode || 'stop';

  const activeFloatingSound = useMemo(() => {
    if (!activeSoundIds || activeSoundIds.length === 0) return null;
    for (let i = activeSoundIds.length - 1; i >= 0; i--) {
      const match = sounds.find((s) => s.id === activeSoundIds[i]);
      if (match) return match;
    }
    return null;
  }, [activeSoundIds, sounds]);

  const activeFloatingProgress = activeFloatingSound ? playbackProgressMap[activeFloatingSound.id] || 0 : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isHudTrimmerOpen && !isHudYouTubeOpen && !isHudEditOpen) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-[9999] flex flex-col select-none overflow-hidden ${
        isStandaloneOverlay
          ? 'w-full h-full bg-[#090b10]/35 rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.22)]'
          : 'w-full h-full bg-[#090b10]/45 backdrop-blur-2xl'
      }`}
    >
      {/* Main HUD Full-View Container */}
      <div
        data-hud-pod="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex flex-col overflow-hidden bg-transparent"
      >
        {/* Top Header Bar */}
        <header className="h-14 px-5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.03] backdrop-blur-xl shrink-0">
          {/* Left: Brand Identity & Open Main App */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-white tracking-tight">Prism HUD</span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenMainApp}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
              title="Open full Prism Soundboard desktop app"
            >
              <ExternalLink size={12} className="text-accent" />
              <span>Open app</span>
            </button>
          </div>

          {/* Center: Search & Segmented Filter Tabs */}
          <div className="flex items-center gap-3">
            <div className="relative w-64 md:w-72">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sounds, clips, tags..."
                className="w-full pl-8 pr-7 py-1.5 bg-white/[0.04] border border-white/[0.08] focus:border-accent rounded-lg text-[12px] text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Segmented Filter Control */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
              {([
                { id: 'all', label: 'All' },
                { id: 'favorites', label: 'Favorites' },
                { id: 'clips', label: 'Clips' },
                { id: 'youtube', label: 'YouTube' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`h-7 px-3 flex items-center justify-center rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-white/[0.12] text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Stop All Button */}
            <button
              type="button"
              onClick={onStopAll}
              disabled={!hasActiveSounds}
              className={`h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors border ${
                hasActiveSounds
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 cursor-pointer hover:bg-rose-500/25'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <Square size={11} className={hasActiveSounds ? 'fill-current' : ''} />
              <span>Stop all</span>
              {activeSoundIds.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9.5px] font-mono font-bold leading-tight tabular-nums">
                  {activeSoundIds.length}
                </span>
              )}
            </button>

            {/* Hear Myself Toggle */}
            {onToggleHearMyself && (
              <button
                type="button"
                onClick={onToggleHearMyself}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  hearMyself
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
                title={hearMyself ? 'Hear myself: On' : 'Hear myself: Off'}
              >
                <Headphones size={14} />
              </button>
            )}

            {/* Add Sound */}
            <button
              type="button"
              onClick={() => setIsHudYouTubeOpen(true)}
              className="w-8 h-8 rounded-lg bg-accent text-slate-950 hover:brightness-110 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Download sound from YouTube"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>

            {/* Close HUD */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close overlay (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* Main Content Area: Sound Grid + Inspector */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sound Library Grid */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent overflow-hidden">
            {/* Library Subheader */}
            <div className="flex items-center justify-between px-6 pt-3.5 pb-2 shrink-0">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[14px] font-semibold text-white tracking-tight">Sound library</h2>
                <span className="text-[11px] text-slate-400 tabular-nums">({filteredSounds.length})</span>
              </div>

              {/* Sorting Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="h-7 px-2.5 flex items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-md text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <ArrowUpDown size={11} className="text-accent" />
                  <span>Sort: {sortLabels[sortBy] || 'Recently added'}</span>
                </button>

                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1 w-40 frosted-dropdown bg-[#0e1219]/50 backdrop-blur-2xl border border-white/[0.14] rounded-xl p-1 z-[100] shadow-2xl">
                    {(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSortBy(key as any);
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-[11px] font-medium flex items-center justify-between hover:bg-white/[0.06] transition-colors cursor-pointer ${
                          sortBy === key ? 'text-accent font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <span>{sortLabels[key]}</span>
                        {sortBy === key && <Check size={12} className="text-accent" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sound Cards Grid */}
            <div className="flex-1 overflow-y-auto px-6 py-2 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start auto-rows-max">
              {filteredSounds.length === 0 ? (
                <div className="col-span-full py-20 text-center text-slate-500 text-[13px] font-medium">
                  No sounds match your search.
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
                      className="group relative flex flex-col cursor-pointer select-none transition-all duration-200"
                    >
                      {/* Ambient Thumbnail Color Glow (Radiating outward past card borders) */}
                      {hasThumbnail ? (
                        <div
                          className={`ambient-glow absolute -inset-3 rounded-2xl bg-cover bg-center blur-2xl pointer-events-none transition-opacity duration-300 ${
                            isSelected || isPlaying ? 'opacity-55' : 'opacity-35'
                          }`}
                          style={{ backgroundImage: `url(${sound.thumbnail})` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <div
                          className={`ambient-glow absolute -inset-3 rounded-2xl bg-accent/20 blur-2xl pointer-events-none transition-opacity duration-300 ${
                            isSelected || isPlaying ? 'opacity-35' : 'opacity-15'
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      {/* Frosted Glass Card Surface */}
                      <div
                        className={`frosted-card relative flex flex-col p-2 rounded-xl border transition-all duration-200 overflow-hidden ${
                          isSelected
                            ? 'bg-[#122538]/75 border-accent/80 backdrop-blur-2xl shadow-md ring-1 ring-accent/30'
                            : isPlaying
                            ? 'bg-[#102030]/70 border-accent/60 backdrop-blur-2xl shadow-md ring-1 ring-accent/20'
                            : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.1] hover:border-white/[0.22] backdrop-blur-2xl shadow-xs'
                        }`}
                      >
                        {/* Subtle top specular highlight */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />

                        {/* Media Area */}
                        <div className="relative z-10 w-full aspect-[4/3] rounded-lg bg-black/50 border border-white/[0.08] flex items-center justify-center overflow-hidden shadow-sm">
                          {hasThumbnail ? (
                            <img
                              src={sound.thumbnail}
                              alt={sound.title}
                              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                              {isClipSound ? (
                                <Clapperboard size={22} className="text-accent opacity-80" />
                              ) : (
                                <Music size={22} className="text-accent opacity-80" />
                              )}
                            </div>
                          )}

                          {/* Top-Left Hotkey Badge */}
                          {sound.hotkey && (
                            <div className="absolute top-1.5 left-1.5 z-20">
                              <span className="px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-xs border border-white/10 text-[9.5px] font-mono font-medium text-slate-200 leading-none">
                                {sound.hotkey}
                              </span>
                            </div>
                          )}

                          {/* Top-Right Favorite Star */}
                          {sound.isFavorite && (
                            <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-amber-400 z-20">
                              <Star size={11} className="fill-amber-400" />
                            </div>
                          )}

                          {/* Duration Badge */}
                          {sound.duration > 0 && (
                            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9.5px] font-mono font-medium text-slate-300 pointer-events-none tabular-nums">
                              {Math.floor(sound.duration / 60)}:{Math.floor(sound.duration % 60).toString().padStart(2, '0')}
                            </span>
                          )}

                          {/* Micro-Equalizer when Playing */}
                          {isPlaying && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-15 pointer-events-none">
                              <div className="w-8 h-8 rounded-full bg-black/80 border border-accent/40 flex items-center justify-center shadow-md">
                                <div className="flex items-end gap-[2.5px] h-3 w-3 justify-center">
                                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '55%' }} />
                                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%' }} />
                                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%' }} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Title */}
                        <div className="relative z-10 w-full mt-1.5 px-0.5">
                          <span className="text-[11.5px] font-medium text-slate-200 group-hover:text-white leading-tight line-clamp-1 break-words">
                            {sound.title}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Dock: Unified Transport and Volume Strip (Docked frosted glass, no dead space) */}
            <div className="w-full px-6 py-2.5 border-t border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl flex items-center justify-between gap-4 select-none shrink-0 z-20">
              {/* Volume Faders: Master Output & Mic Gain */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Volume2 size={14} className="text-accent shrink-0" />
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={speakerVolume}
                    onChange={(val) => onSpeakerVolumeChange(val)}
                    className="w-24"
                  />
                  <span className="font-mono text-[11px] font-medium text-slate-300 w-8 text-right tabular-nums">
                    {speakerVolume}%
                  </span>
                </div>

                {onMicProjectionVolumeChange && (
                  <div className="flex items-center gap-2 pl-3 border-l border-white/[0.08]">
                    <Mic size={14} className="text-accent shrink-0" />
                    <Slider
                      min={0}
                      max={200}
                      step={1}
                      value={micProjectionVolume}
                      onChange={(val) => onMicProjectionVolumeChange(val)}
                      className="w-24"
                    />
                    <span className="font-mono text-[11px] font-medium text-slate-300 w-8 text-right tabular-nums">
                      {micProjectionVolume}%
                    </span>
                  </div>
                )}
              </div>

              {/* Now Playing Console & Scrubber */}
              <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 max-w-[200px]">
                  <div className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.08] overflow-hidden flex items-center justify-center text-slate-500 shrink-0">
                    {activeFloatingSound?.thumbnail ? (
                      <img
                        src={activeFloatingSound.thumbnail}
                        alt={activeFloatingSound.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music size={14} className="text-accent opacity-75" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium text-white truncate" title={activeFloatingSound?.title || 'No sound active'}>
                      {activeFloatingSound ? activeFloatingSound.title : 'Ready'}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {activeFloatingSound?.author || (activeFloatingSound ? 'Playing' : 'Select a sound to play')}
                    </span>
                  </div>
                </div>

                {/* Scrubber Timeline */}
                <div className="flex-1 flex items-center min-w-0 px-3">
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

                {/* Transport Controls */}
                <div className="flex items-center gap-1 shrink-0">
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
                    className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
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
                    title={activeFloatingSound && localPausedIds.includes(activeFloatingSound.id) ? 'Resume playback' : 'Pause playback'}
                    className="w-7 h-7 rounded-full bg-accent text-slate-950 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 hover:brightness-110 active:scale-95"
                  >
                    {activeFloatingSound && !localPausedIds.includes(activeFloatingSound.id) ? (
                      <Pause size={12} className="fill-current" />
                    ) : (
                      <Play size={12} className="fill-current ml-0.5" />
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
                    className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Inspector Panel */}
          {selectedSound ? (
            <aside className="w-[320px] min-w-[320px] bg-white/[0.02] backdrop-blur-2xl border-l border-white/[0.08] p-4 flex flex-col justify-between overflow-y-auto shrink-0 select-none">
              <div className="space-y-4">
                {/* Actions Toolbar */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsHudTrimmerOpen(true)}
                    title="Audio trimmer"
                    className="h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-accent flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Scissors size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDuplicateSound) onDuplicateSound(selectedSound);
                    }}
                    title="Duplicate sound"
                    className="h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Copy size={14} />
                  </button>

                  {onUpdateSound && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateSound({ ...selectedSound, isFavorite: !selectedSound.isFavorite });
                      }}
                      title={selectedSound.isFavorite ? 'Remove favorite' : 'Add to favorites'}
                      className={`h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                        selectedSound.isFavorite
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
                      }`}
                    >
                      <Star size={14} className={selectedSound.isFavorite ? 'fill-amber-400' : ''} />
                    </button>
                  )}

                  {onDeleteSound && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSound(selectedSound.id);
                      }}
                      title="Delete sound"
                      className="h-8 rounded-lg bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-300 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Sound Info Header */}
                <div className="flex items-center gap-3 p-1">
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-white/[0.08] bg-[#0e1219] shrink-0 flex items-center justify-center">
                    {selectedSound.thumbnail ? (
                      <img src={selectedSound.thumbnail} alt={selectedSound.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music size={18} className="text-accent opacity-80" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-[13px] font-semibold text-white truncate" title={selectedSound.title}>
                        {selectedSound.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsHudEditOpen(true)}
                        title="Edit sound details"
                        className="p-1 text-slate-400 hover:text-accent transition-colors cursor-pointer shrink-0"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {selectedSound.author || 'Sound effect'}
                    </p>
                    {selectedSound.hotkey && (
                      <span className="inline-block mt-1 text-[9.5px] font-mono font-medium px-1.5 py-0.2 rounded bg-accent/15 border border-accent/30 text-accent">
                        Key: {selectedSound.hotkey}
                      </span>
                    )}
                  </div>
                </div>

                {/* Faders: Volume and Speed */}
                <div className="space-y-2">
                  <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.07] flex items-center gap-2.5">
                    <Volume2 size={13} className="text-accent shrink-0" />
                    <span className="text-[11px] font-medium text-slate-400 w-12">Volume</span>
                    <Slider
                      min={0}
                      max={200}
                      step={1}
                      value={selectedSound.volume ?? 100}
                      onChange={(val) => handleVolumeChange(val)}
                      className="flex-1"
                    />
                    <span className="text-[11px] font-mono font-medium text-slate-200 w-10 text-right tabular-nums">
                      {selectedSound.volume ?? 100}%
                    </span>
                  </div>

                  <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.07] flex items-center gap-2.5">
                    <SlidersHorizontal size={13} className="text-accent shrink-0" />
                    <span className="text-[11px] font-medium text-slate-400 w-12">Speed</span>
                    <Slider
                      min={0.25}
                      max={2.0}
                      step={0.05}
                      value={selectedSound.speed ?? 1.0}
                      onChange={(val) => handleSpeedChange(val)}
                      className="flex-1"
                    />
                    <span className="text-[11px] font-mono font-medium text-slate-200 w-10 text-right tabular-nums">
                      {(selectedSound.speed ?? 1.0).toFixed(2)}x
                    </span>
                  </div>
                </div>

                {/* Reproduction Mode */}
                <div>
                  <div className="text-[11px] font-medium text-slate-400 mb-2">
                    Playback behavior
                  </div>

                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { id: 'overlap' as ReproductionMode, label: 'Overlap', title: 'Play & Overlap' },
                      { id: 'pause' as ReproductionMode, label: 'Pause', title: 'Play & Pause' },
                      { id: 'stop' as ReproductionMode, label: 'Stop', title: 'Play & Stop' },
                      { id: 'restart' as ReproductionMode, label: 'Restart', title: 'Play & Restart' },
                      { id: 'push_loop' as ReproductionMode, label: 'Loop', title: 'Play & Loop' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleModeChange(mode.id)}
                        title={mode.title}
                        className={`h-8 rounded-md text-[10.5px] font-medium transition-colors cursor-pointer border flex items-center justify-center ${
                          selectedMode === mode.id
                            ? 'bg-accent/20 border-accent/60 text-accent shadow-xs'
                            : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reproduction Options Toggles */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                    Options
                  </div>

                  {[
                    { key: 'stopOtherSounds' as const, label: 'Stop other sounds' },
                    { key: 'muteOtherSounds' as const, label: 'Mute other sounds' },
                    { key: 'muteVoice' as const, label: 'Mute voice while playing' },
                    { key: 'loop' as const, label: 'Loop continuously' },
                  ].map((opt) => (
                    <div
                      key={opt.key}
                      onClick={() => handleOptionToggle(opt.key)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] cursor-pointer transition-colors"
                    >
                      <span className="text-[11px] text-slate-300 font-medium">{opt.label}</span>
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                          selectedOptions[opt.key]
                            ? 'bg-accent text-slate-950 font-bold'
                            : 'border border-white/20 bg-white/[0.03]'
                        }`}
                      >
                        {selectedOptions[opt.key] && <Check size={10} strokeWidth={3} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {/* Sub-modals inside HUD */}
      {isHudYouTubeOpen && (
        <YouTubeSearchModal
          isOpen={isHudYouTubeOpen}
          isHUD={true}
          onClose={() => setIsHudYouTubeOpen(false)}
          accentColor={accent}
          onDownloadSound={async (res) => {
            if (onDownloadSound) await onDownloadSound(res);
          }}
        />
      )}

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

      {isHudEditOpen && selectedSound && (
        <EditSoundModal
          isOpen={isHudEditOpen}
          sound={selectedSound}
          onClose={() => setIsHudEditOpen(false)}
          accentColor={accent}
          onSave={(updated) => {
            if (onUpdateSound) onUpdateSound(updated);
            setSounds((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setIsHudEditOpen(false);
          }}
        />
      )}
    </div>
  );
};
