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
  Headphones,
} from 'lucide-react';
import { SoundItem, ReproductionMode } from '../../types';

interface SoundEditSheetProps {
  sound: SoundItem | null;
  token: string;
  isPlaying: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
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
  canEdit = true,
  canDelete = true,
  onClose,
  onTrigger,
  onPatchSound,
  onDeleteSound,
}) => {
  const [title, setTitle] = useState('');
  const [volume, setVolume] = useState(100);
  const [speed, setSpeed] = useState(1.0);
  const [showPhonePreview, setShowPhonePreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const patchTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!sound) return;
    setTitle(sound.title);
    setVolume(sound.volume ?? 100);
    setSpeed(sound.speed ?? 1.0);
    setShowPhonePreview(false);
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

  const volumeFillPct = Math.min(100, Math.max(0, (volume / 200) * 100));
  const speedFillPct = Math.min(100, Math.max(0, ((speed - 0.5) / 1.5) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-[#10141f] border-t border-x sm:border border-white/[0.14] shadow-2xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header: Handle + Thumbnail + Full Title + Close */}
        <div className="sticky top-0 z-20 -mx-4 px-4 pt-2.5 pb-3 bg-[#10141f]/98 border-b border-white/[0.08] space-y-2.5">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
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
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold text-white leading-snug line-clamp-2">
                  {sound.title}
                </p>
                <p className="text-[11px] font-medium text-slate-400 truncate">
                  {sound.author || 'Sound Pad'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/[0.06] active:bg-white/[0.12] border border-white/[0.1] text-slate-300 flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Close properties"
            >
              <X size={18} />
            </button>
          </div>

          {/* Dedicated Thumb-Friendly Quick Actions Row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTrigger(sound.id)}
              style={{ backgroundColor: 'var(--accent)' }}
              className="flex-1 h-10 px-4 rounded-xl text-slate-950 font-bold text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Play size={15} fill="currentColor" />
              <span>{isPlaying ? 'Play Again' : 'Play on PC'}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => onPatchSound(sound.id, { isFavorite: !sound.isFavorite })}
                className={`h-10 px-3.5 rounded-xl border text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 ${
                  sound.isFavorite
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.05] border-white/[0.1] text-slate-300'
                }`}
                aria-label="Toggle favorite"
              >
                <Star size={15} fill={sound.isFavorite ? 'currentColor' : 'none'} />
                <span>{sound.isFavorite ? 'Favorited' : 'Favorite'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPhonePreview((v) => !v)}
              style={showPhonePreview ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                showPhonePreview ? 'bg-white/[0.1]' : 'bg-white/[0.05] border-white/[0.1] text-slate-300'
              }`}
              aria-label="Preview on phone"
              title="Listen on phone"
            >
              <Headphones size={16} />
            </button>
          </div>

          {showPhonePreview && (
            <div className="pt-1">
              <audio
                controls
                autoPlay
                preload="none"
                src={`/api/sounds/${encodeURIComponent(sound.id)}/audio?token=${encodeURIComponent(token)}`}
                className="w-full h-10 rounded-xl"
              />
            </div>
          )}
        </div>

        {canEdit && (
          <>
            {/* Rename Title (16px avoids iOS Safari zoom) */}
            <div className="space-y-1.5">
              <label className="text-[11.5px] font-semibold text-slate-400">
                Sound Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
                  className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[16px] sm:text-[14px] text-white focus:outline-none focus:border-sky-400"
                />
                {title.trim() && title.trim() !== sound.title && (
                  <button
                    type="button"
                    disabled={savingTitle}
                    onClick={commitTitle}
                    style={{ backgroundColor: 'var(--accent)' }}
                    className="h-11 px-4 rounded-xl text-slate-950 font-bold text-[13px] flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Check size={16} />
                    <span>Save</span>
                  </button>
                )}
              </div>
            </div>

            {/* Volume & Speed Controls with Quick Tap Presets */}
            <div className="space-y-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
              {/* Volume */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-200 flex items-center gap-2">
                    <Volume2 size={15} style={{ color: 'var(--accent)' }} />
                    Volume
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[50, 100, 150].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setVolume(preset);
                          schedulePatch({ volume: preset }, true);
                        }}
                        className={`px-2 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold cursor-pointer ${
                          volume === preset
                            ? 'bg-white/[0.16] text-white'
                            : 'bg-white/[0.05] text-slate-400 active:bg-white/[0.12]'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                    <span className="font-mono-tabular text-[12.5px] font-bold text-white pl-1 min-w-[3.1rem] text-right">
                      {volume}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={volume}
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${volumeFillPct}%, rgba(255,255,255,0.14) ${volumeFillPct}%)`,
                  }}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    schedulePatch({ volume: v });
                  }}
                  className="prism-range w-full touch-none"
                />
              </div>

              {/* Speed */}
              <div className="space-y-2.5 pt-3 border-t border-white/[0.07]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-200 flex items-center gap-2">
                    <Gauge size={15} style={{ color: 'var(--accent)' }} />
                    Speed
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[0.75, 1.0, 1.25, 1.5].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSpeed(preset);
                          schedulePatch({ speed: preset }, true);
                        }}
                        className={`px-2 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold cursor-pointer ${
                          Math.abs(speed - preset) < 0.01
                            ? 'bg-white/[0.16] text-white'
                            : 'bg-white/[0.05] text-slate-400 active:bg-white/[0.12]'
                        }`}
                      >
                        {preset === 1 ? '1x' : `${preset}x`}
                      </button>
                    ))}
                    <span className="font-mono-tabular text-[12.5px] font-bold text-white pl-1 min-w-[3.1rem] text-right">
                      {speed.toFixed(2)}x
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={speed}
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${speedFillPct}%, rgba(255,255,255,0.14) ${speedFillPct}%)`,
                  }}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setSpeed(s);
                    schedulePatch({ speed: s });
                  }}
                  className="prism-range w-full touch-none"
                />
              </div>
            </div>

            {/* Playback Behavior (Comfortable wrapped pills instead of cramped 5-column row) */}
            <div className="space-y-2">
              <label className="text-[11.5px] font-semibold text-slate-400">
                When tapped while playing
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {MODES.map((m) => {
                  const active = sound.reproductionMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onPatchSound(sound.id, { reproductionMode: m.id })}
                      style={
                        active
                          ? {
                              backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                              borderColor: 'var(--accent)',
                              color: '#fff',
                            }
                          : undefined
                      }
                      className={`h-11 px-2 rounded-xl border text-[12.5px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? ''
                          : 'bg-white/[0.04] border-white/[0.09] text-slate-300 active:bg-white/[0.1]'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Playback Options */}
            <div className="space-y-2">
              <label className="text-[11.5px] font-semibold text-slate-400">
                Playback Options
              </label>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06]">
                {[
                  { key: 'stopOtherSounds', label: 'Stop other sounds' },
                  { key: 'muteOtherSounds', label: 'Mute other sounds' },
                  { key: 'muteVoice', label: 'Mute mic while playing' },
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
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-white/[0.04]"
                    >
                      <span className="text-[13.5px] font-medium text-slate-200">{item.label}</span>
                      <span
                        style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
                        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                          checked ? '' : 'bg-white/[0.12]'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            checked ? 'left-6' : 'left-1'
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Delete Sound */}
        {canDelete && (
          <div className="pt-1">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeleteSound(sound.id)}
                  className="flex-1 h-12 rounded-xl bg-rose-600 active:bg-rose-500 text-white font-bold text-[13.5px] cursor-pointer"
                >
                  Confirm Move to Trash
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-12 px-5 rounded-xl bg-white/[0.07] active:bg-white/[0.14] text-slate-200 font-semibold text-[13.5px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full h-11 rounded-xl bg-rose-500/10 active:bg-rose-500/20 border border-rose-500/25 text-rose-300 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={15} />
                <span>Move Sound to Trash</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
