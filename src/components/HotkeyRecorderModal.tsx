import React, { useState, useEffect } from 'react';
import { Keyboard, X, Check, Trash2 } from 'lucide-react';

interface HotkeyRecorderModalProps {
  isOpen: boolean;
  title: string;
  currentHotkey: string;
  accentColor: string;
  onClose: () => void;
  onSave: (hotkey: string) => void;
}

export const HotkeyRecorderModal: React.FC<HotkeyRecorderModalProps> = ({
  isOpen,
  title,
  currentHotkey,
  accentColor,
  onClose,
  onSave,
}) => {
  const [recordedKey, setRecordedKey] = useState<string>(currentHotkey || '');

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

      let key = e.key;

      // Handle Numpad codes
      if (e.code.startsWith('Numpad')) {
        const num = e.code.replace('Numpad', '');
        key = `Num ${num}`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#202020] border border-[#383838] rounded-[16px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2e2e2e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: accentColor }}
            >
              <Keyboard size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white">Record Global Hotkey</h2>
              <p className="text-[11px] text-[#888888] truncate max-w-[260px]">{title}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#888888] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Key Press Canvas */}
        <div className="p-6 bg-[#1a1a1a] flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-[12px] text-[#aaaaaa]">
            Press any key or combination on your keyboard (e.g. <span className="font-mono text-white">Num 1</span>, <span className="font-mono text-white">Ctrl+F1</span>, <span className="font-mono text-white">F5</span>):
          </p>

          <div
            className="w-full py-6 px-4 bg-[#141414] border-2 rounded-[12px] flex items-center justify-center shadow-inner"
            style={{
              borderColor: recordedKey ? accentColor : '#3e3e3e',
            }}
          >
            {recordedKey ? (
              <span className="text-[20px] font-mono font-extrabold text-white tracking-wide px-4 py-1.5 rounded-lg bg-white/10 border border-white/20">
                {recordedKey}
              </span>
            ) : (
              <span className="text-[14px] font-semibold text-[#666666] animate-pulse">
                Listening for keypress...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {recordedKey && (
              <button
                onClick={() => setRecordedKey('')}
                className="text-[11px] text-[#888888] hover:text-[#c42b1c] flex items-center gap-1 transition-colors"
              >
                <Trash2 size={12} />
                <span>Clear Hotkey</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#181818] border-t border-[#2a2a2a] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-[#cccccc] hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(recordedKey);
              onClose();
            }}
            className="px-5 py-2 rounded-[8px] text-[12px] font-bold text-white flex items-center gap-1.5 shadow-lg transition-all"
            style={{ backgroundColor: accentColor }}
          >
            <Check size={14} />
            <span>Save Hotkey</span>
          </button>
        </div>
      </div>
    </div>
  );
};

