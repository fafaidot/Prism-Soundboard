import React, { useState, useEffect, useCallback } from 'react';
import { Delete, Lock, ArrowRight, Wifi } from 'lucide-react';
import prismLogo from '../../assets/Prism.png';

interface PinGateProps {
  hostName: string;
  lockMessage?: string | null;
  savedName?: string;
  pinLengths?: number[];
  onClearSavedName?: () => void;
  onSubmitPin: (pin: string) => Promise<void>;
}

export const PinGate: React.FC<PinGateProps> = ({
  hostName,
  lockMessage,
  savedName,
  pinLengths = [4],
  onClearSavedName,
  onSubmitPin,
}) => {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(lockMessage || null);
  const [shaking, setShaking] = useState(false);

  const normalizedLengths = pinLengths.length > 0 ? pinLengths : [4];
  const maxPinLen = Math.min(6, Math.max(4, ...normalizedLengths));

  useEffect(() => {
    if (lockMessage) setError(lockMessage);
  }, [lockMessage]);

  const tryUnlock = useCallback(
    async (candidate: string) => {
      if (submitting || candidate.length < 4) return;
      setSubmitting(true);
      setError(null);
      try {
        await onSubmitPin(candidate);
      } catch (err: any) {
        setError(err?.message || 'Incorrect PIN');
        setShaking(true);
        navigator.vibrate?.([30, 40, 30]);
        setTimeout(() => {
          setShaking(false);
          setPin('');
        }, 380);
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmitPin, submitting]
  );

  const pressDigit = useCallback(
    (d: string) => {
      if (submitting || pin.length >= maxPinLen) return;
      navigator.vibrate?.(10);
      setError(null);
      const next = pin + d;
      setPin(next);
      // Automatically submit once the expected PIN length is reached
      if (
        (normalizedLengths.length === 1 && next.length === normalizedLengths[0]) ||
        (normalizedLengths.length > 1 && next.length === maxPinLen)
      ) {
        tryUnlock(next);
      }
    },
    [maxPinLen, normalizedLengths, pin, submitting, tryUnlock]
  );

  const handleBackspace = useCallback(() => {
    if (submitting || pin.length === 0) return;
    navigator.vibrate?.(8);
    setPin((p) => p.slice(0, -1));
  }, [pin.length, submitting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && pin.length >= 4) {
        tryUnlock(pin);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleBackspace, pin, pressDigit, submitting, tryUnlock]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090e] flex flex-col items-center justify-between px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] select-none relative overflow-hidden">
      {/* Subtle studio ambient glow */}
      <div
        className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-[110px] opacity-25"
        style={{ background: 'var(--accent)' }}
      />

      {/* Top Host Header */}
      <div className="w-full max-w-sm flex items-center justify-between pt-1 relative z-10">
        <div className="flex items-center gap-2.5">
          <img src={prismLogo} alt="Prism" className="w-6 h-6 object-contain" />
          <span className="text-[15px] font-bold tracking-tight text-white">Prism Deck</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.09] text-[11px] font-medium text-slate-300">
          <Wifi size={12} className="text-sky-400" />
          <span className="max-w-[130px] truncate">{hostName || 'Studio PC'}</span>
        </div>
      </div>

      {/* PIN Display */}
      <div className="w-full max-w-xs flex flex-col items-center gap-4 my-auto relative z-10">
        <div className="w-11 h-11 rounded-2xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-sky-400">
          <Lock size={19} />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-[20px] font-bold tracking-tight text-white">Enter PIN to connect</h1>
          <p className="text-[12.5px] text-slate-400">
            Enter the Owner or Friend PIN from Prism Desktop
          </p>
          {savedName && (
            <div className="pt-1 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] text-slate-300">
                <span>
                  Name: <strong className="text-white">{savedName}</strong>
                </span>
                {onClearSavedName && (
                  <button
                    type="button"
                    onClick={onClearSavedName}
                    style={{ color: 'var(--accent)' }}
                    className="font-semibold hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                )}
              </span>
            </div>
          )}
        </div>

        {/* PIN Slots */}
        <div className={`flex items-center justify-center gap-3 py-2 ${shaking ? 'animate-pin-shake' : ''}`}>
          {Array.from({ length: Math.max(4, maxPinLen) }, (_, idx) => {
            const filled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-11 h-13 rounded-xl border flex items-center justify-center font-mono-tabular text-[22px] font-bold transition-all ${
                  filled
                    ? 'bg-white/[0.1] border-sky-400/70 text-white shadow-[0_0_20px_rgba(56,189,248,0.18)]'
                    : 'bg-white/[0.03] border-white/[0.1] text-slate-600'
                }`}
              >
                {filled ? '•' : ''}
              </div>
            );
          })}
        </div>

        {/* Feedback */}
        <div className="h-5 flex items-center justify-center">
          {error && <span className="text-[12.5px] font-semibold text-rose-400">{error}</span>}
        </div>

        {/* Numeric Keypad */}
        <div className="w-full grid grid-cols-3 gap-3 pt-1">
          {digits.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pressDigit(d)}
              className="h-15 rounded-2xl bg-white/[0.05] active:bg-white/[0.16] border border-white/[0.09] text-[22px] font-semibold text-white transition-transform active:scale-95 cursor-pointer"
            >
              {d}
            </button>
          ))}

          <button
            type="button"
            onClick={handleBackspace}
            disabled={pin.length === 0 || submitting}
            aria-label="Delete digit"
            className="h-15 rounded-2xl bg-white/[0.03] active:bg-white/[0.12] border border-white/[0.07] text-slate-300 flex items-center justify-center disabled:opacity-35 active:scale-95 transition-transform cursor-pointer"
          >
            <Delete size={20} />
          </button>

          <button
            type="button"
            onClick={() => pressDigit('0')}
            className="h-15 rounded-2xl bg-white/[0.05] active:bg-white/[0.16] border border-white/[0.09] text-[22px] font-semibold text-white transition-transform active:scale-95 cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={() => tryUnlock(pin)}
            disabled={pin.length < 4 || submitting}
            aria-label="Unlock"
            style={{ backgroundColor: pin.length >= 4 ? 'var(--accent)' : undefined }}
            className={`h-15 rounded-2xl border flex items-center justify-center font-bold transition-all active:scale-95 cursor-pointer ${
              pin.length >= 4
                ? 'border-transparent text-slate-950 shadow-lg'
                : 'bg-white/[0.03] border-white/[0.07] text-slate-500 opacity-50'
            }`}
          >
            {submitting ? (
              <span className="w-5 h-5 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
            ) : (
              <ArrowRight size={22} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 relative z-10">
        PIN required on every connection
      </p>
    </div>
  );
};
