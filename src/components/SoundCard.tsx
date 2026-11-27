import React, { useState } from 'react';
import { Music, Clapperboard, Play, Square } from 'lucide-react';
import { SoundItem } from '../types';

interface SoundCardProps {
  sound: SoundItem;
  isSelected: boolean;
  isPlaying: boolean;
  playbackProgress?: number;
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
  accentColor,
  onSelect,
  onPlay,
}) => {
  const hasThumbnail = !!sound.thumbnail;

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
      className="group relative flex flex-col cursor-pointer select-none transition-colors duration-200"
    >
      {/* Ambient Thumbnail Color Glow (Frosted & Spreaded past the card borders) */}
      {hasThumbnail ? (
        <div
          className={`ambient-glow absolute -inset-3.5 rounded-3xl bg-cover bg-center blur-2xl pointer-events-none transition-opacity duration-300 ${
            isSelected || isPlaying ? 'opacity-55' : 'opacity-35'
          }`}
          style={{ backgroundImage: `url(${sound.thumbnail})` }}
          aria-hidden="true"
        />
      ) : (
        <div
          className={`ambient-glow absolute -inset-3.5 rounded-3xl bg-accent/20 blur-2xl pointer-events-none transition-opacity duration-300 ${
            isSelected || isPlaying ? 'opacity-35' : 'opacity-15'
          }`}
          aria-hidden="true"
        />
      )}

      {/* Frosted Glass Card Surface */}
      <div
        className={`frosted-card relative flex flex-col p-2.5 rounded-2xl border transition-colors duration-200 overflow-hidden ${
          isSelected
            ? 'bg-[#122538]/75 border-accent/80 backdrop-blur-2xl shadow-[0_8px_28px_rgba(0,0,0,0.55)] ring-1 ring-accent/40'
            : isPlaying
            ? 'bg-[#102030]/70 border-accent/60 backdrop-blur-2xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-1 ring-accent/30'
            : 'bg-[#0e1219]/70 hover:bg-[#131822]/80 border-white/[0.1] hover:border-white/[0.22] backdrop-blur-2xl shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
        }`}
      >
        {/* Subtle Top Specular Sheen */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

        {/* Artwork / Media Area */}
        <div className="relative z-10 w-full aspect-[4/3] rounded-xl bg-black/50 border border-white/[0.1] overflow-hidden flex items-center justify-center shadow-md">
        {hasThumbnail ? (
          <img
            src={sound.thumbnail}
            alt={sound.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200 pointer-events-none"
          />
        ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
          <Clapperboard size={26} className="text-accent opacity-80 pointer-events-none" />
        ) : (
          <Music size={26} className="text-accent opacity-80 pointer-events-none" />
        )}

        {/* Center Play / Pause Indicator */}
        <div
          className={`absolute inset-0 transition-opacity duration-150 flex items-center justify-center z-20 ${
            isPlaying ? 'bg-black/35 opacity-100' : 'bg-black/30 opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onPlay();
            }}
            className={`group/playbtn w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-95 cursor-pointer shadow-md border ${
              isPlaying
                ? 'bg-black/80 border-accent text-accent'
                : 'bg-black/75 border-white/20 text-white hover:border-accent hover:text-accent'
            }`}
            title={isPlaying ? 'Stop sound' : 'Play sound'}
          >
            {isPlaying ? (
              <>
                <Square size={12} className="hidden group-hover/playbtn:block fill-current pointer-events-none" />
                <div className="flex group-hover/playbtn:hidden items-end gap-[2.5px] h-3 w-3 justify-center pointer-events-none">
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.6s_infinite_alternate]" style={{ height: '55%' }} />
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.8s_infinite_alternate]" style={{ height: '100%' }} />
                  <span className="w-[2px] bg-accent rounded-full animate-[bounce_0.5s_infinite_alternate]" style={{ height: '75%' }} />
                </div>
              </>
            ) : (
              <Play size={13} className="fill-current ml-0.5 pointer-events-none" />
            )}
          </button>
        </div>

        {/* Shortcut Badge (Top-Left) */}
        {sound.hotkey && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9.5px] font-mono text-slate-200 font-medium border border-white/10 pointer-events-none z-20">
            {sound.hotkey}
          </div>
        )}

        {/* Duration badge (Bottom-Right) */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9.5px] font-mono text-slate-300 font-medium z-20 pointer-events-none tabular-nums">
          {formatDuration(sound.duration)}
        </div>
      </div>

      {/* Title */}
      <div className="relative z-10 mt-2.5 px-1">
        <h4 className="text-[12px] font-medium text-slate-100 truncate group-hover:text-white transition-colors">
          {sound.title}
        </h4>
      </div>
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
