import React, { useState, useEffect } from 'react';
import { X, Edit2, Image, Check, Volume2 } from 'lucide-react';
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
  accentColor = '#31C5F4',
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [thumbnail, setThumbnail] = useState('');

  const accent = accentColor || '#31C5F4';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-[#0E121A] border border-[#1B222E] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#151B25] flex items-center justify-between bg-[#0A0D14]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#123244] border border-[#31C5F4]/40 text-[#31C5F4]"
            >
              <Edit2 size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white tracking-wide">Edit Sound Details</h2>
              <p className="text-[11px] text-[#5a687c] truncate max-w-[240px]">{sound.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-[#0E121A]">
          {/* Artwork & Pick image */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#1B222E] bg-[#090C12] flex-shrink-0 flex items-center justify-center shadow-inner">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#090C12]">
                  <Volume2 size={24} className="text-[#31C5F4]/50" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePickImage}
              className="px-3.5 py-2 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 text-[12px] font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Image size={14} style={{ color: accent }} />
              <span>Change Artwork</span>
            </button>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#8e95a5] uppercase tracking-wider">Sound Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#121722] border border-[#1B222E] rounded-xl text-[13px] text-white placeholder-[#5a687c] focus:outline-none focus:border-[#31C5F4] transition-colors"
            />
          </div>

          {/* Author */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#8e95a5] uppercase tracking-wider">Author / Channel / Creator</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. @soundcreator, Memes, Movie"
              className="w-full px-3.5 py-2.5 bg-[#121722] border border-[#1B222E] rounded-xl text-[13px] text-white placeholder-[#5a687c] focus:outline-none focus:border-[#31C5F4] transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#0A0D14] border-t border-[#151B25] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-[#8e95a5] hover:text-white hover:bg-[#151B25] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-[12px] font-bold bg-[#31C5F4] text-[#090C12] hover:brightness-110 flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <Check size={14} strokeWidth={2.5} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
