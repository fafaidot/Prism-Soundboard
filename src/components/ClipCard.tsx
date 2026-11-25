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

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '14.8 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDay = (timestamp: number) => {
    if (!timestamp) return 'Today';
    const d = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  };

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
      className="group relative bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] backdrop-blur-md shadow-xs rounded-xl overflow-hidden flex flex-col transition-colors select-none"
    >
      {/* 16:9 Video Canvas */}
      <div
        onClick={onClick}
        className="relative w-full aspect-video bg-[#0e1219] cursor-pointer overflow-hidden"
      >
        <video
          ref={videoRef}
          src={clip.filePath ? `file://${clip.filePath.replace(/\\/g, '/')}` : undefined}
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
        />

        {/* Favorite Star Button */}
        {(isHovered || clip.isFavorite) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={clip.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            className="absolute top-2 right-2 z-20 w-6 h-6 rounded-md bg-black/75 backdrop-blur-xs flex items-center justify-center text-slate-300 hover:text-amber-400 transition-colors"
          >
            <Star
              size={12}
              className={clip.isFavorite ? 'fill-amber-400 text-amber-400' : ''}
            />
          </button>
        )}

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[10px] font-mono text-slate-300 font-medium tabular-nums">
          {formatDuration(clip.duration)}
        </div>
      </div>

      {/* Metadata Footer */}
      <div className="p-3 flex flex-col gap-1">
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
              className="flex-1 bg-white/[0.06] text-white text-[12px] font-medium px-2 py-0.5 rounded outline-none border border-accent"
            />
          ) : (
            <h3
              onClick={onClick}
              title={clip.title}
              className="text-[12px] font-medium text-slate-200 truncate cursor-pointer hover:text-white transition-colors"
            >
              {clip.title}
            </h3>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <MoreVertical size={13} />
          </button>
        </div>

        {/* Subtitle row */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Local</span>
          <span>·</span>
          <span>{formatSize(clip.fileSize)}</span>
          <span>·</span>
          <span>{formatDay(clip.dateAdded)}</span>
        </div>
      </div>

      {/* Context Menu Popup */}
      {showMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 bottom-12 w-44 rounded-lg frosted-dropdown bg-[#0e1219]/50 backdrop-blur-2xl border border-white/[0.14] p-1 shadow-xl z-50 flex flex-col gap-0.5 text-[11.5px]"
        >
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onOpenFolder();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <FolderOpen size={13} className="text-accent" />
            <span>Open in folder</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setIsEditingTitle(true);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Edit2 size={13} className="text-accent" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onToggleFavorite();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Star size={13} className="text-amber-400" />
            <span>{clip.isFavorite ? 'Remove favorite' : 'Favorite'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onExtractToSoundboard();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Music size={13} className="text-accent" />
            <span>Extract audio</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onTrim();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Scissors size={13} className="text-accent" />
            <span>Trim clip</span>
          </button>
          <div className="my-0.5 border-t border-white/[0.08]" />
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              onDelete();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-rose-400 hover:bg-rose-500/10 cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Delete video</span>
          </button>
        </div>
      )}
    </div>
  );
};
