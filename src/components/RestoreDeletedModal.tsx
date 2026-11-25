import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Trash2,
  Undo2,
  FolderOpen,
  Search,
  Play,
  Square,
  Volume2,
} from 'lucide-react';
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
  onClose,
  onRestore,
  onPermanentlyDelete,
  onOpenDeletedFolder,
}) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'recent' | 'long'>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTogglePreview = (sound: SoundItem) => {
    if (previewingId === sound.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPreviewingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    let src = sound.audioData || sound.audioPath;
    if (!src) return;

    if (
      !src.startsWith('data:') &&
      !src.startsWith('http://') &&
      !src.startsWith('https://') &&
      !src.startsWith('file://')
    ) {
      src = 'file:///' + src.replace(/\\/g, '/');
    }

    const audio = new Audio(src);
    audio.onended = () => {
      setPreviewingId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPreviewingId(null);
      audioRef.current = null;
    };

    audio.play().then(() => {
      setPreviewingId(sound.id);
      audioRef.current = audio;
    }).catch(console.warn);
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewingId(null);
    onClose();
  };

  const filtered = deletedSounds.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      s.title.toLowerCase().includes(q) ||
      (s.author && s.author.toLowerCase().includes(q));
    if (!matchesSearch) return false;

    if (filterTab === 'recent') {
      if (!s.deletedAt) return true;
      const daysOld = (Date.now() - new Date(s.deletedAt).getTime()) / (1000 * 3600 * 24);
      return daysOld <= 7;
    }
    if (filterTab === 'long') {
      return (s.duration || 0) >= 5;
    }
    return true;
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden h-[600px] max-h-[90vh]"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight flex items-center gap-2">
              <span>Deleted sounds archive</span>
              <span className="text-[12px] font-normal text-slate-400 tabular-nums">
                ({deletedSounds.length})
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Restore previously removed sounds back to your soundboard
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenDeletedFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-[11.5px] font-medium transition-colors cursor-pointer"
              title="Open /deleted folder in Windows Explorer"
            >
              <FolderOpen size={13} className="text-accent" />
              <span>Open folder</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-white/[0.07] flex items-center gap-4 shrink-0">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter deleted sounds..."
              className="w-full pl-8 pr-7 py-1.5 bg-white/[0.04] border border-white/[0.08] focus:border-accent rounded-lg text-[12px] text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11.5px]">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`py-1 border-b-2 transition-colors cursor-pointer ${
                filterTab === 'all'
                  ? 'border-accent text-white font-medium'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('recent')}
              className={`py-1 border-b-2 transition-colors cursor-pointer ${
                filterTab === 'recent'
                  ? 'border-accent text-white font-medium'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Recent
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 divide-y divide-white/[0.06] bg-transparent">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-[12.5px] font-medium">
              No sounds in archive.
            </div>
          ) : (
            filtered.map((sound) => {
              const isPreviewing = previewingId === sound.id;

              return (
                <div
                  key={sound.id}
                  className="px-2.5 py-2.5 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(sound)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        isPreviewing
                          ? 'bg-accent/20 text-accent'
                          : 'bg-white/[0.05] text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {isPreviewing ? <Square size={11} className="fill-current" /> : <Play size={11} className="fill-current ml-0.5" />}
                    </button>

                    <div className="min-w-0">
                      <h4 className="text-[12.5px] font-medium text-white truncate" title={sound.title}>
                        {sound.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate tabular-nums">
                        {sound.author || 'Sound'} · {Math.round(sound.duration || 0)}s
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRestore(sound.id)}
                      className="px-2.5 py-1 rounded-md text-accent hover:bg-accent/15 text-[11.5px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Undo2 size={11} />
                      <span>Restore</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPermanentlyDelete(sound.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Permanently delete file"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <span className="text-[11.5px] text-slate-400">
            Restored files return to their original order
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 rounded-xl text-[12px] font-bold text-slate-950 bg-accent hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
