import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Copy,
  Star,
  Trash2,
  Music,
  Clapperboard,
  Plus,
  Check,
  Disc,
  X,
  Pencil,
  Volume2,
  SlidersHorizontal,
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
  accentColor,
  isListeningHotkey = false,
  onUpdateSound,
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

  const [localMode, setLocalMode] = useState<ReproductionMode>(sound?.reproductionMode || 'stop');
  const [localOptions, setLocalOptions] = useState(
    sound?.reproductionOptions || {
      stopOtherSounds: true,
      muteOtherSounds: false,
      muteVoice: false,
      loop: false,
    }
  );

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
      <aside className="w-[300px] min-w-[300px] h-full bg-[#0c1017]/55 backdrop-blur-xl border-l border-white/[0.08] flex flex-col items-center justify-center p-6 text-center select-none transition-colors duration-150">
        <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-3 text-slate-500">
          <Disc size={22} />
        </div>
        <h3 className="text-[13px] font-semibold text-white mb-1">No sound selected</h3>
        <p className="text-[11.5px] text-slate-400 max-w-xs leading-relaxed">
          Select any sound to adjust playback, keybinds, volume, or trimming.
        </p>
      </aside>
    );
  }

  const currentMode = localMode;
  const options = localOptions;

  const handleModeChange = (mode: ReproductionMode) => {
    setLocalMode(mode);
    onUpdateSound({
      ...sound,
      reproductionMode: mode,
    });
  };

  const handleOptionToggle = (key: keyof typeof options) => {
    const updatedOptions = {
      ...localOptions,
      [key]: !localOptions[key],
    };
    setLocalOptions(updatedOptions);
    onUpdateSound({
      ...sound,
      reproductionOptions: updatedOptions,
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
    <aside className="w-[300px] min-w-[300px] h-full bg-white/[0.02] backdrop-blur-xl border-l border-white/[0.08] flex flex-col overflow-y-auto p-4 select-none transition-colors duration-150 gap-4">
      {/* Top Action Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onOpenTrimmer}
          title="Trim audio"
          className="h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-accent flex items-center justify-center transition-colors cursor-pointer"
        >
          <Scissors size={14} />
        </button>

        <button
          type="button"
          onClick={onDuplicateSound}
          title="Duplicate sound"
          className="h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Copy size={14} />
        </button>

        <button
          type="button"
          onClick={() => onUpdateSound({ ...sound, isFavorite: !sound.isFavorite })}
          title={sound.isFavorite ? 'Remove favorite' : 'Add to favorites'}
          className={`h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
            sound.isFavorite
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
          }`}
        >
          <Star size={14} className={sound.isFavorite ? 'fill-amber-400' : ''} />
        </button>

        <button
          type="button"
          onClick={onDeleteSound}
          title="Delete sound"
          className="h-8 rounded-lg bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-300 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Selected Sound Info Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-[#0e1219] border border-white/[0.08] overflow-hidden flex items-center justify-center text-accent shrink-0 shadow-xs">
          {sound.thumbnail ? (
            <img
              src={sound.thumbnail}
              alt={sound.title}
              className="w-full h-full object-cover"
            />
          ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
            <Clapperboard size={20} className="text-accent opacity-80" />
          ) : (
            <Music size={20} className="text-accent opacity-80" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-[13px] font-semibold text-white truncate" title={sound.title}>
              {sound.title}
            </h3>
            <button
              type="button"
              onClick={onEditDetails}
              title="Edit sound details"
              className="p-1 text-slate-400 hover:text-accent transition-colors cursor-pointer shrink-0"
            >
              <Pencil size={12} />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {sound.author || 'Sound effect'}
          </p>
        </div>
      </div>

      {/* Shortcut Key Display / Rebind */}
      {sound.hotkey ? (
        <div className="flex items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={onStartListeningHotkey}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] font-mono font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              isListeningHotkey
                ? 'bg-amber-400 text-slate-950 font-bold'
                : 'bg-accent/15 border border-accent/40 text-accent hover:brightness-110'
            }`}
            title="Click to rebind shortcut"
          >
            {isListeningHotkey ? (
              <span>Listening for key...</span>
            ) : (
              <span>Key: {sound.hotkey}</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearHotkey();
            }}
            className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:border-rose-500/40 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Remove shortcut"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartListeningHotkey}
          className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            isListeningHotkey
              ? 'bg-amber-400 text-slate-950 font-bold'
              : 'bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.16] text-slate-300 hover:text-white'
          }`}
        >
          {isListeningHotkey ? (
            <span>Listening for key...</span>
          ) : (
            <>
              <Plus size={13} className="text-accent" />
              <span>Add key shortcut</span>
            </>
          )}
        </button>
      )}

      {/* Sliders: Volume and Speed */}
      <div className="space-y-2">
        <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.07] flex items-center gap-2">
          <Volume2 size={13} className="text-accent shrink-0" />
          <span className="text-[11px] font-medium text-slate-400 w-12">Volume</span>
          <Slider
            min={0}
            max={200}
            step={1}
            value={localVolume}
            onChange={(val) => handleVolumeChange(val)}
            className="flex-1"
          />
          <span className="font-mono text-[11px] font-medium text-slate-200 w-9 text-right tabular-nums">
            {localVolume}%
          </span>
        </div>

        <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.07] flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-accent shrink-0" />
          <span className="text-[11px] font-medium text-slate-400 w-12">Speed</span>
          <Slider
            min={0.25}
            max={2.0}
            step={0.05}
            value={localSpeed}
            onChange={(val) => handleSpeedChange(val)}
            className="flex-1"
          />
          <span className="font-mono text-[11px] font-medium text-slate-200 w-9 text-right tabular-nums">
            {localSpeed.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Playback Mode */}
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
              className={`h-8 rounded-md text-[10px] font-medium transition-colors cursor-pointer border flex items-center justify-center ${
                currentMode === mode.id
                  ? 'bg-accent/20 border-accent/60 text-accent shadow-xs'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Playback Options */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[11px] font-medium text-slate-400 mb-1.5">
          Options
        </div>

        {[
          { key: 'stopOtherSounds' as const, label: 'Stop other sounds' },
          { key: 'muteOtherSounds' as const, label: 'Mute other sounds' },
          { key: 'muteVoice' as const, label: 'Mute voice while playing' },
          { key: 'loop' as const, label: 'Loop continuously' },
        ].map(({ key, label }) => {
          const isChecked = !!(options as any)[key];
          return (
            <div
              key={key}
              onClick={() => handleOptionToggle(key)}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] cursor-pointer transition-colors"
            >
              <span className="text-[11px] text-slate-300 font-medium">{label}</span>
              <div
                className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                  isChecked
                    ? 'bg-accent text-slate-950 font-bold'
                    : 'border border-white/20 bg-white/[0.03]'
                }`}
              >
                {isChecked && <Check size={10} strokeWidth={3} />}
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
