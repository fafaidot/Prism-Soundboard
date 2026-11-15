import React, { useState } from 'react';
import { Music, Clapperboard, Play, Square } from 'lucide-react';
import { SoundItem } from '../types';

interface SoundCardProps {
  sound: SoundItem;
  isSelected: boolean;
  isPlaying: boolean;
  playbackProgress?: number; // 0 to 1
  accentColor: string;
  isListeningHotkey?: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onStartListeningHotkey?: () => void;
  onClearHotkey?: () => void;
}

const SoundCardComponent: React.FC<SoundCardProps> = ({
  sound,
  isSelected,
  isPlaying,
  playbackProgress = 0,
  accentColor,
  onSelect,
  onPlay,
}) => {
  const [isHoveringBtn, setIsHoveringBtn] = useState(false);
  const hasThumbnail = !!sound.thumbnail;
  const accent = accentColor || 'var(--accent-color)';

  const formatDuration = (sec?: number) => {
    if (!sec) return '0:08';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      data-sound-id={sound.id}
      draggable={false}
      onClick={() => {
        onSelect();
        onPlay();
      }}
      className={`group relative flex flex-col p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-theme-card-selected border-accent'
          : 'bg-theme-card border-theme hover:border-accent/50 hover:bg-theme-card-hover'
      }`}
    >
      {/* Artwork / Media Area */}
      <div className="relative w-full aspect-[4/3] rounded-lg bg-theme-surface overflow-hidden flex items-center justify-center">
        {hasThumbnail ? (
          <img
            src={sound.thumbnail}
            alt={sound.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 pointer-events-none"
          />
        ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
          <Clapperboard size={30} className="text-accent group-hover:scale-110 transition-transform duration-150" />
        ) : (
          <Music size={30} className="text-accent group-hover:scale-110 transition-transform duration-150" />
        )}

        {/* Interactive Subtle & Soft Center Play / Pause Button */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 flex items-center justify-center z-20 ${
            isPlaying ? 'bg-black/20 backdrop-blur-[1px] opacity-100' : 'bg-black/25 opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onMouseEnter={() => setIsHoveringBtn(true)}
            onMouseLeave={() => setIsHoveringBtn(false)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onPlay();
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border ${
              isPlaying
                ? 'bg-black/65 border-accent/50 text-accent hover:bg-black/80 hover:border-accent'
                : 'bg-black/60 border-white/20 text-white/90 hover:border-accent/60 hover:text-accent hover:bg-black/80'
            }`}
            title={isPlaying ? 'Stop Sound' : 'Play Sound'}
          >
            {isPlaying ? (
              isHoveringBtn ? (
                <Square size={13} className="fill-accent text-accent rounded-[2px]" />
              ) : (
                <div className="flex items-end gap-[3px] h-3.5 w-3.5 justify-center pointer-events-none">
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '55%' }} />
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%' }} />
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%' }} />
                </div>
              )
            ) : (
              <Play size={15} className="fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Sound Shortcut in Top-Left Corner (if set) */}
        {sound.hotkey && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-accent font-semibold border border-white/10 shadow-sm pointer-events-none z-20">
            {sound.hotkey}
          </div>
        )}

        {/* Duration badge at bottom right */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white/90 font-medium z-20 pointer-events-none">
          {formatDuration(sound.duration)}
        </div>
      </div>

      {/* Title */}
      <div className="mt-2.5 px-1 text-center">
        <h4 className="text-[12px] font-medium text-theme-primary truncate group-hover:text-accent transition-colors">
          {sound.title}
        </h4>
      </div>
    </div>
  );
};

export const SoundCard = React.memo(SoundCardComponent, (prev, next) => {
  return (
    prev.sound.id === next.sound.id &&
    prev.sound.title === next.sound.title &&
    prev.sound.hotkey === next.sound.hotkey &&
    prev.sound.duration === next.sound.duration &&
    prev.sound.thumbnail === next.sound.thumbnail &&
    prev.sound.isFavorite === next.sound.isFavorite &&
    prev.isSelected === next.isSelected &&
    prev.isPlaying === next.isPlaying &&
    prev.playbackProgress === next.playbackProgress &&
    prev.accentColor === next.accentColor
  );
});
