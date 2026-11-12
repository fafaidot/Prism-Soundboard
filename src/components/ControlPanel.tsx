import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Copy,
  Star,
  Trash2,
  Music,
  Clapperboard,
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
import { Slider } from './Slider';

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

const ControlPanelComponent: React.FC<ControlPanelProps> = ({
  sound,
  isListeningHotkey = false,
  onUpdateSound,
  onPlaySound,
  onStartListeningHotkey,
  onOpenTrimmer,
  onDeleteSound,
  onDuplicateSound,
}) => {
  const [localVolume, setLocalVolume] = useState<number>(sound?.volume ?? 100);
  const [localSpeed, setLocalSpeed] = useState<number>(sound?.speed ?? 1.0);
  const volumeDebounceRef = useRef<any>(null);
  const speedDebounceRef = useRef<any>(null);

  const [localMode, setLocalMode] = useState<ReproductionMode>(sound?.reproductionMode || 'stop');
  const [localOptions, setLocalOptions] = useState(
    sound?.reproductionOptions || {
      stopOtherSounds: true,
      muteOtherSounds: false,
      muteVoice: false,
      loop: false,
    }
  );
  const optionsDebounceRef = useRef<any>(null);

  // Sync state when sound changes
  useEffect(() => {
    if (sound) {
      setLocalVolume(sound.volume ?? 100);
      setLocalSpeed(sound.speed ?? 1.0);
      setLocalMode(sound.reproductionMode || 'stop');
      setLocalOptions(
        sound.reproductionOptions || {
          stopOtherSounds: true,
          muteOtherSounds: false,
          muteVoice: false,
          loop: false,
        }
      );
    }
  }, [sound?.id, sound?.volume, sound?.speed, sound?.reproductionMode, sound?.reproductionOptions]);

  if (!sound) {
    return (
      <aside className="w-[310px] min-w-[310px] h-full bg-[#10141C] border-l border-[#1B222E] flex flex-col items-center justify-center p-6 text-center select-none transition-colors duration-150">
        <div className="w-14 h-14 rounded-2xl bg-[#151B25] border border-[#1B222E] flex items-center justify-center mb-3 text-[#5a687c]">
          <Disc size={28} />
        </div>
        <h3 className="text-[13px] font-bold text-white mb-1">No Sound Selected</h3>
        <p className="text-[11px] text-[#5a687c] max-w-xs">
          Select any sound to adjust volume, playback speed, shortcuts, or trimming options.
        </p>
      </aside>
    );
  }

  const currentMode = localMode;
  const options = localOptions;

  const handleModeChange = (mode: ReproductionMode) => {
    setLocalMode(mode);
    if (optionsDebounceRef.current) clearTimeout(optionsDebounceRef.current);
    optionsDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        reproductionMode: mode,
      });
    }, 150);
  };

  const handleOptionToggle = (key: keyof typeof options) => {
    const updatedOptions = {
      ...localOptions,
      [key]: !localOptions[key],
    };
    setLocalOptions(updatedOptions);
    if (optionsDebounceRef.current) clearTimeout(optionsDebounceRef.current);
    optionsDebounceRef.current = setTimeout(() => {
      onUpdateSound({
        ...sound,
        reproductionOptions: updatedOptions,
      });
    }, 150);
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
    <aside className="w-[320px] min-w-[320px] h-full bg-[#10141C] border-l border-[#1B222E] flex flex-col overflow-y-auto p-5 select-none transition-colors duration-150 gap-5">
      {/* Top Action Row: [Scissors] [Duplicate] [Favorite] [Delete] */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onOpenTrimmer}
          title="Trim Audio"
          className="h-10 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Scissors size={15} />
        </button>

        <button
          onClick={onDuplicateSound}
          title="Duplicate Sound"
          className="h-10 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Copy size={15} />
        </button>

        <button
          onClick={() => onUpdateSound({ ...sound, isFavorite: !sound.isFavorite })}
          title={sound.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
          className={`h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
            sound.isFavorite
              ? 'bg-[#292212] border-yellow-500/50 text-yellow-400'
              : 'bg-[#151B25] border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white'
          }`}
        >
          <Star size={15} className={sound.isFavorite ? 'fill-yellow-400' : ''} />
        </button>

        <button
          onClick={onDeleteSound}
          title="Delete Sound"
          className="h-10 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-red-500/50 text-[#8e95a5] hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Selected Sound Info Card */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#0E131A] border border-[#1B222E] overflow-hidden flex items-center justify-center text-[#31C5F4] flex-shrink-0 shadow-sm">
          {sound.thumbnail ? (
            <img
              src={sound.thumbnail}
              alt={sound.title}
              className="w-full h-full object-cover"
            />
          ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
            <Clapperboard size={22} className="text-[#31C5F4]" />
          ) : (
            <Music size={22} className="text-[#31C5F4]" />
          )}
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
            ? 'bg-[#123244] text-[#31C5F4] border border-[#31C5F4]/40'
            : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-white'
        }`}
      >
        {isListeningHotkey ? (
          <span>Press Any Key...</span>
        ) : sound.hotkey ? (
          <span>Shortcut: {sound.hotkey}</span>
        ) : (
          <>
            <Plus size={13} className="text-[#31C5F4]" />
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
          <Slider
            min={0}
            max={200}
            step={1}
            value={localVolume}
            onChange={(val) => handleVolumeChange(val)}
            className="flex-1"
          />
          <span className="font-mono text-[#31C5F4] w-10 text-right font-medium">
            {localVolume}%
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-[#8e95a5] w-14">Speed</span>
          <Slider
            min={0.25}
            max={2.0}
            step={0.05}
            value={localSpeed}
            onChange={(val) => handleSpeedChange(val)}
            className="flex-1"
          />
          <span className="font-mono text-[#31C5F4] w-10 text-right font-medium">
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
            className="w-10 h-10 rounded-full bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <Play size={14} className="fill-current ml-0.5" />
          </button>

          {/* Pause */}
          <button
            onClick={() => audioEngine.pauseSound(sound.id)}
            title="Pause Sound"
            className="w-10 h-10 rounded-full bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5] hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <Pause size={14} />
          </button>

          {/* Restart / Overlap Mode */}
          <button
            onClick={() => handleModeChange('restart')}
            title="Overlap / Restart Mode"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              currentMode === 'restart'
                ? 'bg-[#123244] border border-[#31C5F4] text-[#31C5F4]'
                : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5]'
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
                ? 'bg-[#123244] border border-[#31C5F4] text-[#31C5F4]'
                : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5]'
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
                ? 'bg-[#123244] border border-[#31C5F4] text-[#31C5F4]'
                : 'bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/50 text-[#8e95a5]'
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
              className="flex items-center justify-between p-3 rounded-xl bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4]/40 transition-colors cursor-pointer text-[12px]"
            >
              <span className="text-[#8e95a5] font-medium">{label}</span>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                  isChecked
                    ? 'bg-[#31C5F4] text-[#090B10]'
                    : 'border border-[#233346] bg-[#0E131A]'
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

export const ControlPanel = React.memo(ControlPanelComponent, (prev, next) => {
  return (
    prev.sound?.id === next.sound?.id &&
    prev.sound?.title === next.sound?.title &&
    prev.sound?.thumbnail === next.sound?.thumbnail &&
    prev.sound?.volume === next.sound?.volume &&
    prev.sound?.speed === next.sound?.speed &&
    prev.sound?.reproductionMode === next.sound?.reproductionMode &&
    prev.sound?.isFavorite === next.sound?.isFavorite &&
    prev.sound?.hotkey === next.sound?.hotkey &&
    prev.isPlaying === next.isPlaying &&
    prev.isListeningHotkey === next.isListeningHotkey &&
    prev.accentColor === next.accentColor
  );
});
