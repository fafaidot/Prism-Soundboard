import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, Volume2 } from 'lucide-react';
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
      <div className="w-full max-w-lg rounded-2xl bg-[#10141C] border border-[#1B222E] shadow-2xl overflow-hidden flex flex-col p-6 text-white relative">
        {/* Top Header Badge */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-[#123244] border border-[#31C5F4]/40 flex items-center justify-center text-[#31C5F4] flex-shrink-0 shadow-lg">
            <Volume2 size={24} />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-white tracking-tight flex items-center gap-2">
              Required Setup: VB-CABLE Audio Driver
            </h2>
            <p className="text-[12px] text-[#8e95a5]">
              Prism requires VB-CABLE to route soundboard sounds directly into Discord and games.
            </p>
          </div>
        </div>

        {/* Informational Box */}
        <div className="bg-[#151B25] border border-[#1B222E] rounded-xl p-4 flex flex-col gap-3 mb-5 text-[12.5px] leading-relaxed">
          <div className="flex items-start gap-2.5 text-[#cad3e2]">
            <span className="w-5 h-5 rounded-full bg-[#123244] text-[#31C5F4] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
              1
            </span>
            <span>
              Click <strong>"Install VB-CABLE Driver"</strong> below to launch the bundled setup tool as Administrator.
            </span>
          </div>

          <div className="flex items-start gap-2.5 text-[#cad3e2]">
            <span className="w-5 h-5 rounded-full bg-[#123244] text-[#31C5F4] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
              2
            </span>
            <span>
              In the installer window, click <strong>"Install Driver"</strong> and accept Windows permission prompts.
            </span>
          </div>

          <div className="flex items-start gap-2.5 text-[#cad3e2]">
            <span className="w-5 h-5 rounded-full bg-[#123244] text-[#31C5F4] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
              3
            </span>
            <span>
              Once completed, Prism will automatically detect the virtual driver and unlock the soundboard!
            </span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="mb-6 flex items-center justify-between p-3.5 rounded-xl bg-[#090B10] border border-[#1B222E]">
          <div className="flex items-center gap-2.5">
            {isVerifying ? (
              <RefreshCw size={17} className="text-[#31C5F4] animate-spin" />
            ) : isDetected ? (
              <CheckCircle2 size={17} className="text-[#22c55e]" />
            ) : (
              <AlertTriangle size={17} className="text-[#ff9500]" />
            )}
            <span className="text-[12px] font-medium text-white">
              {isVerifying
                ? 'Checking audio drivers...'
                : isDetected
                ? 'VB-CABLE Driver Detected & Ready!'
                : 'VB-CABLE Driver Not Detected Yet'}
            </span>
          </div>

          <button
            onClick={checkStatus}
            disabled={isVerifying}
            className="text-[11px] text-[#31C5F4] hover:underline cursor-pointer flex items-center gap-1 font-semibold"
          >
            <RefreshCw size={11} className={isVerifying ? 'animate-spin' : ''} />
            <span>Check again</span>
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11.5px]">
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunInstaller}
            disabled={isInstalling || isDetected}
            className={`flex-1 h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
              isDetected
                ? 'bg-[#151B25] text-[#5a687c] border border-[#1B222E] cursor-not-allowed'
                : 'bg-[#31C5F4] hover:bg-[#31C5F4]/90 text-[#090B10] active:scale-[0.98]'
            }`}
          >
            <Download size={15} />
            <span>{isInstalling ? 'Launching Installer...' : 'Install VB-CABLE Driver'}</span>
          </button>

          {isDetected && (
            <button
              onClick={onComplete}
              className="h-11 px-5 rounded-xl bg-[#22c55e] hover:bg-[#22c55e]/90 text-black font-bold text-[13px] flex items-center gap-1.5 transition-all cursor-pointer shadow-lg animate-in fade-in"
            >
              <span>Continue</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
