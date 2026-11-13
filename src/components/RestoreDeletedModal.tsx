import React, { useState } from 'react';
import { X, Trash2, Undo2, FolderOpen } from 'lucide-react';
import { SoundItem } from '../types';

interface RestoreDeletedModalProps {
  isOpen: boolean;
  deletedSounds: SoundItem[];
  accentColor?: string;
  onClose: () => void;
  onRestore: (soundId: string) => void;
  onPermanentlyDelete: (soundId: string) => void;
  onOpenDeletedFolder: () => void;
}

export const RestoreDeletedModal: React.FC<RestoreDeletedModalProps> = ({
  isOpen,
  deletedSounds,
  accentColor = '#31C5F4',
  onClose,
  onRestore,
  onPermanentlyDelete,
  onOpenDeletedFolder,
}) => {
  const accent = accentColor || '#31C5F4';
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = deletedSounds.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.author && s.author.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-xl bg-[#0E121A] border border-[#1B222E] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#151B25] flex items-center justify-between bg-[#0A0D14]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
              <Trash2 size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white tracking-wide flex items-center gap-2">
                <span>Deleted Sounds Archive</span>
                <span
                  className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#123244] border border-[#31C5F4]/30 text-[#31C5F4]"
                >
                  {deletedSounds.length} {deletedSounds.length === 1 ? 'sound' : 'sounds'}
                </span>
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenDeletedFolder}
              title="Open the 'deleted' folder on your computer"
              className="px-3 py-1.5 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 text-[#8e95a5] hover:text-white text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FolderOpen size={13} style={{ color: accent }} />
              <span>Open Folder</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Subheader / Search */}
        <div className="p-4 border-b border-[#151B25] bg-[#0E121A]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deleted sounds..."
            className="w-full px-3.5 py-2.5 bg-[#121722] border border-[#1B222E] rounded-xl text-[12.5px] text-white placeholder-[#5a687c] focus:outline-none focus:border-[#31C5F4] transition-colors"
          />
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[420px] bg-[#0E121A]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[#5a687c] text-[12px]">
              {deletedSounds.length === 0
                ? "No deleted sounds. When you delete a sound from the board, it is safely preserved here where it can be restored."
                : "No deleted sounds matched your search."}
            </div>
          ) : (
            filtered.map((sound) => (
              <div
                key={sound.id}
                className="p-3 bg-[#121722] border border-[#1B222E] hover:border-[#31C5F4]/40 rounded-xl flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{sound.title}</div>
                  <div className="text-[11px] text-[#5a687c] truncate mt-0.5">
                    {sound.author || 'Sound file'} • {Math.round(sound.duration || 0)}s
                    {sound.deletedAt && (
                      <span className="ml-2 font-mono text-[10px] text-[#5a687c]/70">
                        Deleted {new Date(sound.deletedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onRestore(sound.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#123244] border border-[#31C5F4]/40 text-[#31C5F4] hover:bg-[#31C5F4] hover:text-[#090C12] text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Undo2 size={13} />
                    <span>Restore</span>
                  </button>

                  <button
                    onClick={() => onPermanentlyDelete(sound.id)}
                    title="Permanently remove file from computer"
                    className="p-1.5 rounded-lg bg-[#151B25] border border-[#1B222E] hover:border-red-500/50 text-[#8e95a5] hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
