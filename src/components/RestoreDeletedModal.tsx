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
  Clock,
  Layers,
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
  accentColor = 'var(--accent-color)',
  onClose,
  onRestore,
  onPermanentlyDelete,
  onOpenDeletedFolder,
}) => {
  const accent = accentColor || 'var(--accent-color)';
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'recent' | 'long'>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio preview on close or unmount
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

  // Filter sounds
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-theme-surface border border-theme rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden h-[680px] max-h-[92vh] transition-all duration-150"
      >
        {/* Top Header */}
        <header className="h-16 px-6 border-b border-theme flex items-center justify-between bg-theme-header/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: `${accent}15`,
                borderColor: `${accent}35`,
                color: accent,
              }}
            >
              <Trash2 size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-theme-primary tracking-wide flex items-center gap-2">
                <span>Deleted Sounds Archive</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-theme-card text-accent border border-theme">
                  {deletedSounds.length} {deletedSounds.length === 1 ? 'sound' : 'sounds'}
                </span>
              </h3>
              <p className="text-[11px] text-theme-muted">
                Browse, preview, and restore deleted sounds back into your soundboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenDeletedFolder}
              className="px-3 py-1.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme hover:border-accent/40 text-theme-secondary hover:text-white text-[11.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              title="Open 'deleted' folder on computer"
            >
              <FolderOpen size={13} style={{ color: accent }} />
              <span>Open Folder</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme text-theme-secondary hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close Archive (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Search & Filter Toolbar */}
        <div className="px-6 py-3.5 bg-theme-header border-b border-theme flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deleted sounds by title or creator..."
              className="w-full pl-9 pr-8 py-2 bg-theme-card border border-theme rounded-xl text-[12px] text-theme-primary placeholder-theme-muted focus:outline-none focus:border-accent/50 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-theme-card p-1 rounded-xl border border-theme shrink-0">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-theme-card-selected text-accent border border-accent/40 shadow-sm'
                  : 'text-theme-secondary hover:text-white'
              }`}
            >
              All ({deletedSounds.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('recent')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'recent'
                  ? 'bg-theme-card-selected text-accent border border-accent/40 shadow-sm'
                  : 'text-theme-secondary hover:text-white'
              }`}
            >
              <Clock size={11} />
              <span>Recent</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('long')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'long'
                  ? 'bg-theme-card-selected text-accent border border-accent/40 shadow-sm'
                  : 'text-theme-secondary hover:text-white'
              }`}
            >
              <Layers size={11} />
              <span>Clips (≥ 5s)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Deleted Sounds List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 bg-theme-surface">
          {filtered.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-theme-card border border-theme flex items-center justify-center text-theme-muted">
                <Trash2 size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-[14px] font-bold text-theme-primary">No Deleted Sounds Found</h4>
                <p className="text-[12px] text-theme-muted max-w-sm">
                  {deletedSounds.length === 0
                    ? 'When you delete a sound from your soundboard, it is safely stored here where it can be recovered anytime.'
                    : 'No deleted sounds matched your current search or filter query.'}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((sound) => {
              const isThisPreviewing = previewingId === sound.id;
              return (
                <div
                  key={sound.id}
                  className="p-3.5 bg-theme-sidebar border border-theme hover:border-accent/40 rounded-2xl flex items-center justify-between gap-4 transition-all shadow-sm group"
                >
                  {/* Left: Thumbnail & Play Preview Button */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-theme-card border border-theme flex-shrink-0 flex items-center justify-center">
                      {sound.thumbnail ? (
                        <img
                          src={sound.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Volume2 size={18} className="text-theme-muted" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleTogglePreview(sound)}
                        className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity cursor-pointer ${
                          isThisPreviewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title={isThisPreviewing ? 'Stop Preview' : 'Listen Preview'}
                      >
                        {isThisPreviewing ? (
                          <Square size={14} style={{ color: accent }} className="fill-current" />
                        ) : (
                          <Play size={14} className="text-white fill-current translate-x-0.5" />
                        )}
                      </button>
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-theme-primary truncate flex items-center gap-2">
                        <span>{sound.title}</span>
                        {isThisPreviewing && (
                          <span
                            className="text-[9.5px] font-mono px-2 py-0.2 rounded-full border"
                            style={{
                              color: accent,
                              borderColor: `${accent}40`,
                              backgroundColor: `${accent}15`,
                            }}
                          >
                            Playing
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-theme-muted flex items-center gap-2 mt-0.5">
                        <span>{sound.author || 'Sound file'}</span>
                        <span>•</span>
                        <span>{Math.round(sound.duration || 0)}s</span>
                        {sound.deletedAt && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10.5px]">
                              Deleted {new Date(sound.deletedAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (isThisPreviewing && audioRef.current) {
                          audioRef.current.pause();
                          setPreviewingId(null);
                        }
                        onRestore(sound.id);
                      }}
                      style={{
                        backgroundColor: `${accent}15`,
                        borderColor: `${accent}40`,
                        color: accent,
                      }}
                      className="px-3.5 py-1.5 rounded-xl border text-[11.5px] font-bold flex items-center gap-1.5 hover:brightness-125 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <Undo2 size={13} />
                      <span>Restore</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isThisPreviewing && audioRef.current) {
                          audioRef.current.pause();
                          setPreviewingId(null);
                        }
                        onPermanentlyDelete(sound.id);
                      }}
                      title="Permanently erase file from computer"
                      className="p-2 rounded-xl bg-theme-card hover:bg-red-500/15 border border-theme hover:border-red-500/40 text-theme-secondary hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-theme flex items-center justify-between bg-theme-header shrink-0">
          <div className="flex items-center gap-2 text-[11.5px] text-theme-muted">
            <span>{filtered.length} of {deletedSounds.length} sounds shown</span>
            <span>•</span>
            <span>Restored sounds return directly to your active library</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              backgroundColor: accent,
            }}
            className="px-6 py-2 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};
