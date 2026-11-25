import React, { useState } from 'react';
import { AlertTriangle, Trash2, DownloadCloud, Check, X } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight flex items-center gap-2">
              <span>Clear soundboard library</span>
              <span className="text-[12px] font-normal text-slate-400 tabular-nums">
                ({soundCount} {soundCount === 1 ? 'sound' : 'sounds'})
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Sounds are safely preserved in your archive
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-transparent">
          {/* Notice */}
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-[13px] font-medium text-white">
                Clear all active sounds?
              </h4>
              <p className="text-[11.5px] text-slate-300 leading-relaxed">
                All {soundCount} sounds will be removed from your active board and moved to your local archive. You can restore them anytime.
              </p>
            </div>
          </div>

          {/* Backup Option */}
          <div className="pt-3.5 border-t border-white/[0.07] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <DownloadCloud size={16} className="text-accent shrink-0" />
              <div>
                <h5 className="text-[12px] font-medium text-white">Export backup first?</h5>
                <p className="text-[10.5px] text-slate-400">
                  Save a bundled <code className="text-slate-300 font-mono">.prism</code> file
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className={`px-3 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                hasExported
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white'
              }`}
            >
              {hasExported ? (
                <>
                  <Check size={12} />
                  <span>Backup saved</span>
                </>
              ) : (
                <>
                  <DownloadCloud size={12} />
                  <span>Export</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-end gap-3 frosted-modal-chrome shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmClear}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Clear library</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
