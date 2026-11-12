import React, { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';
import prismLogo from '../assets/Prism.png';

interface TitleBarProps {
  onOpenSettings?: () => void;
  accentColor?: string;
  isMicActive?: boolean;
  deletedCount?: number;
  onOpenDeletedArchive?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = () => {
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
    <header className="h-[44px] w-full bg-[#090B10] text-[#cccccc] flex items-center justify-between border-b border-[#1B222E] select-none drag-region z-50 px-3.5 transition-colors duration-150">
      {/* Left: App Icon + Title */}
      <div className="flex items-center gap-3 no-drag-region">
        <div className="flex items-center gap-2.5">
          <img
            src={prismLogo}
            alt="Prism"
            className="w-6 h-6 object-contain pointer-events-none"
          />
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

      {/* Right: Window Controls */}
      <div className="flex items-center h-full no-drag-region pl-2">
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
    </header>
  );
};
