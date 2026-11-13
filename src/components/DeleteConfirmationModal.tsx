import React from 'react';
import { Trash2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-[#0E121A] border border-[#1B222E] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
            <Trash2 size={20} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-white leading-tight">Move Sound to 'deleted'?</h3>
            <p className="text-[12.5px] font-semibold text-[#31C5F4] mt-1 truncate">{sound.title}</p>
            <p className="text-[11.5px] text-[#8e95a5] mt-2.5 leading-relaxed">
              The sound file will be preserved in your dedicated <code className="bg-[#151B25] px-1.5 py-0.5 rounded text-[#31C5F4] font-mono border border-[#1B222E]">deleted</code> folder. You can browse and restore it anytime from the <strong className="text-white">Deleted</strong> archive.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#0A0D14] border-t border-[#151B25] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-[#8e95a5] hover:text-white hover:bg-[#151B25] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Trash2 size={13} />
            <span>Move to Deleted</span>
          </button>
        </div>
      </div>
    </div>
  );
};
