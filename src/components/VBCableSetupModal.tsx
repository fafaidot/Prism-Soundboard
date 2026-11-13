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
  accentColor = '#31C5F4',
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDetected, setIsDetected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const accent = accentColor || '#31C5F4';

  // Check driver status
  const checkStatus = async () => {
    setIsVerifying(true);
    setErrorMessage('');
    try {
      let installed = false;
      if (window.soundboardAPI?.checkVirtualDriverInstalled) {
        installed = await window.soundboardAPI.checkVirtualDriverInstalled();
      }

      // Also cross check if audio output "cable input" exists in browser media devices
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
      // Periodically poll every 3s in case user finished the installer in the background
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
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden transition-all duration-150">
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
              <Volume2 size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide">
                Virtual Audio Cable Setup
              </h3>
              <p className="text-[11px] text-[#5A687C]">
                Enables in-game and Discord voice chat projection
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onComplete}
            className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </header>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-[#0B0E14]">
          {/* Status Indicator Card */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
              isDetected
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-[#10141C] border-[#1B222E]'
            }`}
          >
            <div className="flex items-center gap-3">
              {isVerifying ? (
                <RefreshCw size={18} className="text-[#31C5F4] animate-spin" />
              ) : isDetected ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400" />
              )}
              <div>
                <h4 className="text-[13px] font-bold text-white">
                  {isVerifying
                    ? 'Verifying Audio Drivers...'
                    : isDetected
                    ? 'VB-CABLE Driver Detected & Active!'
                    : 'Driver Not Detected Yet'}
                </h4>
                <p className="text-[11px] text-[#5A687C]">
                  {isDetected
                    ? 'Prism audio projection pipeline is fully operational'
                    : 'Install the virtual audio pipe to bridge soundboard to games & Discord'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={checkStatus}
              disabled={isVerifying}
              className="px-3 py-1.5 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Steps Card */}
          <div className="p-5 bg-[#10141C] border border-[#1B222E] rounded-2xl space-y-3.5 text-[12px] leading-relaxed">
            <div className="flex items-start gap-3 text-[#cad3e2]">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0 mt-0.5 border"
                style={{
                  backgroundColor: `${accent}15`,
                  borderColor: `${accent}35`,
                  color: accent,
                }}
              >
                1
              </span>
              <span>
                Click <strong className="text-white">"Install VB-CABLE Driver"</strong> below to run the bundled installer with Administrator rights.
              </span>
            </div>

            <div className="flex items-start gap-3 text-[#cad3e2]">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0 mt-0.5 border"
                style={{
                  backgroundColor: `${accent}15`,
                  borderColor: `${accent}35`,
                  color: accent,
                }}
              >
                2
              </span>
              <span>
                In the driver setup window, click <strong className="text-white">"Install Driver"</strong> and approve the Windows prompt.
              </span>
            </div>

            <div className="flex items-start gap-3 text-[#cad3e2]">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0 mt-0.5 border"
                style={{
                  backgroundColor: `${accent}15`,
                  borderColor: `${accent}35`,
                  color: accent,
                }}
              >
                3
              </span>
              <span>
                Once installed, in Discord or your games, choose <strong className="text-white">CABLE Output</strong> as your microphone!
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[11.5px]">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <span className="text-[11px] text-[#5A687C]">
            Driver is digitally signed and 100% safe
          </span>

          <div className="flex items-center gap-2.5">
            {isDetected ? (
              <button
                type="button"
                onClick={onComplete}
                className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#090C12] font-bold text-[12px] flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRunInstaller}
                disabled={isInstalling}
                style={{
                  backgroundColor: accent,
                  color: '#090C12',
                }}
                className="px-6 py-2 rounded-xl text-[12px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isInstalling ? 'Launching Installer...' : 'Install VB-CABLE Driver'}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
