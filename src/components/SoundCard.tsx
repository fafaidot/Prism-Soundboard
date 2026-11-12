import React from 'react';
import { Music, Clapperboard, Play } from 'lucide-react';
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
  isDragging = false,
  onCardPointerDown,
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
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea')) return;
        if (onCardPointerDown) {
          onCardPointerDown(e, sound);
        }
      }}
      onClick={() => {
        onSelect();
        onPlay();
      }}
      className={`group relative flex flex-col p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-[#123244] border-[#31C5F4]'
          : 'bg-[#151B25] border-[#1B222E] hover:border-[#31C5F4]/50 hover:bg-[#1B2330]'
      } ${isDragging ? 'opacity-30 scale-95 border-dashed border-[#31C5F4]' : ''}`}
    >
      {/* Artwork / Media Area */}
      <div className="relative w-full aspect-[4/3] rounded-lg bg-[#0E131A] overflow-hidden flex items-center justify-center">
        {hasThumbnail ? (
          <img
            src={sound.thumbnail}
            alt={sound.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 pointer-events-none"
          />
        ) : sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped') ? (
          <Clapperboard size={30} className="text-[#31C5F4] group-hover:scale-110 transition-transform duration-150" />
        ) : (
          <Music size={30} className="text-[#31C5F4] group-hover:scale-110 transition-transform duration-150" />
        )}

        {/* Live playback indicator ring / progress */}
        {isPlaying && (
          <div className="absolute inset-0 border-2 border-[#31C5F4] rounded-lg pointer-events-none" />
        )}

        {/* Hover play icon indicator */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white">
            <Play size={16} className="fill-current ml-0.5" />
          </div>
        </div>

        {/* Sound Shortcut in Top-Left Corner (if set) */}
        {sound.hotkey && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-[#31C5F4] font-semibold border border-white/10 shadow-sm pointer-events-none">
            {sound.hotkey}
          </div>
        )}

        {/* Duration badge at bottom right */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white/90 font-medium">
          {formatDuration(sound.duration)}
        </div>
      </div>

      {/* Title */}
      <div className="mt-2.5 px-1 text-center">
        <h4 className="text-[12px] font-medium text-white truncate group-hover:text-[#31C5F4] transition-colors">
          {sound.title}
        </h4>
      </div>
    </div>
  );
};
