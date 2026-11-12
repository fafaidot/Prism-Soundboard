import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Trash2 } from 'lucide-react';

interface TitleBarProps {
  onOpenSettings: () => void;
  accentColor: string;
  isMicActive?: boolean;
  deletedCount?: number;
  onOpenDeletedArchive?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  deletedCount = 0,
  onOpenDeletedArchive,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.soundboardAPI) {
      window.soundboardAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }
  }, []);

  const handleMinimize = () => {
    window.soundboardAPI?.minimizeWindow();
  };

  const handleMaximize = async () => {
    await window.soundboardAPI?.maximizeWindow();
    const max = await window.soundboardAPI?.isMaximized();
    setIsMaximized(!!max);
  };

  const handleClose = () => {
    window.soundboardAPI?.closeWindow();
  };

  return (
    <header className="h-[44px] w-full bg-[#070a0e] text-[#cccccc] flex items-center justify-between border-b border-[#16222f] select-none drag-region z-50 px-3.5 transition-colors duration-150">
      {/* Left: Brand Icon + Title */}
      <div className="flex items-center gap-3 no-drag-region">
        <div className="flex items-center gap-2.5">
          {/* Cyan "P" Badge */}
          <div className="w-7 h-7 rounded-lg bg-[#22d3ee] flex items-center justify-center shadow-sm">
            <span className="text-[15px] font-black text-[#070a0e] leading-none select-none">
              P
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-black tracking-wider text-white">
              PRISM
            </span>
            <span className="text-[11px] font-bold text-[#5a687c] uppercase tracking-widest">
              SOUNDBOARD
            </span>
          </div>
        </div>
      </div>

      {/* Right: Quick actions & Window Controls */}
      <div className="flex items-center h-full no-drag-region">
        {deletedCount > 0 && onOpenDeletedArchive && (
          <button
            onClick={onOpenDeletedArchive}
            title={`View & Restore Deleted Sounds (${deletedCount})`}
            className="h-[28px] px-2.5 mr-2 rounded-lg flex items-center justify-center gap-1.5 text-[#8e95a5] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
          >
            <Trash2 size={13} className="text-[#ff3b30]" />
            <span className="text-[11px] font-bold text-[#ff3b30]">{deletedCount}</span>
          </button>
        )}

        {/* Windows Standard Controls */}
        <div className="flex items-center h-full pl-2">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="h-full w-[42px] flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className="h-full w-[42px] flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            title="Close"
            className="h-full w-[42px] flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-[#e81123] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
