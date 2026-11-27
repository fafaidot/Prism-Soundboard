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
    <header className="h-[38px] w-full bg-[#090b10]/45 backdrop-blur-xl text-slate-400 flex items-center justify-between border-b border-white/[0.08] select-none drag-region z-50 px-3">
      {/* Left: App Logo + Title */}
      <div className="flex items-center gap-2.5 no-drag-region">
        <img
          src={prismLogo}
          alt="Prism"
          className="w-4.5 h-4.5 object-contain pointer-events-none"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-slate-200 tracking-tight">
            Prism Soundboard
          </span>
          <span className="text-[10px] font-mono text-slate-500 font-medium">
            v1.5.5
          </span>
        </div>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center h-full no-drag-region">
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize"
          className="no-drag-region h-full w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          className="no-drag-region h-full w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          title="Close"
          className="no-drag-region h-full w-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  );
};
