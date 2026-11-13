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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/70 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shadow-sm">
              <Trash2 size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide">
                Move Sound to Archive?
              </h3>
              <p className="text-[11px] text-[#5A687C]">
                Sound is safely preserved in your deleted archive
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
          {/* Sound Card */}
          <div className="p-4 bg-[#10141C] border border-[#1B222E] rounded-2xl flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#151B25] border border-[#1B222E] flex-shrink-0 flex items-center justify-center">
              {sound.thumbnail ? (
                <img src={sound.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Volume2 size={20} className="text-[#31C5F4]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13.5px] font-bold text-white truncate leading-snug">
                {sound.title}
              </h4>
              <p className="text-[11.5px] text-[#5A687C] truncate mt-0.5">
                {sound.author || 'Sound file'} • {Math.round(sound.duration || 0)}s
              </p>
            </div>
          </div>

          {/* Explanation notice */}
          <div className="p-4 bg-[#151B25]/50 border border-[#1B222E] rounded-2xl flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#31C5F4]/10 border border-[#31C5F4]/20 text-[#31C5F4] flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldCheck size={14} />
            </div>
            <p className="text-[11.5px] text-[#8E95A5] leading-relaxed">
              The sound file will not be permanently deleted from your computer. It is safely moved to your <span className="text-white font-semibold">/deleted</span> archive folder and can be restored anytime from Settings or the Archive menu.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <span className="text-[11px] text-[#5A687C]">
            Can be recovered anytime from Archive
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
              onClick={onConfirm}
              className="px-5 py-2 rounded-xl text-[12px] font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span>Move to Deleted</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
