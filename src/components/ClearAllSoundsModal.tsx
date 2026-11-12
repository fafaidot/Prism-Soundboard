import React, { useState } from 'react';
import { AlertTriangle, Trash2, DownloadCloud, Check } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-[#10141C] border border-[#1B222E] rounded-2xl shadow-2xl overflow-hidden text-white">
        {/* Header / Body */}
        <div className="p-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="text-base font-bold text-white tracking-tight">Clear All Sounds?</h3>
            <p className="text-[12px] text-[#8e95a5] leading-relaxed">
              This will remove all <strong className="text-white font-semibold">{soundCount} sounds</strong> from your library.
              Files will be moved to the archive folder so you can restore them if needed.
            </p>

            {/* Export Backup Option Box */}
            <div className="mt-3 p-3.5 rounded-xl bg-[#151B25] border border-[#1B222E] flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-semibold text-white">Export backup first?</span>
                <span className="text-[11px] text-[#5a687c]">Save a complete .prism backup file</span>
              </div>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 ${
                  hasExported
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                    : 'bg-[#123244] border border-[#31C5F4]/40 text-[#31C5F4] hover:bg-[#31C5F4] hover:text-[#090B10]'
                }`}
              >
                {hasExported ? (
                  <>
                    <Check size={13} />
                    <span>Backup Saved</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud size={13} />
                    <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#090B10] border-t border-[#1B222E] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-medium text-[#8e95a5] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmClear();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            <span>Clear All ({soundCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
