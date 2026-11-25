import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, Volume2, X } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface VBCableSetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
  accentColor?: string;
}

export const VBCableSetupModal: React.FC<VBCableSetupModalProps> = ({
  isOpen,
  onComplete,
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDetected, setIsDetected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const checkStatus = async () => {
    setIsVerifying(true);
    setErrorMessage('');
    try {
      let installed = false;
      if (window.soundboardAPI?.checkVirtualDriverInstalled) {
        installed = await window.soundboardAPI.checkVirtualDriverInstalled();
      }

      const cableId = await audioEngine.findCableInputDeviceId();
      if (installed || !!cableId) {
        setIsDetected(true);
        setTimeout(() => {
          onComplete();
        }, 1200);
      } else {
        setIsDetected(false);
      }
    } catch (err: any) {
      console.warn('Driver check error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      const interval = setInterval(() => {
        checkStatus();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleRunInstaller = async () => {
    setIsInstalling(true);
    setErrorMessage('');
    try {
      if (window.soundboardAPI?.installVirtualDriver) {
        const res = await window.soundboardAPI.installVirtualDriver();
        if (!res) {
          setErrorMessage('Could not launch installer. Please ensure administrator privileges.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error launching setup executable.');
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] frosted-backdrop bg-black/35 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight">
              Virtual audio cable setup
            </h3>
            <p className="text-[11px] text-slate-400">
              Enables in-game and Discord voice chat projection
            </p>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-transparent">
          {/* Status Indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDetected ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : isVerifying ? (
                <RefreshCw size={18} className="text-accent animate-spin shrink-0" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400 shrink-0" />
              )}
              <div>
                <span className="text-[13px] font-medium text-white">
                  {isDetected
                    ? 'Virtual audio cable active'
                    : 'Driver not detected'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {isDetected
                    ? 'Ready for Discord, TeamSpeak, and in-game voice chat'
                    : 'Run the setup installer to install the virtual driver'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={checkStatus}
              disabled={isVerifying}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Re-check driver status"
            >
              <RefreshCw size={13} className={isVerifying ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Explanation */}
          <p className="pt-3.5 border-t border-white/[0.07] text-[11.5px] text-slate-300 leading-relaxed">
            Windows needs a virtual audio pipe to pass soundboard audio directly into Discord, Steam, and game microphones without loop feedback.
          </p>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px]">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-end gap-3 frosted-modal-chrome shrink-0">
          <button
            type="button"
            onClick={onComplete}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleRunInstaller}
            disabled={isInstalling || isDetected}
            className="px-5 py-2 rounded-xl text-[12px] font-bold text-slate-950 bg-accent hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={13} />
            <span>{isInstalling ? 'Launching setup...' : isDetected ? 'Installed' : 'Install driver'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
