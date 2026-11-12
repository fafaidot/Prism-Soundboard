import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Copy,
  Star,
  Trash2,
  Music,
  Plus,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Repeat,
  Check,
  Disc,
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
  onDuplicateSound,
}) => {
  const [localVolume, setLocalVolume] = useState<number>(sound?.volume ?? 100);
  const [localSpeed, setLocalSpeed] = useState<number>(sound?.speed ?? 1.0);
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  // Sync state when sound changes
  useEffect(() => {
    if (sound) {
      setLocalVolume(sound.volume ?? 100);
      setLocalSpeed(sound.speed ?? 1.0);
    }
  }, [sound?.id, sound?.volume, sound?.speed]);

  if (!sound) {
    return (
      <aside className="w-[310px] min-w-[310px] h-full bg-[#080c12] border-l border-[#16222f] flex flex-col items-center justify-center p-6 text-center select-none transition-colors duration-150">
        <div className="w-14 h-14 rounded-2xl bg-[#0d141d] border border-[#182432] flex items-center justify-center mb-3 text-[#5a687c]">
          <Disc size={28} />
        </div>
        <h3 className="text-[13px] font-bold text-white mb-1">No Sound Selected</h3>
        <p className="text-[11px] text-[#5a687c] max-w-xs">
          Select any sound to adjust volume, playback speed, shortcuts, or trimming options.
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

    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        volume: newVol,
      });
    }, 250);
  };

  const handleSpeedChange = (newSpeed: number) => {
    setLocalSpeed(newSpeed);
    audioEngine.setSoundSpeed(sound.id, newSpeed);

    if (speedDebounceRef.current) clearTimeout(speedDebounceRef.current);
    speedDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        speed: newSpeed,
      });
    }, 250);
  };

  return (
    <aside className="w-[320px] min-w-[320px] h-full bg-[#080c12] border-l border-[#16222f] flex flex-col overflow-y-auto p-5 select-none transition-colors duration-150 gap-5">
      {/* Top Action Row: [Scissors] [Duplicate] [Favorite] [Delete] */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onOpenTrimmer}
          title="Trim Audio"
          className="h-10 rounded-xl bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Scissors size={15} />
        </button>

        <button
          onClick={onDuplicateSound}
          title="Duplicate Sound"
          className="h-10 rounded-xl bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Copy size={15} />
        </button>

        <button
          onClick={() => onUpdateSound({ ...sound, isFavorite: !sound.isFavorite })}
          title={sound.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
          className={`h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
            sound.isFavorite
              ? 'bg-[#292212] border-yellow-500/50 text-yellow-400'
              : 'bg-[#0d141d] border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5] hover:text-white'
          }`}
        >
          <Star size={15} className={sound.isFavorite ? 'fill-yellow-400' : ''} />
        </button>

        <button
          onClick={onDeleteSound}
          title="Delete Sound"
          className="h-10 rounded-xl bg-[#0d141d] border border-[#182432] hover:border-red-500/50 text-[#8e95a5] hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Selected Sound Info Card */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#0c3144] border border-[#1a5b7c] flex items-center justify-center text-[#22d3ee] flex-shrink-0">
          <Music size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold text-white truncate">{sound.title}</h3>
          <p className="text-[11px] text-[#5a687c] truncate">
            {sound.source === 'clip' ? 'from Game Clip' : sound.source === 'youtube' ? 'from YouTube' : 'by @soundcreator'}
          </p>
        </div>
      </div>

      {/* Shortcut Button */}
      <button
        onClick={onStartListeningHotkey}
        className={`w-full py-2.5 px-4 rounded-xl text-[12px] font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
          isListeningHotkey
            ? 'bg-[#ff9500] text-black font-bold animate-pulse'
            : sound.hotkey
            ? 'bg-[#0e3b52] text-[#22d3ee] border border-[#1b6288]'
            : 'bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-white'
        }`}
      >
        {isListeningHotkey ? (
          <span>Press Any Key...</span>
        ) : sound.hotkey ? (
          <span>Shortcut: {sound.hotkey}</span>
        ) : (
          <>
            <Plus size={13} className="text-[#22d3ee]" />
            <span>+ Add shortcut</span>
          </>
        )}
      </button>

      {/* PLAYBACK Section */}
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-bold text-[#5a687c] uppercase tracking-wider">
          PLAYBACK
        </span>

        {/* Volume */}
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-[#8e95a5] w-14">Volume</span>
          <input
            type="range"
            min={0}
            max={200}
            value={localVolume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value) || 0)}
            className="flex-1 h-1.5 bg-[#182432] rounded cursor-pointer accent-[#22d3ee]"
          />
          <span className="font-mono text-[#22d3ee] w-10 text-right font-medium">
            {localVolume}%
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-[#8e95a5] w-14">Speed</span>
          <input
            type="range"
            min={0.25}
            max={2.0}
            step={0.05}
            value={localSpeed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 1.0)}
            className="flex-1 h-1.5 bg-[#182432] rounded cursor-pointer accent-[#22d3ee]"
          />
          <span className="font-mono text-[#22d3ee] w-10 text-right font-medium">
            {localSpeed.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* PLAYBACK MODE Section */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] font-bold text-[#5a687c] uppercase tracking-wider">
          PLAYBACK MODE
        </span>

        <div className="flex items-center justify-between gap-1.5">
          {/* Play */}
          <button
            onClick={onPlaySound}
            title="Play Sound"
            className="w-10 h-10 rounded-full bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <Play size={14} className="fill-current ml-0.5" />
          </button>

          {/* Pause */}
          <button
            onClick={() => audioEngine.pauseSound(sound.id)}
            title="Pause Sound"
            className="w-10 h-10 rounded-full bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <Pause size={14} />
          </button>

          {/* Restart / Overlap Mode (Active Cyan as in Image 1) */}
          <button
            onClick={() => handleModeChange('restart')}
            title="Overlap / Restart Mode"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              currentMode === 'restart'
                ? 'bg-[#22d3ee] text-[#070a0e] shadow-[0_0_15px_rgba(34,211,238,0.35)]'
                : 'bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5]'
            }`}
          >
            <RotateCcw size={14} />
          </button>

          {/* Next / Stop */}
          <button
            onClick={() => handleModeChange('stop')}
            title="Stop Mode"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              currentMode === 'stop'
                ? 'bg-[#0d141d] border border-[#22d3ee] text-[#22d3ee]'
                : 'bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5]'
            }`}
          >
            <SkipForward size={14} />
          </button>

          {/* Loop Mode */}
          <button
            onClick={() => handleOptionToggle('loop')}
            title="Toggle Loop"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              options.loop
                ? 'bg-[#22d3ee] text-[#070a0e]'
                : 'bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/50 text-[#8e95a5]'
            }`}
          >
            <Repeat size={14} />
          </button>
        </div>
      </div>

      {/* PLAYBACK OPTIONS Section */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold text-[#5a687c] uppercase tracking-wider mb-0.5">
          PLAYBACK OPTIONS
        </span>

        {[
          { key: 'stopOtherSounds', label: 'Stop other sounds' },
          { key: 'muteOtherSounds', label: 'Mute other sounds' },
          { key: 'muteVoice', label: 'Mute voice' },
          { key: 'loop', label: 'Loop' },
        ].map(({ key, label }) => {
          const isChecked = !!(options as any)[key];
          return (
            <div
              key={key}
              onClick={() => handleOptionToggle(key as any)}
              className="flex items-center justify-between p-3 rounded-xl bg-[#0d141d] border border-[#182432] hover:border-[#22d3ee]/40 transition-colors cursor-pointer text-[12px]"
            >
              <span className="text-[#8e95a5] font-medium">{label}</span>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                  isChecked
                    ? 'bg-[#22d3ee] text-[#070a0e]'
                    : 'border border-[#233346] bg-[#090e15]'
                }`}
              >
                {isChecked && <Check size={11} strokeWidth={3} />}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
