import React, { useState, useEffect } from 'react';
import { X, Edit2, Image, Trash2, Volume2, Check } from 'lucide-react';
import { SoundItem } from '../types';

interface EditSoundModalProps {
  sound: SoundItem | null;
  isOpen: boolean;
  onClose: () => void;
  accentColor?: string;
  onSave: (updated: SoundItem) => void;
}

export const EditSoundModal: React.FC<EditSoundModalProps> = ({
  sound,
  isOpen,
  onClose,
  accentColor = 'var(--accent-color)',
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  const accent = accentColor || 'var(--accent-color)';

  useEffect(() => {
    if (sound) {
      setTitle(sound.title);
      setAuthor(sound.author || '');
      setThumbnail(sound.thumbnail || '');
    }
  }, [sound, isOpen]);

  if (!isOpen || !sound) return null;

  const handlePickImage = async () => {
    if (window.soundboardAPI) {
      const base64 = await window.soundboardAPI.selectImageFile();
      if (base64) {
        setThumbnail(base64);
      }
    }
  };

  const handleSave = () => {
    onSave({
      ...sound,
      title: title.trim() || sound.title,
      author: author.trim() || sound.author,
      thumbnail: thumbnail,
    });
    onClose();
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
            <h3 className="text-[15px] font-bold text-white tracking-tight">
              Edit sound details
            </h3>
            <p className="text-[11px] text-slate-400">
              Update metadata and cover artwork
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Form Body */}
        <div className="p-6 space-y-5 bg-transparent">
          {/* Artwork Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/[0.1] bg-white/[0.05] shrink-0 flex items-center justify-center">
                {thumbnail ? (
                  <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Volume2 size={20} className="text-accent opacity-75" />
                )}
              </div>
              <div>
                <h4 className="text-[12.5px] font-medium text-white">Cover artwork</h4>
                <p className="text-[11px] text-slate-400">
                  PNG, JPG, or GIF image
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickImage}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11.5px] font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Image size={13} className="text-accent" />
                <span>{thumbnail ? 'Change' : 'Upload'}</span>
              </button>
              {thumbnail && (
                <button
                  type="button"
                  onClick={() => setThumbnail('')}
                  title="Remove artwork"
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Details Fields */}
          <div className="pt-4 border-t border-white/[0.07] space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Sound title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sound name"
                className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] focus:border-accent rounded-xl text-[12.5px] text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Author / Source
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Creator or origin (optional)"
                className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] focus:border-accent rounded-xl text-[12.5px] text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
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
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-slate-950 bg-accent hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <Check size={13} strokeWidth={2.5} />
            <span>Save changes</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
