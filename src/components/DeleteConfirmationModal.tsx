import React from 'react';
import { Trash2, Undo2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#161822] border border-[#2a3040] rounded-[16px] shadow-2xl overflow-hidden">
        <div className="p-5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#ff3b30]/15 text-[#ff3b30] flex items-center justify-center flex-shrink-0">
            <Trash2 size={20} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-white leading-tight">Move Sound to 'deleted'?</h3>
            <p className="text-[12px] font-semibold mt-1 truncate" style={{ color: 'var(--accent-color, #8b5cf6)' }}>{sound.title}</p>
            <p className="text-[11.5px] text-[#8a92a6] mt-2 leading-relaxed">
              The sound file will be moved into a dedicated <code className="bg-black/40 px-1 py-0.5 rounded font-mono" style={{ color: 'var(--accent-color, #8b5cf6)' }}>deleted</code> folder. You can browse and restore it anytime from the <strong className="text-white">Deleted</strong> tab or File Explorer.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 bg-[#111319] border-t border-[#222736] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-[#8a92a6] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-[8px] text-[12px] font-bold text-white bg-[#ff3b30] hover:bg-[#e03126] shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Move to Deleted</span>
          </button>
        </div>
      </div>
    </div>
  );
};

