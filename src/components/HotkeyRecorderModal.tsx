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
  accentColor = 'var(--accent-color)',
  onClose,
  onSave,
}) => {
  const [recordedKey, setRecordedKey] = useState<string>(currentHotkey || '');
  const accent = accentColor || 'var(--accent-color)';

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
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden transition-all duration-150"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight">
              Record Global Hotkey
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-sm">
              {title || 'Assign keyboard key or combination'}
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

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-transparent">
          {/* Key Capture Area */}
          <div className="flex flex-col items-center justify-center gap-3">
            <span className="text-[11.5px] font-medium text-slate-400">
              Press any key or combination on your keyboard
            </span>

            <div
              className="w-full py-5 px-4 bg-white/[0.04] border border-white/[0.1] rounded-xl flex items-center justify-center gap-2 text-center"
              style={{
                borderColor: recordedKey ? `${accent}60` : undefined,
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
                <span className="text-[14px] font-semibold text-theme-muted animate-pulse">
                  Listening for keypress...
                </span>
              )}
            </div>

            {recordedKey && (
              <button
                type="button"
                onClick={() => setRecordedKey('')}
                className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1.5 pt-0.5"
              >
                <Trash2 size={12} />
                <span>Clear keybind</span>
              </button>
            )}
          </div>

          {/* Tips Line */}
          <p className="pt-3.5 border-t border-white/[0.07] text-[11.5px] text-slate-400 leading-relaxed">
            Supports standard keys (<code className="text-slate-200 font-mono">F1-F12</code>, <code className="text-slate-200 font-mono">1-9</code>, <code className="text-slate-200 font-mono">A-Z</code>), Numpad keys (<code className="text-slate-200 font-mono">Num 1-9</code>), and modifier combinations (<code className="text-slate-200 font-mono">Ctrl+Alt+1</code>).
          </p>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-between frosted-modal-chrome bg-white/[0.025] shrink-0">
          <span className="text-[11px] text-theme-muted">
            Triggers sound instantly even inside games
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
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
              }}
              className="px-5 py-2 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
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
