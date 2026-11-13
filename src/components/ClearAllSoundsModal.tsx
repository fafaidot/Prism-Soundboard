import React, { useState } from 'react';
import { AlertTriangle, Trash2, DownloadCloud, Check, X } from 'lucide-react';
import prismLogo from '../assets/Prism.png';

interface ClearAllSoundsModalProps {
  isOpen: boolean;
  soundCount: number;
  onClose: () => void;
  onConfirmClear: () => void;
  onExportBackup: () => Promise<boolean | void>;
}

export const ClearAllSoundsModal: React.FC<ClearAllSoundsModalProps> = ({
  isOpen,
  soundCount,
  onClose,
  onConfirmClear,
  onExportBackup,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExportBackup();
      setHasExported(true);
    } catch (_) {}
    setIsExporting(false);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/70 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shadow-sm">
              <Trash2 size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide flex items-center gap-2">
                <span>Clear Soundboard Library</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                  {soundCount} {soundCount === 1 ? 'sound' : 'sounds'}
                </span>
              </h3>
              <p className="text-[11px] text-[#5A687C]">
                Remove active sounds while safely preserving files in your archive
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-[#0B0E14]">
          {/* Warning Container */}
          <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-[13px] font-bold text-white">
                Are you sure you want to clear all {soundCount} sounds?
              </h4>
              <p className="text-[11.5px] text-[#8E95A5] leading-relaxed">
                All sounds will be removed from your active soundboard. Your audio files will be safely moved to your <span className="text-white font-semibold">archive</span>, so you can restore them anytime from Settings or the Archive menu.
              </p>
            </div>
          </div>

          {/* Export Backup Card */}
          <div className="p-4 bg-[#10141C] border border-[#1B222E] rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#151B25] border border-[#1B222E] text-[#31C5F4] flex items-center justify-center flex-shrink-0">
                <DownloadCloud size={16} />
              </div>
              <div>
                <h5 className="text-[12.5px] font-bold text-white">Export Backup Archive First?</h5>
                <p className="text-[11px] text-[#5A687C]">
                  Save a bundled <code className="text-white font-mono">.prism</code> file of all your sounds and hotkeys
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className={`px-3.5 py-1.5 rounded-xl text-[11.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 active:scale-95 shadow-sm ${
                hasExported
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 text-white'
              }`}
            >
              {hasExported ? (
                <>
                  <Check size={13} />
                  <span>Backup Saved</span>
                </>
              ) : (
                <>
                  <DownloadCloud size={13} className="text-[#31C5F4]" />
                  <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <span className="text-[11px] text-[#5A687C]">
            Files are moved to recycle archive, not deleted from disk
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[#8E95A5] hover:text-white bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmClear();
                onClose();
              }}
              className="px-5 py-2 rounded-xl text-[12px] font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span>Clear All ({soundCount})</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
