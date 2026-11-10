import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Settings, Trash2 } from 'lucide-react';
import prismLogo from '../assets/Prism.png';

interface TitleBarProps {
  onOpenSettings: () => void;
  accentColor: string;
  isMicActive?: boolean;
  deletedCount?: number;
  onOpenDeletedArchive?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onOpenSettings,
  accentColor,
  isMicActive = true,
  deletedCount = 0,
  onOpenDeletedArchive,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const accent = accentColor || 'var(--accent-color, #8b5cf6)';

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
    <header className="h-[42px] w-full bg-[var(--theme-bg-header,#090a0f)] text-[#cccccc] flex items-center justify-between border-b border-[var(--theme-border,#222436)] select-none drag-region z-50 px-3 transition-colors duration-150">
      {/* Left: Brand Icon + Title */}
      <div className="flex items-center gap-3 px-1 no-drag-region">
        <div className="flex items-center gap-2">
          <img
            src={prismLogo}
            alt="Prism Logo"
            className="w-5 h-5 object-contain"
          />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-black tracking-wider text-white">
              PRISM
            </span>
            <span className="text-[11px] font-bold text-[#9da5b7] uppercase tracking-widest">
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
            className="h-[28px] w-[30px] mr-2 rounded-[7px] flex items-center justify-center text-[#8e95a5] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors relative cursor-pointer"
          >
            <Trash2 size={14} className="text-[#ff3b30]" />
            <span className="absolute -top-1 -right-1 px-1 rounded-full bg-[#ff3b30] text-white font-mono text-[10px] font-bold leading-tight">
              {deletedCount}
            </span>
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Audio, Hotkey & Theme Settings"
          className="h-[28px] w-[30px] mr-2 rounded-[7px] flex items-center justify-center text-[#8e95a5] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
        >
          <Settings size={14} className="hover:rotate-45 transition-transform" />
        </button>

        {/* Windows Standard Controls */}
        <div className="flex items-center h-full border-l border-[var(--theme-border,#222436)] pl-1">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="h-full w-[44px] flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className="h-full w-[44px] flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            onClick={handleClose}
            title="Close to Tray"
            className="h-full w-[44px] flex items-center justify-center text-[#8e95a5] hover:bg-[#e81123] hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
