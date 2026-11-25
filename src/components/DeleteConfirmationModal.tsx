import React from 'react';
import { Trash2, X, Volume2, ShieldCheck } from 'lucide-react';
import { SoundItem } from '../types';

interface DeleteConfirmationModalProps {
  sound: SoundItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  sound,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !sound) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight">
              Archive sound
            </h3>
            <p className="text-[11px] text-slate-400">
              Safely preserved in your deleted archive
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
          {/* Sound Row */}
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-white/[0.05] border border-white/[0.1] shrink-0 flex items-center justify-center">
              {sound.thumbnail ? (
                <img src={sound.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Volume2 size={18} className="text-accent opacity-80" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-medium text-white truncate">
                {sound.title}
              </h4>
              <p className="text-[11px] text-slate-400 truncate tabular-nums">
                {sound.author || 'Sound file'} · {Math.round(sound.duration || 0)}s
              </p>
            </div>
          </div>

          {/* Explanation notice */}
          <div className="pt-3.5 border-t border-white/[0.07] flex items-start gap-2.5">
            <ShieldCheck size={14} className="text-accent shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-slate-300 leading-relaxed">
              This sound will be moved to your deleted archive. You can restore it anytime from Settings or the Archive drawer.
            </p>
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
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Move to archive</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
