import React, { useState, useEffect } from 'react';
import { Keyboard, X, Check, Trash2 } from 'lucide-react';

interface HotkeyRecorderModalProps {
  isOpen: boolean;
  title: string;
  currentHotkey: string;
  accentColor?: string;
  onClose: () => void;
  onSave: (hotkey: string) => void;
}

export const HotkeyRecorderModal: React.FC<HotkeyRecorderModalProps> = ({
  isOpen,
  title,
  currentHotkey,
  accentColor = '#31C5F4',
  onClose,
  onSave,
}) => {
  const [recordedKey, setRecordedKey] = useState<string>(currentHotkey || '');
  const accent = accentColor || '#31C5F4';

  useEffect(() => {
    setRecordedKey(currentHotkey || '');
  }, [currentHotkey, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't record standalone modifier presses
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Win');

      let key = e.key;

      // Handle Numpad codes
      if (e.code.startsWith('Numpad')) {
        const num = e.code.replace('Numpad', '');
        if (num === 'Multiply') key = 'NumMult';
        else if (num === 'Add') key = 'NumAdd';
        else if (num === 'Subtract') key = 'NumSub';
        else if (num === 'Decimal') key = 'NumDec';
        else if (num === 'Divide') key = 'NumDiv';
        else key = `Num ${num}`;
      } else if (key === 'Escape') {
        key = 'Escape';
      } else if (key === ' ') {
        key = 'Space';
      } else if (key.length === 1) {
        key = key.toUpperCase();
      }

      parts.push(key);
      const combo = parts.join('+');
      setRecordedKey(combo);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/70 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: `${accent}15`,
                borderColor: `${accent}35`,
                color: accent,
              }}
            >
              <Keyboard size={15} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide">
                Record Global Hotkey
              </h3>
              <p className="text-[11px] text-[#5A687C] truncate max-w-sm">
                {title || 'Assign keyboard key or combination'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-[#0B0E14]">
          {/* Key Capture Card */}
          <div className="p-6 bg-[#10141C] border border-[#1B222E] rounded-2xl flex flex-col items-center justify-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A687C]">
              Press any key on your keyboard
            </span>

            <div
              className="w-full py-5 px-4 bg-[#151B25] border rounded-2xl flex items-center justify-center gap-2 text-center"
              style={{
                borderColor: recordedKey ? `${accent}60` : '#1B222E',
              }}
            >
              {recordedKey ? (
                <span
                  className="font-mono text-2xl font-black tracking-wider"
                  style={{ color: accent }}
                >
                  {recordedKey}
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-[#5A687C] animate-pulse">
                  Listening for keypress...
                </span>
              )}
            </div>

            {recordedKey && (
              <button
                type="button"
                onClick={() => setRecordedKey('')}
                className="text-[11px] font-bold text-[#8E95A5] hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1.5 pt-1"
              >
                <Trash2 size={12} />
                <span>Clear Keybind</span>
              </button>
            )}
          </div>

          {/* Tips Card */}
          <div className="p-4 bg-[#151B25]/50 border border-[#1B222E] rounded-2xl text-[11.5px] text-[#8E95A5] leading-relaxed">
            Supports standard keys (<code className="text-white font-mono">F1-F12</code>, <code className="text-white font-mono">1-9</code>, <code className="text-white font-mono">A-Z</code>), Numpad keys (<code className="text-white font-mono">Num 1-9</code>), and modifier combinations (<code className="text-white font-mono">Ctrl+Alt+1</code>).
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <span className="text-[11px] text-[#5A687C]">
            Triggers sound instantly even inside games
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[#8E95A5] hover:text-white bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(recordedKey);
                onClose();
              }}
              style={{
                backgroundColor: accent,
                color: '#090C12',
              }}
              className="px-5 py-2 rounded-xl text-[12px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Check size={14} className="stroke-[2.5]" />
              <span>Save Keybind</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
