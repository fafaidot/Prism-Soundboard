import React, { useRef, useState, useEffect } from 'react';
import { VideoClipItem } from '../types';
import { Star, MoreVertical, FolderOpen, Edit2, Music, Trash2, Scissors, Copy, Check } from 'lucide-react';
import { Tooltip } from './Tooltip';

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
  accentColor,
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
  const [copiedLink, setCopiedLink] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const accent = accentColor || 'var(--accent-color, #38bdf8)';

  // Format seconds to mm:ss
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format file size (e.g. 37.9 MB)
  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Format relative day (e.g. "Tuesday", "Yesterday", "Today")
  const formatDay = (timestamp: number) => {
    if (!timestamp) return 'Recent';
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
      className="group relative bg-[#151720] border border-[#232738] hover:border-[#38bdf8]/60 rounded-[14px] overflow-hidden flex flex-col transition-all duration-200 shadow-md hover:shadow-2xl hover:scale-[1.015]"
    >
      {/* 16:9 Video Canvas / Preview Container */}
      <div
        onClick={onClick}
        className="relative w-full aspect-video bg-black cursor-pointer overflow-hidden select-none"
      >
        <video
          ref={videoRef}
          src={`file:///${clip.filePath.replace(/\\/g, '/')}`}
          muted
          playsInline
          loop
          preload="metadata"
          className="w-full h-full object-cover"
        />

        {/* Favorite Star: Visible ONLY when hovering or when clip is favorited */}
        {(isHovered || clip.isFavorite) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={clip.isFavorite ? 'Favorited' : 'Add to Favorites'}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:scale-110 transition-all z-20 cursor-pointer shadow-lg"
          >
            <Star
              size={15}
              className={clip.isFavorite ? 'fill-[#ffb703] text-[#ffb703]' : 'text-white/80 hover:text-white'}
            />
          </button>
        )}

        {/* Minimal Duration Tag on the bottom right of the video preview */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-[5px] bg-black/75 backdrop-blur-sm border border-white/10 text-[10.5px] font-mono font-bold text-white tracking-wide z-10 select-none">
          {formatDuration(clip.duration)}
        </div>
      </div>

      {/* Card Info Details (Matching User Reference Image) */}
      <div className="p-3 bg-[#13151e] flex flex-col gap-1.5 border-t border-[#1e2230]">
        <div className="flex items-center justify-between gap-2">
          {isEditingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setTitleInput(clip.title);
                }
              }}
              className="w-full bg-[#1e2230] text-white text-[13px] font-bold px-2 py-0.5 rounded border border-[#38bdf8] focus:outline-none"
            />
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1.5 text-white font-bold text-[13px] hover:text-[#38bdf8] cursor-pointer group/title truncate"
            >
              <span className="truncate">{clip.title || 'Untitled'}</span>
              <Edit2 size={11} className="opacity-0 group-hover/title:opacity-100 text-[#7e8697] transition-opacity shrink-0" />
            </div>
          )}

          {/* Context Options Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-[#7e8697] hover:text-white transition-colors cursor-pointer"
            >
              <MoreVertical size={15} />
            </button>

            {/* Context Dropdown Menu */}
            {showMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-full mb-1 w-52 bg-[#12141c] border border-[#252a3b] rounded-[12px] shadow-[0_10px_35px_rgba(0,0,0,0.85)] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 select-none"
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onOpenFolder();
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <FolderOpen size={14} style={{ color: accent }} />
                  <span>Open in Folder</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setIsEditingTitle(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Edit2 size={14} className="text-[#94a3b8]" />
                  <span>Rename Clip</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    onToggleFavorite();
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Star size={14} className={clip.isFavorite ? 'fill-[#ffb703] text-[#ffb703]' : 'text-[#ffb703]'} />
                  <span>{clip.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    onExtractToSoundboard();
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Music size={14} style={{ color: accent }} />
                  <span>Extract to Soundboard</span>
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    onTrim();
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Scissors size={14} className="text-[#38bdf8]" />
                  <span>Trim Video</span>
                </button>

                <div className="h-px bg-white/10 my-1" />

                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-[#ff4d5e] hover:bg-[#ff4d5e]/15 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete Clip</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Subtitle Metadata Info: Icon • On Device • Size • Date */}
        <div className="flex items-center gap-2 text-[11px] text-[#717a8e] font-medium select-none truncate">
          <span className="flex items-center gap-1 text-[#9da5b7]">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
            <span>On Device</span>
          </span>
          <span>•</span>
          <span>{formatSize(clip.fileSize)}</span>
          <span>•</span>
          <span className="text-[#9da5b7]">{formatDay(clip.dateAdded)}</span>
        </div>
      </div>
    </div>
  );
};
