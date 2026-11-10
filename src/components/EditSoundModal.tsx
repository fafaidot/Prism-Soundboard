import React, { useState, useEffect } from 'react';
import { X, Edit2, Image, Check, Volume2 } from 'lucide-react';
import { SoundItem } from '../types';

interface EditSoundModalProps {
  sound: SoundItem | null;
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  onSave: (updated: SoundItem) => void;
}

export const EditSoundModal: React.FC<EditSoundModalProps> = ({
  sound,
  isOpen,
  onClose,
  accentColor,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [thumbnail, setThumbnail] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#202020] border border-[#383838] rounded-[16px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: accentColor }}
            >
              <Edit2 size={14} />
            </div>
            <h2 className="text-[14px] font-bold text-white">Edit Sound Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#888888] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-[#1a1a1a]">
          {/* Artwork & Pick image */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-[10px] overflow-hidden border border-[#383838] bg-black flex-shrink-0">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#252525]">
                  <Volume2 size={24} className="text-white/40" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePickImage}
              className="px-3 py-2 rounded-[8px] bg-white/10 hover:bg-white/20 text-[12px] font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <Image size={14} />
              <span>Change Artwork</span>
            </button>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#aaaaaa]">Sound Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#262626] border border-[#383838] rounded-[8px] text-[13px] text-white focus:outline-none focus:border-white/40"
            />
          </div>

          {/* Author */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#aaaaaa]">Author / Channel</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. @LevelFun, Soundboard, Movie"
              className="w-full px-3 py-2 bg-[#262626] border border-[#383838] rounded-[8px] text-[13px] text-white focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#181818] border-t border-[#2a2a2a] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-[#cccccc] hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-[8px] text-[12px] font-bold text-white flex items-center gap-1.5 shadow-lg transition-all"
            style={{ backgroundColor: accentColor }}
          >
            <Check size={14} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};

