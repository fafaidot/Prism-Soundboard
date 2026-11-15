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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-theme-surface border border-theme rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150"
      >
        {/* Header */}
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
              <Edit2 size={15} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-theme-primary tracking-wide">
                Edit Sound Details
              </h3>
              <p className="text-[11px] text-theme-muted truncate max-w-sm">
                Update sound metadata and cover artwork
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme text-theme-secondary hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-theme-surface">
          {/* Artwork Card */}
          <div className="p-5 bg-theme-sidebar border border-theme rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-theme bg-theme-card flex-shrink-0 flex items-center justify-center shadow-inner">
                {thumbnail ? (
                  <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Volume2 size={24} style={{ color: accent }} className="opacity-70" />
                )}
              </div>
              <div className="space-y-0.5">
                <h4 className="text-[13px] font-bold text-theme-primary">Cover Artwork</h4>
                <p className="text-[11px] text-theme-muted">
                  PNG, JPG, or GIF image for sound card
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickImage}
                className="px-3.5 py-2 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme hover:border-accent/40 text-[12px] font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Image size={14} style={{ color: accent }} />
                <span>{thumbnail ? 'Change' : 'Upload'}</span>
              </button>
              {thumbnail && (
                <button
                  type="button"
                  onClick={() => setThumbnail('')}
                  title="Remove artwork"
                  className="p-2 rounded-xl bg-theme-card hover:bg-red-500/15 border border-theme hover:border-red-500/40 text-theme-secondary hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Details Card */}
          <div className="p-5 bg-theme-sidebar border border-theme rounded-2xl space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">
                Sound Name / Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sound title..."
                className="w-full px-3.5 py-2.5 bg-theme-card border border-theme rounded-xl text-[12.5px] text-theme-primary placeholder-theme-muted focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">
                Artist / Channel (Optional)
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Artist, game, or channel name..."
                className="w-full px-3.5 py-2.5 bg-theme-card border border-theme rounded-xl text-[12.5px] text-theme-primary placeholder-theme-muted focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-theme flex items-center justify-between bg-theme-header shrink-0">
          <span className="text-[11px] text-theme-muted">
            Changes apply instantly to the soundboard
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-theme-secondary hover:text-white bg-theme-card hover:bg-theme-card-hover border border-theme transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                backgroundColor: accent,
              }}
              className="px-5 py-2 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Check size={14} className="stroke-[2.5]" />
              <span>Save Changes</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
