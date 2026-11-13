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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-md bg-[#0E121A] border border-[#1B222E] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#151B25] flex items-center justify-between bg-[#0A0D14]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#123244] border border-[#31C5F4]/40 text-[#31C5F4]"
            >
              <Keyboard size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white tracking-wide">Record Global Hotkey</h2>
              <p className="text-[11px] text-[#5a687c] truncate max-w-[240px]">{title}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8e95a5] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Key Press Canvas */}
        <div className="p-6 bg-[#0E121A] flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-[12px] text-[#8e95a5] leading-relaxed">
            Press any key or combination on your keyboard (e.g. <span className="font-mono text-white bg-[#151B25] px-1.5 py-0.5 rounded border border-[#1B222E]">Num 1</span>, <span className="font-mono text-white bg-[#151B25] px-1.5 py-0.5 rounded border border-[#1B222E]">Ctrl+F1</span>, <span className="font-mono text-white bg-[#151B25] px-1.5 py-0.5 rounded border border-[#1B222E]">F5</span>):
          </p>

          <div
            className={`w-full py-7 px-4 rounded-xl flex items-center justify-center transition-colors border-2 ${
              recordedKey
                ? 'bg-[#123244]/30 border-[#31C5F4]'
                : 'bg-[#090C12] border-[#1B222E]'
            }`}
          >
            {recordedKey ? (
              <span className="text-[20px] font-mono font-extrabold text-[#31C5F4] tracking-wider px-4 py-1.5 rounded-lg bg-[#123244] border border-[#31C5F4]/40 shadow-sm">
                {recordedKey}
              </span>
            ) : (
              <span className="text-[13px] font-semibold text-[#5a687c] animate-pulse">
                Listening for keypress...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {recordedKey && (
              <button
                onClick={() => setRecordedKey('')}
                className="text-[11px] font-semibold text-[#8e95a5] hover:text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Clear Hotkey</span>
              </button>
            )}
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
            onClick={() => {
              onSave(recordedKey);
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-[12px] font-bold bg-[#31C5F4] text-[#090C12] hover:brightness-110 flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <Check size={14} strokeWidth={2.5} />
            <span>Save Hotkey</span>
          </button>
        </div>
      </div>
    </div>
  );
};
