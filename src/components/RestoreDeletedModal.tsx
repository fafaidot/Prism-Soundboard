import React, { useState } from 'react';
import { X, Trash2, Undo2, FolderOpen, AlertTriangle } from 'lucide-react';
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
  accentColor,
  onClose,
  onRestore,
  onPermanentlyDelete,
  onOpenDeletedFolder,
}) => {
  const accent = accentColor || 'var(--accent-color, #8b5cf6)';
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = deletedSounds.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-xl bg-[#14161c] border border-[#262a36] rounded-[18px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222530] flex items-center justify-between bg-[#111317]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#ff3b30]/15 text-[#ff3b30] flex items-center justify-center">
              <Trash2 size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white tracking-wide flex items-center gap-2">
                <span>Deleted Sounds Archive</span>
                <span
                  style={{ color: accent }}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10"
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
              className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 border border-white/10 text-[#a0a8ba] hover:text-white text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FolderOpen size={12} style={{ color: accent }} />
              <span>Open Folder</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#7e8697] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Subheader / Search */}
        <div className="p-4 border-b border-[#222530] bg-[#12141a]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deleted sounds..."
            className="w-full px-3.5 py-2 bg-[#171a23] border border-[#272d3e] focus:border-[var(--accent-color,#8b5cf6)]/70 rounded-[10px] text-[12px] text-white placeholder-[#687084] focus:outline-none transition-all"
          />
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[420px]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[#687084] text-[12px]">
              {deletedSounds.length === 0
                ? "No deleted sounds. When you delete a sound from the board, it is safely preserved here where it can be restored."
                : "No deleted sounds matched your search."}
            </div>
          ) : (
            filtered.map((sound) => (
              <div
                key={sound.id}
                className="p-3 bg-[#171a23] border border-[#272d3e] hover:border-[#384158] rounded-[12px] flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{sound.title}</div>
                  <div className="text-[11px] text-[#788194] truncate">
                    {sound.author || 'Sound file'} • {Math.round(sound.duration || 0)}s
                    {sound.deletedAt && (
                      <span className="ml-2 font-mono text-[10px] text-[#555d6e]">
                        Deleted {new Date(sound.deletedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onRestore(sound.id)}
                    style={{
                      backgroundColor: `${accent}20`,
                      borderColor: `${accent}40`,
                      color: accent,
                    }}
                    className="px-3 py-1.5 rounded-[8px] hover:brightness-125 text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Undo2 size={13} />
                    <span>Restore</span>
                  </button>
                  <button
                    onClick={() => onPermanentlyDelete(sound.id)}
                    title="Permanently delete audio file from disk"
                    className="p-1.5 rounded-[8px] bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#222530] flex items-center justify-between bg-[#111317]">
          <span className="text-[11px] text-[#6d7587]">
            Restoring puts the sound back on your board with all original settings.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-white bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

