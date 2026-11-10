import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  RotateCcw,
  Sliders,
  Edit2,
  Keyboard,
  Scissors,
  Trash2,
  Copy,
  SlidersHorizontal,
  BookOpen,
  Disc,
  Globe,
  Share2,
  X,
  Check,
  Clapperboard,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SoundItem, ReproductionMode } from '../types';
import { audioEngine } from '../services/audioEngine';

interface ControlPanelProps {
  sound: SoundItem | null;
  isPlaying: boolean;
  accentColor: string;
  isListeningHotkey?: boolean;
  onUpdateSound: (updated: SoundItem) => void;
  onPlaySound: () => void;
  onStartListeningHotkey: () => void;
  onClearHotkey: () => void;
  onOpenTrimmer: () => void;
  onDeleteSound: () => void;
  onEditDetails: () => void;
  onDuplicateSound?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  sound,
  isPlaying,
  accentColor,
  isListeningHotkey = false,
  onUpdateSound,
  onPlaySound,
  onStartListeningHotkey,
  onClearHotkey,
  onOpenTrimmer,
  onDeleteSound,
  onEditDetails,
  onDuplicateSound,
}) => {
  const [localVolume, setLocalVolume] = useState<number>(sound?.volume ?? 100);
  const [localSpeed, setLocalSpeed] = useState<number>(sound?.speed ?? 1.0);
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  const accent = accentColor || 'var(--accent-color, #8b5cf6)';

  // Sync state when sound changes
  useEffect(() => {
    if (sound) {
      setLocalVolume(sound.volume ?? 100);
      setLocalSpeed(sound.speed ?? 1.0);
    }
  }, [sound?.id, sound?.volume, sound?.speed]);

  if (!sound) {
    return (
      <aside className="w-[340px] min-w-[340px] h-full bg-[var(--theme-bg-sidebar,#10111a)] border-l border-[var(--theme-border,#222436)] flex flex-col items-center justify-center p-6 text-center select-none transition-colors duration-150">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-4 text-[#656c7d]">
          <Disc size={32} />
        </div>
        <h3 className="text-[14px] font-bold text-white mb-1">No Sound Selected</h3>
        <p className="text-[12px] text-[#656c7d] max-w-xs">
          Select any sound to fine-tune playback options, trim timestamps, customize volume or assign global shortcuts.
        </p>
      </aside>
    );
  }

  const currentMode = sound.reproductionMode || 'stop';
  const options = sound.reproductionOptions || {
    stopOtherSounds: true,
    muteOtherSounds: false,
    muteVoice: false,
    loop: false,
  };

  const handleModeChange = (mode: ReproductionMode) => {
    onUpdateSound({
      ...sound,
      reproductionMode: mode,
    });
  };

  const handleOptionToggle = (key: keyof typeof options) => {
    onUpdateSound({
      ...sound,
      reproductionOptions: {
        ...options,
        [key]: !options[key],
      },
    });
  };

  const handleVolumeChange = (newVol: number) => {
    setLocalVolume(newVol);
    audioEngine.setSoundVolume(sound.id, newVol);

    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-volume-live', { soundId: sound.id, volume: newVol });
    }

    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        volume: newVol,
      });
    }, 150);
  };

  const handleSpeedChange = (newSpeed: number) => {
    setLocalSpeed(newSpeed);
    audioEngine.setSoundSpeed(sound.id, newSpeed);

    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-sound-speed-live', { soundId: sound.id, speed: newSpeed });
    }

    if (speedDebounceRef.current) clearTimeout(speedDebounceRef.current);
    speedDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        speed: newSpeed,
      });
    }, 150);
  };

  return (
    <aside className="w-[340px] min-w-[340px] h-full bg-[var(--theme-bg-sidebar,#10111a)] border-l border-[var(--theme-border,#222436)] flex flex-col justify-between overflow-y-auto select-none transition-colors duration-150">
      <div className="flex flex-col">
        {/* Top Header Banner with Centered Action Buttons to Fill the Bar */}
        <div className="relative h-[56px] w-full bg-[var(--theme-bg-surface,#111317)] border-b border-[var(--theme-border,#20232d)] px-5 flex items-center">
          <div className="w-full grid grid-cols-4 gap-2">
            <button
              onClick={onOpenTrimmer}
              title="Audio Trimmer & Equalizer"
              className="h-9 rounded-lg bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] flex items-center justify-center text-[var(--theme-text-secondary,#94a3b8)] hover:text-[var(--theme-text-primary,#ffffff)] transition-all cursor-pointer shadow-sm"
            >
              <Scissors size={15} style={{ color: accent }} />
            </button>
            <button
              onClick={onEditDetails}
              title="Sound Details & Tags"
              className="h-9 rounded-lg bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] flex items-center justify-center text-[var(--theme-text-secondary,#94a3b8)] hover:text-[var(--theme-text-primary,#ffffff)] transition-all cursor-pointer shadow-sm"
            >
              <BookOpen size={15} />
            </button>
            <button
              onClick={onDuplicateSound}
              title="Duplicate Sound"
              className="h-9 rounded-lg bg-[var(--theme-bg-card,#171920)] hover:bg-[var(--theme-bg-card-hover,#1e212b)] border border-[var(--theme-border,#20232d)] flex items-center justify-center text-[var(--theme-text-secondary,#94a3b8)] hover:text-[var(--theme-text-primary,#ffffff)] transition-all cursor-pointer shadow-sm"
            >
              <Copy size={15} />
            </button>
            <button
              onClick={onDeleteSound}
              title="Delete Sound"
              className="h-9 rounded-lg bg-[var(--theme-bg-card,#171920)] hover:bg-[#e81123]/80 border border-[var(--theme-border,#20232d)] flex items-center justify-center text-[var(--theme-text-secondary,#94a3b8)] hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Selected Sound Identity Header (Lowered with generous spacing) */}
        <div className="px-5 pt-5 pb-1 flex items-start gap-3.5 relative z-10">
          {/* Rounded Square Artwork */}
          <div className="relative w-16 h-16 rounded-[14px] overflow-hidden border border-white/20 shadow-2xl bg-[#0c0d10] flex-shrink-0 flex items-center justify-center">
            {sound.thumbnail ? (
              <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                <img
                  src={sound.thumbnail}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover blur-md opacity-50 scale-110 pointer-events-none"
                />
                <img
                  src={sound.thumbnail}
                  alt={sound.title}
                  className="relative w-full h-full object-contain z-1"
                />
              </div>
            ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: `${accent}20` }}
              >
                <Clapperboard size={26} style={{ color: accent }} />
              </div>
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: `${accent}20` }}
              >
                <Disc size={28} style={{ color: accent }} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h2
              className="text-[15px] font-bold text-white leading-tight truncate"
              title={sound.title}
            >
              {sound.title}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[12px] text-[#9ea7ba] truncate">
                by <strong className="text-white">@{sound.author || 'PrismLibrary'}</strong>
              </span>
              <button
                onClick={onEditDetails}
                title="Edit Title and Author"
                className="text-[#9ea7ba] hover:text-white transition-colors cursor-pointer"
              >
                <Edit2 size={12} />
              </button>
            </div>

            {/* Shortcut Badge Button */}
            <div className="mt-2.5 flex items-center gap-1.5">
              <button
                onClick={onStartListeningHotkey}
                style={
                  isListeningHotkey
                    ? {
                        backgroundColor: `${accent}25`,
                        borderColor: accent,
                        color: accent,
                      }
                    : sound.hotkey
                    ? {
                        borderColor: `${accent}60`,
                        color: accent,
                      }
                    : undefined
                }
                className={`py-1 px-3 rounded-[8px] text-[11px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isListeningHotkey
                    ? ''
                    : sound.hotkey
                    ? 'bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)]'
                    : 'bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)] border-[var(--theme-border,#222436)] text-[#a4abbd] hover:text-white'
                }`}
                title="Click to record hotkey"
              >
                <Keyboard
                  size={12}
                  style={sound.hotkey || isListeningHotkey ? { color: accent } : undefined}
                  className={isListeningHotkey ? 'animate-bounce' : ''}
                />
                <span>{isListeningHotkey ? 'Listening...' : sound.hotkey ? sound.hotkey : 'Add shortcut'}</span>
              </button>
              {sound.hotkey && !isListeningHotkey && (
                <button
                  onClick={onClearHotkey}
                  className="w-6 h-6 rounded-md bg-[var(--theme-bg-surface,#12131d)] hover:bg-[#ff3b30]/20 border border-[var(--theme-border,#222436)] hover:border-[#ff3b30] flex items-center justify-center text-[#7e8697] hover:text-[#ff3b30] transition-colors cursor-pointer"
                  title="Remove shortcut"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Volume & Speed Control Box */}
        <div className="mt-6 px-5 space-y-3">
          {/* Volume */}
          <div className="p-3 bg-[var(--theme-bg-surface,#12131d)] rounded-[12px] border border-[var(--theme-border,#222436)] flex items-center gap-3">
            <div className="flex items-center gap-2 text-white/90">
              <Volume2
                size={17}
                className={localVolume > 100 ? 'text-[#f59e0b]' : ''}
                style={localVolume <= 100 ? { color: accent } : undefined}
              />
              <span className="text-[13px] font-semibold text-white">Volume</span>
            </div>

            <div className="flex-1 px-1">
              <input
                type="range"
                min={0}
                max={200}
                value={localVolume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value) || 0)}
                className="w-full h-1.5 bg-[#2d3140] rounded-lg cursor-pointer"
                style={{ accentColor: localVolume > 100 ? '#f59e0b' : accent }}
              />
            </div>

            {/* Number Box with Amber tint on boost past 100% */}
            <div className={`w-12 h-8 rounded-[6px] border flex items-center justify-center transition-colors ${
              localVolume > 100 ? 'border-[#f59e0b]/60 bg-[#f59e0b]/15' : 'bg-[#0f1013] border-[#2e3240]'
            }`}>
              <input
                type="number"
                min={0}
                max={200}
                value={localVolume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value) || 0)}
                className={`w-full text-center text-[13px] font-bold font-mono bg-transparent focus:outline-none ${
                  localVolume > 100 ? 'text-[#f59e0b]' : 'text-white'
                }`}
                title={localVolume > 100 ? 'Volume boosted above 100% (Signal boost & clipping risk)' : undefined}
              />
            </div>
          </div>

          {/* Speed / Playback Rate */}
          <div className="p-3 bg-[var(--theme-bg-surface,#12131d)] rounded-[12px] border border-[var(--theme-border,#222436)] flex items-center gap-3">
            <div className="flex items-center gap-2 text-white/90">
              <SlidersHorizontal size={16} style={{ color: accent }} />
              <span className="text-[13px] font-semibold text-white">Speed</span>
            </div>

            <div className="flex-1 px-1">
              <input
                type="range"
                min={25}
                max={200}
                step={5}
                value={Math.round(localSpeed * 100)}
                onChange={(e) => {
                  const val = parseInt(e.target.value) / 100;
                  handleSpeedChange(val);
                }}
                className="w-full h-1.5 bg-[#2d3140] rounded-lg cursor-pointer"
                style={{ accentColor: accent }}
              />
            </div>

            {/* Speed Badge */}
            <div className="w-12 h-8 rounded-[6px] bg-[#0f1013] border border-[#2e3240] flex items-center justify-center">
              <span className="text-[12px] font-bold font-mono text-white">
                {localSpeed.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>

        {/* Reproduction Mode */}
        <div className="mt-5 px-5">
          <div className="flex items-center gap-2 text-white font-bold text-[13px] mb-3">
            <RotateCcw size={15} style={{ color: accent }} />
            <span>Reproduction Mode</span>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            {/* 1. Play and Overlap */}
            <button
              onClick={() => handleModeChange('overlap')}
              title="Play and Overlap: Stacks multiple instances without stopping previous ones"
              style={
                currentMode === 'overlap'
                  ? { backgroundColor: accent, color: '#000000' }
                  : undefined
              }
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                currentMode === 'overlap'
                  ? 'scale-105'
                  : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171920)] border border-[var(--theme-border,#20232d)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4l10 8-10 8V4z" />
                <path d="M12 4l10 8-10 8V4z" opacity="0.6" />
              </svg>
            </button>

            {/* 2. Play and Pause */}
            <button
              onClick={() => handleModeChange('pause')}
              title="Play and Pause: Toggles playback pause and resume"
              style={
                currentMode === 'pause'
                  ? { backgroundColor: accent, color: '#000000' }
                  : undefined
              }
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                currentMode === 'pause'
                  ? 'scale-105'
                  : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171920)] border border-[var(--theme-border,#20232d)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 5l8 7-8 7V5z" />
                <rect x="14" y="5" width="3" height="14" rx="1" />
                <rect x="19" y="5" width="3" height="14" rx="1" />
              </svg>
            </button>

            {/* 3. Play and Stop */}
            <button
              onClick={() => handleModeChange('stop')}
              title="Play and Stop: Plays sound once, clicking again immediately stops it"
              style={
                currentMode === 'stop'
                  ? { backgroundColor: accent, color: '#000000' }
                  : undefined
              }
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                currentMode === 'stop'
                  ? 'scale-105'
                  : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 5l7 7-7 7V5z" />
                <rect x="14" y="6" width="7" height="12" rx="1.5" />
              </svg>
            </button>

            {/* 4. Play and Restart */}
            <button
              onClick={() => handleModeChange('restart')}
              title="Play and Restart: Re-triggering rewinds the sound immediately back to start"
              style={
                currentMode === 'restart'
                  ? { backgroundColor: accent, color: '#000000' }
                  : undefined
              }
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                currentMode === 'restart'
                  ? 'scale-105'
                  : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 5l11 7-11 7V5z" />
                <rect x="18" y="5" width="2.5" height="14" rx="1" />
              </svg>
            </button>

            {/* 5. Push to Loop */}
            <button
              onClick={() => handleModeChange('push_loop')}
              title="Push to Loop: Loops the sound continuously until clicked again"
              style={
                currentMode === 'push_loop'
                  ? { backgroundColor: accent, color: '#000000' }
                  : undefined
              }
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                currentMode === 'push_loop'
                  ? 'scale-105'
                  : 'bg-[var(--theme-bg-surface,#111317)] text-[#7b8294] hover:text-white hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#20232d)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
          </div>

          <div className="mt-2 text-center text-[11px] font-medium text-[#7b8294]">
            {currentMode === 'overlap' && 'Play and Overlap'}
            {currentMode === 'pause' && 'Play and Pause'}
            {currentMode === 'stop' && 'Play and Stop'}
            {currentMode === 'restart' && 'Play and Restart'}
            {currentMode === 'push_loop' && 'Push to Loop'}
          </div>
        </div>

        {/* Reproduction Options Section */}
        <div className="mt-6 px-5 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-[13px]">
            <Sliders size={15} style={{ color: accent }} />
            <span>Reproduction Options</span>
          </div>

          <div className="space-y-1.5 pt-1">
            {/* 1. Stop Other Sounds */}
            <div
              onClick={() => handleOptionToggle('stopOtherSounds')}
              style={
                options.stopOtherSounds
                  ? {
                      backgroundColor: `${accent}15`,
                      borderColor: `${accent}50`,
                    }
                  : undefined
              }
              className={`flex items-center justify-between p-2.5 rounded-[11px] border cursor-pointer select-none transition-all duration-150 group ${
                options.stopOtherSounds
                  ? ''
                  : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] hover:bg-[var(--theme-bg-card,#171826)]'
              }`}
            >
              <span className={`text-[12.5px] font-semibold transition-colors ${options.stopOtherSounds ? 'text-white' : 'text-[#8a92a6] group-hover:text-white'}`}>
                Stop Other Sounds
              </span>
              <div
                style={
                  options.stopOtherSounds
                    ? {
                        backgroundColor: accent,
                        borderColor: accent,
                      }
                    : undefined
                }
                className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-all duration-150 border ${
                  options.stopOtherSounds
                    ? ''
                    : 'bg-[#101217] border-[#2c3140] group-hover:border-[#42495d]'
                }`}
              >
                {options.stopOtherSounds && <Check size={12} className="text-white stroke-[3.5]" />}
              </div>
            </div>

            {/* 2. Mute Other Sounds */}
            <div
              onClick={() => handleOptionToggle('muteOtherSounds')}
              style={
                options.muteOtherSounds
                  ? {
                      backgroundColor: `${accent}15`,
                      borderColor: `${accent}50`,
                    }
                  : undefined
              }
              className={`flex items-center justify-between p-2.5 rounded-[11px] border cursor-pointer select-none transition-all duration-150 group ${
                options.muteOtherSounds
                  ? ''
                  : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] hover:bg-[var(--theme-bg-card,#171826)]'
              }`}
            >
              <span className={`text-[12.5px] font-semibold transition-colors ${options.muteOtherSounds ? 'text-white' : 'text-[#8a92a6] group-hover:text-white'}`}>
                Mute Other Sounds
              </span>
              <div
                style={
                  options.muteOtherSounds
                    ? {
                        backgroundColor: accent,
                        borderColor: accent,
                      }
                    : undefined
                }
                className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-all duration-150 border ${
                  options.muteOtherSounds
                    ? ''
                    : 'bg-[#101217] border-[#2c3140] group-hover:border-[#42495d]'
                }`}
              >
                {options.muteOtherSounds && <Check size={12} className="text-white stroke-[3.5]" />}
              </div>
            </div>

            {/* 3. Mute Voice */}
            <div
              onClick={() => handleOptionToggle('muteVoice')}
              style={
                options.muteVoice
                  ? {
                      backgroundColor: `${accent}15`,
                      borderColor: `${accent}50`,
                    }
                  : undefined
              }
              className={`flex items-center justify-between p-2.5 rounded-[11px] border cursor-pointer select-none transition-all duration-150 group ${
                options.muteVoice
                  ? ''
                  : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] hover:bg-[var(--theme-bg-card,#171826)]'
              }`}
            >
              <span className={`text-[12.5px] font-semibold transition-colors ${options.muteVoice ? 'text-white' : 'text-[#8a92a6] group-hover:text-white'}`}>
                Mute Voice
              </span>
              <div
                style={
                  options.muteVoice
                    ? {
                        backgroundColor: accent,
                        borderColor: accent,
                      }
                    : undefined
                }
                className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-all duration-150 border ${
                  options.muteVoice
                    ? ''
                    : 'bg-[#101217] border-[#2c3140] group-hover:border-[#42495d]'
                }`}
              >
                {options.muteVoice && <Check size={12} className="text-white stroke-[3.5]" />}
              </div>
            </div>

            {/* 4. Loop */}
            <div
              onClick={() => handleOptionToggle('loop')}
              style={
                options.loop
                  ? {
                      backgroundColor: `${accent}15`,
                      borderColor: `${accent}50`,
                    }
                  : undefined
              }
              className={`flex items-center justify-between p-2.5 rounded-[11px] border cursor-pointer select-none transition-all duration-150 group ${
                options.loop
                  ? ''
                  : 'bg-[var(--theme-bg-surface,#12131d)] border-[var(--theme-border,#222436)] hover:bg-[var(--theme-bg-card,#171826)]'
              }`}
            >
              <span className={`text-[12.5px] font-semibold transition-colors ${options.loop ? 'text-white' : 'text-[#8a92a6] group-hover:text-white'}`}>
                Loop
              </span>
              <div
                style={
                  options.loop
                    ? {
                        backgroundColor: accent,
                        borderColor: accent,
                      }
                    : undefined
                }
                className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-all duration-150 border ${
                  options.loop
                    ? ''
                    : 'bg-[#101217] border-[#2c3140] group-hover:border-[#42495d]'
                }`}
              >
                {options.loop && <Check size={12} className="text-white stroke-[3.5]" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer with Globe Icon */}
      <div className="p-4 border-t border-[var(--theme-border,#222436)] flex items-center justify-center">
        <button
          onClick={onPlaySound}
          className="w-10 h-10 rounded-full bg-[var(--theme-bg-surface,#12131d)] hover:bg-[var(--theme-bg-card,#171826)] border border-[var(--theme-border,#222436)] flex items-center justify-center text-[#7b8294] hover:brightness-125 transition-all shadow-lg cursor-pointer"
          title="Play Sound Preview"
        >
          <Globe size={18} />
        </button>
      </div>
    </aside>
  );
};
