import React, { useRef, useState, useEffect } from 'react';
import { VideoClipItem } from '../types';
import { Star, MoreVertical, FolderOpen, Edit2, Music, Trash2, Scissors } from 'lucide-react';

interface ClipCardProps {
  clip: VideoClipItem;
  accentColor: string;
  onClick: () => void;
  onToggleFavorite: () => void;
  onOpenFolder: () => void;
  onRename: (newTitle: string) => void;
  onExtractToSoundboard: () => void;
  onTrim: () => void;
  onDelete: () => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  onClick,
  onToggleFavorite,
  onOpenFolder,
  onRename,
  onExtractToSoundboard,
  onTrim,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(clip.title);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Format seconds to mm:ss
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format file size (e.g. 14.8 MB)
  const formatSize = (bytes: number) => {
    if (!bytes) return '14.8 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Format relative day (e.g. "Today", "Yesterday", "Tuesday")
  const formatDay = (timestamp: number) => {
    if (!timestamp) return 'Today';
    const d = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  };

  // Hover: Plays video muted with no sound
  useEffect(() => {
    if (videoRef.current) {
      if (isHovered) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isHovered]);

  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && titleInput !== clip.title) {
      onRename(titleInput.trim());
    } else {
      setTitleInput(clip.title);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(true);
      }}
      className="group relative bg-[#151B25] border border-[#1B222E] hover:border-[#31C5F4] rounded-2xl overflow-hidden flex flex-col transition-all duration-200 select-none"
    >
      {/* 16:9 Video Canvas Container */}
      <div
        onClick={onClick}
        className="relative w-full aspect-video bg-[#0E131A] cursor-pointer overflow-hidden"
      >
        <video
          ref={videoRef}
          src={clip.filePath ? `file://${clip.filePath.replace(/\\/g, '/')}` : undefined}
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Favorite Star Button (shows on hover or if favorited) */}
        {(isHovered || clip.isFavorite) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={clip.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-yellow-400 transition-colors"
          >
            <Star
              size={14}
              className={clip.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}
            />
          </button>
        )}

        {/* Duration badge at bottom right */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[11px] font-mono text-white font-medium">
          {formatDuration(clip.duration)}
        </div>
      </div>

      {/* Card Footer / Metadata */}
      <div className="p-3.5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              autoFocus
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setTitleInput(clip.title);
                }
              }}
              className="flex-1 bg-[#0E131A] text-white text-[13px] font-semibold px-2 py-1 rounded outline-none border border-[#31C5F4]"
            />
          ) : (
            <h3
              onClick={onClick}
              title={clip.title}
              className="text-[13px] font-semibold text-white truncate cursor-pointer hover:text-[#31C5F4] transition-colors"
            >
              {clip.title}
            </h3>
          )}

          {/* More options 3 dots button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="text-[#5a687c] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <MoreVertical size={14} />
          </button>
        </div>

        {/* Subtitle Row: ● On device  •  14.8 MB  •  Today */}
        <div className="flex items-center gap-2 text-[11px] text-[#5a687c] font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            <span>On device</span>
          </div>
          <span>•</span>
          <span>{formatSize(clip.fileSize)}</span>
          <span>•</span>
          <span>{formatDay(clip.dateAdded)}</span>
        </div>
      </div>

      {/* Right Click / More Menu Popup */}
      {showMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-12 w-48 rounded-xl bg-[#151B25] border border-[#1B222E] p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 text-[12px]"
        >
          <button
            onClick={() => {
              setShowMenu(false);
              onOpenFolder();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#8e95a5] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <FolderOpen size={13} className="text-[#31C5F4]" />
            <span>Open in folder</span>
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              setIsEditingTitle(true);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#8e95a5] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Edit2 size={13} className="text-[#31C5F4]" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              onToggleFavorite();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#8e95a5] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Star size={13} className="text-yellow-400" />
            <span>{clip.isFavorite ? 'Remove Favorite' : 'Favorite'}</span>
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              onExtractToSoundboard();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#8e95a5] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Music size={13} className="text-[#a78bfa]" />
            <span>Extract to Soundboard</span>
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              onTrim();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#8e95a5] hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <Scissors size={13} className="text-[#31C5F4]" />
            <span>Trim Clip</span>
          </button>
          <div className="my-1 border-t border-[#1B222E]" />
          <button
            onClick={() => {
              setShowMenu(false);
              onDelete();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Delete Video</span>
          </button>
        </div>
      )}
    </div>
  );
};
