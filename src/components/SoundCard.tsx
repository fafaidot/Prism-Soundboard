import React from 'react';
import { Music, Clapperboard } from 'lucide-react';
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
  isDragging = false,
  onCardPointerDown,
  onSelect,
  onPlay,
}) => {
  const hasThumbnail = !!sound.thumbnail;
  const accent = accentColor || '#22d3ee';

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
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea')) return;
        if (onCardPointerDown) {
          onCardPointerDown(e, sound);
        }
      }}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onPlay();
      }}
      className={`group relative flex flex-col p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-[#142332] border-[#22d3ee] shadow-[0_0_15px_rgba(34,211,238,0.2)]'
          : 'bg-[#111a24] border-[#16222f] hover:border-[#22d3ee]/50 hover:bg-[#14202d]'
      } ${isDragging ? 'opacity-30 scale-95 border-dashed border-[#22d3ee]' : ''}`}
    >
      {/* Artwork / Media Area */}
      <div className="relative w-full aspect-[4/3] rounded-lg bg-[#0d151e] overflow-hidden flex items-center justify-center">
        {hasThumbnail ? (
          <img
            src={sound.thumbnail}
            alt={sound.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 pointer-events-none"
          />
        ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
          <Clapperboard size={30} className="text-[#22d3ee] group-hover:scale-110 transition-transform duration-150" />
        ) : (
          <Music size={30} className="text-[#22d3ee] group-hover:scale-110 transition-transform duration-150" />
        )}

        {/* Live playback indicator ring / progress */}
        {isPlaying && (
          <div className="absolute inset-0 border-2 border-[#22d3ee] rounded-lg pointer-events-none animate-pulse" />
        )}

        {/* Duration badge at bottom right */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white/90 font-medium">
          {formatDuration(sound.duration)}
        </div>
      </div>

      {/* Title */}
      <div className="mt-2.5 px-1 text-center">
        <h4 className="text-[12px] font-medium text-white truncate group-hover:text-[#22d3ee] transition-colors">
          {sound.title}
        </h4>
      </div>
    </div>
  );
};
