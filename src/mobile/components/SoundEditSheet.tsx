import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Volume2,
  Gauge,
  Play,
  Trash2,
  Check,
  Music,
} from 'lucide-react';
import { SoundItem, ReproductionMode } from '../../types';

interface SoundEditSheetProps {
  sound: SoundItem | null;
  token: string;
  isPlaying: boolean;
  onClose: () => void;
  onTrigger: (soundId: string) => void;
  onPatchSound: (soundId: string, patch: Partial<SoundItem>) => Promise<void>;
  onDeleteSound: (soundId: string) => Promise<void>;
}

const MODES: Array<{ id: ReproductionMode; label: string }> = [
  { id: 'overlap', label: 'Overlap' },
  { id: 'pause', label: 'Pause' },
  { id: 'stop', label: 'Stop' },
  { id: 'restart', label: 'Restart' },
  { id: 'push_loop', label: 'Loop' },
];

export const SoundEditSheet: React.FC<SoundEditSheetProps> = ({
  sound,
  token,
  isPlaying,
  onClose,
  onTrigger,
  onPatchSound,
  onDeleteSound,
}) => {
  const [title, setTitle] = useState('');
  const [volume, setVolume] = useState(100);
  const [speed, setSpeed] = useState(1.0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const patchTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!sound) return;
    setTitle(sound.title);
    setVolume(sound.volume ?? 100);
    setSpeed(sound.speed ?? 1.0);
    setConfirmDelete(false);
  }, [sound?.id]);

  // Keep synced if desktop updates properties while sheet is open
  useEffect(() => {
    if (!sound) return;
    setVolume(sound.volume ?? 100);
    setSpeed(sound.speed ?? 1.0);
  }, [sound?.volume, sound?.speed]);

  if (!sound) return null;

  const schedulePatch = (patch: Partial<SoundItem>, immediate = false) => {
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    if (immediate) {
      onPatchSound(sound.id, patch);
      return;
    }
    patchTimerRef.current = setTimeout(() => {
      onPatchSound(sound.id, patch);
    }, 65);
  };

  const commitTitle = async () => {
    const clean = title.trim();
    if (!clean || clean === sound.title) return;
    setSavingTitle(true);
    try {
      await onPatchSound(sound.id, { title: clean });
    } finally {
      setSavingTitle(false);
    }
  };

  const options = sound.reproductionOptions || {
    stopOtherSounds: true,
    muteOtherSounds: false,
    muteVoice: false,
    loop: false,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-[#10141f] border-t border-x border-white/[0.14] shadow-2xl px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle + Header */}
        <div className="space-y-3">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {sound.thumbnail ? (
                <img
                  src={sound.thumbnail}
                  alt={sound.title}
                  className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-sky-400 shrink-0">
                  <Music size={18} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400 truncate">
                  {sound.author || 'Sound Pad'}
                </p>
                <p className="text-[14px] font-bold text-white truncate">{sound.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onPatchSound(sound.id, { isFavorite: !sound.isFavorite })}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-colors ${
                  sound.isFavorite
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-white/[0.05] border-white/[0.1] text-slate-400'
                }`}
                aria-label="Toggle favorite"
              >
                <Star size={17} fill={sound.isFavorite ? 'currentColor' : 'none'} />
              </button>

              <button
                type="button"
                onClick={() => onTrigger(sound.id)}
                style={{ backgroundColor: 'var(--accent)' }}
                className="h-10 px-3.5 rounded-xl text-slate-950 font-bold text-[12.5px] flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
              >
                <Play size={14} fill="currentColor" />
                <span>{isPlaying ? 'Active' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] text-slate-300 flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        </div>

        {/* Rename Title */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Sound Title
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
              className="flex-1 h-11 px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[14px] text-white focus:outline-none focus:border-sky-400"
            />
            {title.trim() && title.trim() !== sound.title && (
              <button
                type="button"
                disabled={savingTitle}
                onClick={commitTitle}
                style={{ backgroundColor: 'var(--accent)' }}
                className="h-11 px-3.5 rounded-xl text-slate-950 font-bold text-[12.5px] flex items-center gap-1 cursor-pointer"
              >
                <Check size={15} />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Volume & Speed Sliders */}
        <div className="space-y-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
          {/* Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-slate-200 flex items-center gap-2">
                <Volume2 size={15} style={{ color: 'var(--accent)' }} />
                Volume
              </span>
              <button
                type="button"
                onClick={() => {
                  setVolume(100);
                  schedulePatch({ volume: 100 }, true);
                }}
                className="font-mono-tabular text-[13px] font-bold text-white px-2 py-0.5 rounded-md bg-white/[0.06] cursor-pointer"
                title="Tap to reset to 100%"
              >
                {volume}%
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                schedulePatch({ volume: v });
              }}
              className="prism-range w-full"
            />
          </div>

          {/* Speed */}
          <div className="space-y-2 pt-1 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-slate-200 flex items-center gap-2">
                <Gauge size={15} style={{ color: 'var(--accent)' }} />
                Playback Speed
              </span>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1.0);
                  schedulePatch({ speed: 1.0 }, true);
                }}
                className="font-mono-tabular text-[13px] font-bold text-white px-2 py-0.5 rounded-md bg-white/[0.06] cursor-pointer"
                title="Tap to reset to 1.00x"
              >
                {speed.toFixed(2)}x
              </button>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={speed}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSpeed(s);
                schedulePatch({ speed: s });
              }}
              className="prism-range w-full"
            />
          </div>
        </div>

        {/* Playback Behavior */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Playback Behavior
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {MODES.map((m) => {
              const active = sound.reproductionMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPatchSound(sound.id, { reproductionMode: m.id })}
                  style={active ? { borderColor: 'var(--accent)', color: '#fff' } : undefined}
                  className={`h-10 rounded-xl border text-[11.5px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-white/[0.12] border-sky-400 text-white'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reproduction Options */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Options
          </label>
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06]">
            {[
              { key: 'stopOtherSounds', label: 'Stop other sounds' },
              { key: 'muteOtherSounds', label: 'Mute other sounds' },
              { key: 'muteVoice', label: 'Mute voice while playing' },
              { key: 'loop', label: 'Loop continuously' },
            ].map((item) => {
              const checked = !!(options as any)[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    onPatchSound(sound.id, {
                      reproductionOptions: {
                        ...options,
                        [item.key]: !checked,
                      },
                    })
                  }
                  className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer active:bg-white/[0.04]"
                >
                  <span className="text-[13px] font-medium text-slate-200">{item.label}</span>
                  <span
                    style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      checked ? '' : 'bg-white/[0.1]'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        checked ? 'left-5' : 'left-1'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview on Phone */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Phone Preview
          </label>
          <audio
            controls
            preload="none"
            src={`/api/sounds/${encodeURIComponent(sound.id)}/audio?token=${encodeURIComponent(token)}`}
            className="w-full h-10 rounded-xl"
          />
        </div>

        {/* Delete Sound */}
        <div className="pt-1">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDeleteSound(sound.id)}
                className="flex-1 h-11 rounded-xl bg-rose-600 text-white font-bold text-[13px] cursor-pointer"
              >
                Confirm Move to Trash
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-11 px-4 rounded-xl bg-white/[0.06] text-slate-300 font-semibold text-[13px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full h-11 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 size={15} />
              <span>Move Sound to Trash</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
