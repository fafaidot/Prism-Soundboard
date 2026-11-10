import React from 'react';
import { Play, Square, Star, Trash2, Music, X, Clapperboard } from 'lucide-react';
import { SoundItem } from '../types';

interface SoundCardProps {
  sound: SoundItem;
  isSelected: boolean;
  isPlaying: boolean;
  playbackProgress?: number; // 0 to 1
  accentColor: string;
  isListeningHotkey?: boolean;
  isDragging?: boolean;
  onCardPointerDown?: (e: React.PointerEvent<HTMLDivElement>, sound: SoundItem) => void;
  onSelect: () => void;
  onPlay: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onStartListeningHotkey: () => void;
  onClearHotkey: () => void;
}

export const SoundCard: React.FC<SoundCardProps> = ({
  sound,
  isSelected,
  isPlaying,
  playbackProgress = 0,
  accentColor,
  isListeningHotkey = false,
  isDragging = false,
  onCardPointerDown,
  onSelect,
  onPlay,
  onToggleFavorite,
  onDelete,
  onStartListeningHotkey,
  onClearHotkey,
}) => {
  const hasThumbnail = !!sound.thumbnail;
  const accent = accentColor || 'var(--accent-color, #8b5cf6)';

  return (
    <div
      data-sound-id={sound.id}
      draggable={false}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea')) return;
        if (onCardPointerDown) {
          onCardPointerDown(e, sound);
        }
      }}
      onClick={onSelect}
      style={{
        backgroundColor: isSelected
          ? 'var(--theme-bg-card-selected, #252936)'
          : 'var(--theme-bg-card, #171920)',
        borderColor: isSelected ? accent : 'var(--theme-border, #20232d)',
      }}
      className={`group relative flex flex-col items-center p-2 rounded-[14px] border transition-all duration-150 cursor-pointer select-none hover:border-[var(--theme-border-hover,#2d3240)] ${
        isDragging
          ? 'opacity-25 scale-95 border-2 border-dashed'
          : isSelected
          ? 'ring-2'
          : 'hover:brightness-105'
      }`}
    >
      {/* Integrated Artwork Container */}
      <div className="relative w-full aspect-square rounded-[12px] bg-[var(--theme-bg-header,#090a0f)] flex items-center justify-center">
        {/* Artwork / Thumbnail (overflow-hidden so blur is contained inside artwork without clipping the outer progress ring) */}
        <div className="absolute inset-0 rounded-[12px] overflow-hidden flex items-center justify-center">
          {hasThumbnail ? (
            <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
              {/* Blurred background copy to fill 1:1 square without black bars looking empty */}
              <img
                src={sound.thumbnail}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-50 scale-110 pointer-events-none"
              />
              {/* Sharp foreground letterboxed thumbnail (preserves 16:9 without any cropping) */}
              <img
                src={sound.thumbnail}
                alt={sound.title}
                className="relative w-full h-full object-contain z-1 group-hover:scale-105 transition-transform duration-200 pointer-events-none"
              />
            </div>
          ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--theme-bg-surface,#111317)] p-2 text-center select-none pointer-events-none">
              <Clapperboard size={26} style={{ color: accent }} className="mb-1" />
              <span className="text-[11px] font-bold text-white/90 line-clamp-2 px-1 leading-tight break-words">
                {sound.title}
              </span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--theme-bg-surface,#111317)] p-2 text-center select-none pointer-events-none">
              <Music size={26} style={{ color: `${accent}b3` }} className="mb-1" />
              <span className="text-[11px] font-bold text-white/80 line-clamp-2 px-1 leading-tight break-words">
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
              strokeDashoffset={360 * (1 - Math.min(1, Math.max(0, playbackProgress)))}
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
            />
          </svg>
        )}

        {/* Top-Left: Hotkey Badge or Hover '+ Key' prompt */}
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center">
          {sound.hotkey ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] bg-black/80 backdrop-blur-sm border border-white/10 shadow text-[10px] font-mono font-bold text-white">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartListeningHotkey();
                }}
                className="hover:underline cursor-pointer"
                style={{ color: accent }}
                title="Click to re-record hotkey"
              >
                {sound.hotkey}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearHotkey();
                }}
                className="opacity-60 hover:opacity-100 hover:text-[#ff3b30] cursor-pointer"
                title="Clear hotkey"
              >
                <X size={10} />
              </button>
            </div>
          ) : isListeningHotkey ? (
            <span
              className="px-1.5 py-0.5 rounded-[5px] bg-black/80 text-[10px] font-mono font-bold border"
              style={{ color: accent, borderColor: accent }}
            >
              Key...
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartListeningHotkey();
              }}
              className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded-[5px] bg-black/75 hover:bg-black/90 text-[10px] font-semibold text-white/80 hover:text-white transition-opacity cursor-pointer border border-white/10"
              title="Assign hotkey"
            >
              + Key
            </button>
          )}
        </div>

        {/* Top-Right Action Buttons: Star + Delete */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-20">
          <button
            onClick={onToggleFavorite}
            title={sound.isFavorite ? 'Favorited' : 'Add to Favorites'}
            className={`p-1 rounded-full transition-all cursor-pointer ${
              sound.isFavorite
                ? 'opacity-100 text-[#ffbd2e] bg-black/70'
                : 'opacity-0 group-hover:opacity-100 text-white/70 hover:text-white bg-black/70 hover:bg-black/90'
            }`}
          >
            <Star size={12} className={sound.isFavorite ? 'fill-current' : ''} />
          </button>
          <button
            onClick={onDelete}
            title="Delete Sound"
            className="p-1 rounded-full opacity-0 group-hover:opacity-100 text-[#8a92a6] hover:text-[#ff3b30] bg-black/70 hover:bg-black/90 transition-all cursor-pointer"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Playing Animated Waveform Overlay */}
        {isPlaying && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center z-15 pointer-events-none">
            <div className="flex items-end gap-1 h-6">
              <span className="w-1 rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '60%', backgroundColor: accent }} />
              <span className="w-1 rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%', backgroundColor: accent }} />
              <span className="w-1 rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '80%', backgroundColor: accent }} />
              <span className="w-1 rounded-full animate-[bounce_0.7s_infinite_alternate]" style={{ height: '40%', backgroundColor: accent }} />
            </div>
          </div>
        )}

        {/* Quick Play/Stop Trigger Overlay Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          title={isPlaying ? 'Stop' : 'Play Sound'}
          className={`absolute inset-0 m-auto w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 z-20 cursor-pointer ${
            isPlaying
              ? 'bg-[#e81123] text-white opacity-100 hover:scale-105'
              : 'bg-black/75 text-white opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-white hover:text-black backdrop-blur-sm'
          }`}
        >
          {isPlaying ? <Square size={14} className="fill-current" /> : <Play size={16} className="fill-current ml-0.5" />}
        </button>

        {/* Duration badge: bottom right */}
        {sound.duration ? (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-[5px] bg-black/80 backdrop-blur-sm text-[11px] font-mono font-bold text-white/90 z-20 pointer-events-none border border-white/10">
            {Math.floor(sound.duration / 60)}:
            {Math.floor(sound.duration % 60)
              .toString()
              .padStart(2, '0')}
          </div>
        ) : null}

        {/* Source Badge (YouTube only, no 5s clip tag) */}
        {sound.source === 'youtube' && (
          <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-[5px] bg-black/80 text-[10px] font-mono font-bold text-white/80 z-20 pointer-events-none border border-white/10">
            YT
          </div>
        )}
      </div>

      {/* Sound Title (Integrated clean 2-line clamp support) */}
      <div className="w-full mt-2 px-1 text-center">
        <h3
          className="text-[12px] font-bold text-white/95 leading-tight line-clamp-2 break-words"
          title={sound.title}
        >
          {sound.title}
        </h3>
      </div>
    </div>
  );
};
