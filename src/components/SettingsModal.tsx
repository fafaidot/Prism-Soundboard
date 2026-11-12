import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  Sliders,
  Play,
  Headphones,
  Radio,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Check,
  FolderOpen,
  UploadCloud,
  DownloadCloud,
  Clapperboard,
  Volume2,
  RefreshCw,
  Power,
  AppWindow,
  RotateCcw,
  ExternalLink,
  Sparkles,
  Video,
  Trash2,
} from 'lucide-react';
import { AudioSettings } from '../types';
import { audioEngine } from '../services/audioEngine';
import { getTheme } from '../themes';
import prismLogo from '../assets/Prism.png';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AudioSettings;
  onClose: () => void;
  onSaveSettings: (settings: AudioSettings) => void;
  onReloadSounds?: () => void;
  deletedCount?: number;
  onOpenDeletedArchive?: () => void;
  sounds?: any[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSaveSettings,
  onReloadSounds,
  deletedCount = 0,
  onOpenDeletedArchive,
  sounds,
}) => {
  const [localSettings, setLocalSettings] = useState<AudioSettings>(settings);
  const [backupMsg, setBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [recordingPanic, setRecordingPanic] = useState(false);
  const [recordingRepeatLast, setRecordingRepeatLast] = useState(false);
  const [recordingOverlay, setRecordingOverlay] = useState(false);
  const [recordingRecordClip, setRecordingRecordClip] = useState(false);
  const [recordingVideoClip, setRecordingVideoClip] = useState(false);
  const [activeTab, setActiveTab] = useState<'devices' | 'voice' | 'hotkeys' | 'backup' | 'updates'>('devices');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [rawDb, setRawDb] = useState<number>(-100);
  const [isGateOpen, setIsGateOpen] = useState<boolean>(true);
  const [installingDriver, setInstallingDriver] = useState(false);

  // Update Checker State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    releaseName?: string;
    releaseNotes?: string;
    releaseUrl?: string;
    downloadUrl?: string;
    error?: string;
    message?: string;
    owner?: string;
    repo?: string;
  } | null>(null);
  const [storagePaths, setStoragePaths] = useState<{ root: string; sounds: string; videos: string } | null>(null);
  const [isRelocatingStorage, setIsRelocatingStorage] = useState(false);
  const [storageRelocateMsg, setStorageRelocateMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [isResettingApp, setIsResettingApp] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleFactoryReset = async () => {
    setIsResettingApp(true);
    try {
      if (window.soundboardAPI?.resetAllAppData) {
        await window.soundboardAPI.resetAllAppData();
      }
      // Reload window to initiate clean fresh startup
      window.location.reload();
    } catch (err) {
      console.error('Reset error:', err);
      setIsResettingApp(false);
    }
  };
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgressPercent, setDownloadProgressPercent] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (window.soundboardAPI?.getStorageDirectories) {
      window.soundboardAPI.getStorageDirectories().then(setStoragePaths).catch(() => {});
    }
  }, [isOpen]);

  const handleChangeStorageFolder = async () => {
    if (!window.soundboardAPI?.selectStorageFolderDialog || !window.soundboardAPI?.changeStorageLocation) return;
    try {
      const selected = await window.soundboardAPI.selectStorageFolderDialog();
      if (!selected) return;

      setIsRelocatingStorage(true);
      setStorageRelocateMsg({ text: 'Moving existing sounds and video files to new folder...' });

      const res = await window.soundboardAPI.changeStorageLocation(selected);
      if (res.success) {
        setStoragePaths({ root: res.root, sounds: res.sounds, videos: res.videos });
        setLocalSettings((prev) => ({ ...prev, storageLocation: res.root }));
        setStorageRelocateMsg({ text: `Successfully migrated all files to: ${res.root}` });
        if (onReloadSounds) onReloadSounds();
      } else {
        setStorageRelocateMsg({ text: res.error || 'Failed to move storage folder.', error: true });
      }
    } catch (e: any) {
      setStorageRelocateMsg({ text: e.message || 'Error changing storage location.', error: true });
    } finally {
      setIsRelocatingStorage(false);
    }
  };

  useEffect(() => {
    if (window.soundboardAPI?.onUpdateDownloadProgress) {
      return window.soundboardAPI.onUpdateDownloadProgress((progress) => {
        setIsDownloadingUpdate(true);
        setDownloadProgressPercent(progress.percent);
      });
    }
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  const currentTheme = getTheme(localSettings.theme, localSettings.accentColor);
  const accent = currentTheme.accent;

  const refreshDevices = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const ins = devs.filter((d) => d.kind === 'audioinput');
      const outs = devs.filter((d) => d.kind === 'audiooutput');

      setInputDevices(ins);
      setOutputDevices(outs);

      // Auto-detect virtual output cable
      const virtualCable = outs.find((d) =>
        d.label.toLowerCase().includes('cable input') ||
        d.label.toLowerCase().includes('vb-audio') ||
        d.label.toLowerCase().includes('voicemod')
      );

      if (virtualCable && !localSettings.secondaryDeviceId) {
        setLocalSettings((prev) => ({
          ...prev,
          secondaryDeviceId: virtualCable.deviceId,
          isSecondaryEnabled: true,
        }));
      }
    } catch (err) {
      console.warn('Failed to enumerate devices:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshDevices();
    }
  }, [isOpen]);

  // Real-time microphone VU level polling
  useEffect(() => {
    if (!isOpen || (activeTab !== 'voice' && activeTab !== 'devices')) return;

    let animId: number;
    const poll = () => {
      const lvl = audioEngine.getMicLevel() / 100;
      const db = audioEngine.getRawMicDb();
      const gateOpen = audioEngine.getIsGateOpen();

      setMicLevel(lvl);
      setRawDb(db);
      setIsGateOpen(gateOpen);
      animId = requestAnimationFrame(poll);
    };

    animId = requestAnimationFrame(poll);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen, activeTab]);

  // Hotkey recorder listener
  useEffect(() => {
    if (!recordingPanic && !recordingRepeatLast && !recordingOverlay && !recordingRecordClip && !recordingVideoClip) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Win');

      let key = e.key;
      if (key === 'Escape') key = 'Esc';
      else if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();

      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        if (!parts.includes(key)) {
          parts.push(key);
        }
      }

      if (parts.length > 0) {
        const chord = parts.join('+');
        if (recordingPanic) {
          setLocalSettings((prev) => ({ ...prev, panicHotkey: chord }));
          setRecordingPanic(false);
        } else if (recordingRepeatLast) {
          setLocalSettings((prev) => ({ ...prev, repeatLastHotkey: chord }));
          setRecordingRepeatLast(false);
        } else if (recordingOverlay) {
          setLocalSettings((prev) => ({ ...prev, overlayHotkey: chord }));
          setRecordingOverlay(false);
        } else if (recordingRecordClip) {
          setLocalSettings((prev) => ({ ...prev, recordHotkey: chord }));
          setRecordingRecordClip(false);
        } else if (recordingVideoClip) {
          setLocalSettings((prev) => ({ ...prev, videoClipHotkey: chord }));
          setRecordingVideoClip(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingPanic, recordingRepeatLast, recordingOverlay, recordingRecordClip, recordingVideoClip]);

  if (!isOpen) return null;

  const handleTestAudio = (deviceId: string) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('Test audio error:', e);
    }
  };

  const handleInstallDriver = async () => {
    setInstallingDriver(true);
    try {
      if (window.soundboardAPI?.installVirtualDriver) {
        const res = await window.soundboardAPI.installVirtualDriver();
        if (res) {
          await refreshDevices();
          alert('Driver installer launched! Follow the on-screen prompts, then click Refresh.');
        } else {
          alert('Could not start driver installation.');
        }
      } else {
        alert('Driver installer API not available in this environment.');
      }
    } catch (e: any) {
      alert('Driver installation failed: ' + e.message);
    } finally {
      setInstallingDriver(false);
    }
  };

  const handleBackupExport = async () => {
    if (window.soundboardAPI?.exportSoundboardBackup) {
      const res = await window.soundboardAPI.exportSoundboardBackup(sounds);
      if (res) {
        setBackupMsg({ text: 'Backup exported successfully!' });
      } else {
        setBackupMsg({ text: 'Export cancelled or failed.', error: true });
      }
    }
  };

  const handleBackupImport = async () => {
    if (window.soundboardAPI?.importSoundboardBackup) {
      const res = await window.soundboardAPI.importSoundboardBackup();
      if (res) {
        setBackupMsg({ text: 'Backup imported successfully! Soundboard reloaded.' });
        if (onReloadSounds) onReloadSounds();
      } else {
        setBackupMsg({ text: 'Import cancelled or failed.', error: true });
      }
    }
  };

  const handleCheckUpdates = async () => {
    if (!window.soundboardAPI?.checkAppUpdates) return;
    setIsCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const res = await window.soundboardAPI.checkAppUpdates();
      setUpdateResult(res);
    } catch (e: any) {
      setUpdateResult({
        hasUpdate: false,
        currentVersion: '1.4.2',
        error: e?.message || 'Failed to check updates.',
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const virtualOutput = outputDevices.find(
    (d) =>
      d.label.toLowerCase().includes('cable input') ||
      d.label.toLowerCase().includes('vb-audio') ||
      d.label.toLowerCase().includes('voicemod')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-3xl bg-[var(--theme-bg-surface,#111317)] border border-[var(--theme-border,#20232d)] rounded-[22px] flex flex-col overflow-hidden h-[640px] max-h-[90vh] transition-colors duration-150">
        {/* Header with Switcher Button */}
        <div className="px-7 py-4.5 border-b border-[var(--theme-border,#20232d)] flex items-center justify-between bg-[var(--theme-bg-header,#08080b)]">
          <div className="flex items-center gap-3">
            <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
            <h2 className="text-[15px] font-bold text-white tracking-wide">
              Prism Settings
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#7e8697] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (4 Tabs) */}
        <div className="px-7 border-b border-[var(--theme-border,#20232d)] flex gap-6 bg-[var(--theme-bg-surface,#111317)] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('devices')}
            style={activeTab === 'devices' ? { borderBottomColor: accent, color: '#ffffff' } : undefined}
            className={`py-3.5 text-[12.5px] font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'devices'
                ? 'text-white'
                : 'border-transparent text-[#7e8697] hover:text-[#c4cad7]'
            }`}
          >
            <Radio size={15} style={activeTab === 'devices' ? { color: accent } : undefined} />
            <span>Audio Devices</span>
          </button>

          <button
            onClick={() => setActiveTab('voice')}
            style={activeTab === 'voice' ? { borderBottomColor: accent, color: '#ffffff' } : undefined}
            className={`py-3.5 text-[12.5px] font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'voice'
                ? 'text-white'
                : 'border-transparent text-[#7e8697] hover:text-[#c4cad7]'
            }`}
          >
            <Mic size={15} style={activeTab === 'voice' ? { color: accent } : undefined} />
            <span>Voice & Noise Gate</span>
          </button>

          <button
            onClick={() => setActiveTab('hotkeys')}
            style={activeTab === 'hotkeys' ? { borderBottomColor: accent, color: '#ffffff' } : undefined}
            className={`py-3.5 text-[12.5px] font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'hotkeys'
                ? 'text-white'
                : 'border-transparent text-[#7e8697] hover:text-[#c4cad7]'
            }`}
          >
            <Sliders size={15} style={activeTab === 'hotkeys' ? { color: accent } : undefined} />
            <span>Shortcuts</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            style={activeTab === 'backup' ? { borderBottomColor: accent, color: '#ffffff' } : undefined}
            className={`py-3.5 text-[12.5px] font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'backup'
                ? 'text-white'
                : 'border-transparent text-[#7e8697] hover:text-[#c4cad7]'
            }`}
          >
            <FolderOpen size={15} style={activeTab === 'backup' ? { color: accent } : undefined} />
            <span>Backup & Storage</span>
          </button>

          <button
            onClick={() => setActiveTab('updates')}
            style={activeTab === 'updates' ? { borderBottomColor: accent, color: '#ffffff' } : undefined}
            className={`py-3.5 text-[12.5px] font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'updates'
                ? 'text-white'
                : 'border-transparent text-[#7e8697] hover:text-[#c4cad7]'
            }`}
          >
            <RefreshCw size={15} style={activeTab === 'updates' ? { color: accent } : undefined} className={isCheckingUpdate ? 'animate-spin' : ''} />
            <span>Updates</span>
            {updateResult?.hasUpdate && (
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-7 space-y-6 bg-[var(--theme-bg-surface,#12131d)]">
          {/* TAB 1: AUDIO DEVICES */}
          {activeTab === 'devices' && (
            <div className="space-y-5">
              {/* Virtual Microphone Status Banner */}
              {virtualOutput ? (
                <div className="p-4 bg-[#00ff88]/10 rounded-[14px] border border-[#00ff88]/30 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <CheckCircle2 size={22} className="text-[#00ff88] flex-shrink-0" />
                    <div>
                      <h4 className="text-[13px] font-bold text-white flex items-center gap-2">
                        <span>Virtual Microphone Ready</span>
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#00ff88] text-black font-extrabold uppercase">
                          Connected
                        </span>
                      </h4>
                      <p className="text-[11.5px] text-[#a4abbd] mt-1 leading-relaxed">
                        Routing through <strong className="text-white">{virtualOutput.label}</strong>. In Discord, Steam, or games, set your microphone device to <strong>CABLE Output</strong>.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={refreshDevices}
                    title="Refresh audio devices"
                    className="p-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-[#a4abbd] hover:text-white transition-colors cursor-pointer"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              ) : (
                <div className="p-4.5 bg-[#ff8c00]/15 rounded-[14px] border border-[#ff8c00]/40 flex flex-col gap-3">
                  <div className="flex items-start gap-3.5">
                    <AlertTriangle size={22} className="text-[#ff8c00] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-[13.5px] font-bold text-white">
                        Virtual Audio Cable Driver Required
                      </h4>
                      <p className="text-[11.5px] text-[#c4cad7] leading-relaxed mt-1">
                        Windows requires the virtual audio cable pipe so Discord, TeamSpeak, and games can hear your soundboard audio as a microphone.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleInstallDriver}
                      disabled={installingDriver}
                      className="px-4 py-2 rounded-[9px] text-[12px] font-bold text-white bg-[#0067c0] hover:bg-[#187ad2] flex items-center gap-2 transition-all shadow-md cursor-pointer"
                    >
                      <Download size={14} />
                      <span>{installingDriver ? 'Installing Driver...' : '1-Click Install Virtual Microphone'}</span>
                    </button>
                    <button
                      onClick={refreshDevices}
                      className="px-3 py-2 rounded-[9px] text-[11.5px] font-semibold text-[#a4abbd] hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}

              {/* 1. PHYSICAL MICROPHONE */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Mic size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">1. Physical Microphone (Voice Input)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-[#00ff88] font-bold bg-[#00ff88]/10 px-2.5 py-0.5 rounded-full border border-[#00ff88]/20">
                      <ShieldCheck size={12} /> Anti-Loop Active
                    </span>
                    <div
                      onClick={() =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          isMicPassThroughEnabled: !prev.isMicPassThroughEnabled,
                        }))
                      }
                      className="flex items-center gap-1.5 cursor-pointer ml-1 select-none group"
                    >
                      <div
                        style={
                          localSettings.isMicPassThroughEnabled
                            ? {
                                backgroundColor: accent,
                                borderColor: accent,
                              }
                            : undefined
                        }
                        className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all duration-150 border ${
                          localSettings.isMicPassThroughEnabled
                            ? ''
                            : 'bg-[#101217] border-[#2c3140] group-hover:border-[#42495d]'
                        }`}
                      >
                        {localSettings.isMicPassThroughEnabled && (
                          <Check size={11} className="text-white stroke-[3.5]" />
                        )}
                      </div>
                      <span className="text-[11.5px] font-semibold text-[#a4abbd] group-hover:text-white transition-colors">
                        Pass-Through
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#7e8697]">
                  Your real headset or desktop microphone. Pass-through feeds your real voice directly into the virtual cable alongside soundboard sounds.
                </p>

                <select
                  value={localSettings.inputDeviceId}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, inputDeviceId: e.target.value }))
                  }
                  className="w-full p-3 bg-[#111319] border border-[#2a2f3f] rounded-[10px] text-[12.5px] text-white focus:outline-none transition-colors"
                >
                  <option value="">Default Microphone (Windows System Default)</option>
                  {inputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. HEADPHONES / MONITOR */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Headphones size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">2. Your Headphones (Personal Monitor)</span>
                  </div>
                  <button
                    onClick={() => handleTestAudio(localSettings.primaryDeviceId)}
                    className="px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Play size={11} className="fill-current" /> Test Audio
                  </button>
                </div>

                <p className="text-[11.5px] text-[#7e8697]">
                  Where YOU hear the sounds playing. Usually your main headset or speakers.
                </p>

                <select
                  value={localSettings.primaryDeviceId}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, primaryDeviceId: e.target.value }))
                  }
                  className="w-full p-3 bg-[#111319] border border-[#2a2f3f] rounded-[10px] text-[12.5px] text-white focus:outline-none transition-colors"
                >
                  <option value="default">Default Device (Windows System Default)</option>
                  {outputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Audio Output (${d.deviceId.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* TAB 2: VOICE & NOISE GATE */}
          {activeTab === 'voice' && (
            <div className="space-y-5">
              {/* Live Microphone Meter */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-[13px]">
                    <Mic size={17} style={{ color: accent }} />
                    <span>Real-Time Voice Volume & VU Meter</span>
                  </div>
                  <span className="font-mono text-[12px] font-bold text-white">
                    {Math.round(rawDb)} dB
                  </span>
                </div>

                <div className="h-4 bg-[#111319] rounded-[6px] border border-[#2a2f3f] overflow-hidden p-0.5 relative">
                  <div
                    className="h-full rounded-[4px] transition-all duration-75"
                    style={{
                      width: `${Math.min(100, Math.max(0, micLevel * 100))}%`,
                      backgroundColor: accent,
                    }}
                  />
                </div>
              </div>

              {/* Voice Volume Boost */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-[13px]">
                    <Volume2 size={17} style={{ color: localSettings.micInputVolume > 100 ? '#f59e0b' : accent }} />
                    <span>Mic Gain & Projection</span>
                  </div>
                  <span
                    className={`font-mono text-[12px] font-bold px-2 py-0.5 rounded border ${
                      localSettings.micInputVolume > 100 ? 'border-[#f59e0b]/50 text-[#f59e0b]' : 'border-white/10 text-white'
                    }`}
                  >
                    {localSettings.micInputVolume}%
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={200}
                  value={localSettings.micInputVolume}
                  onChange={(e) => {
                    const vol = parseInt(e.target.value) || 0;
                    setLocalSettings((prev) => ({ ...prev, micInputVolume: vol }));
                    audioEngine.setMicInputVolume(vol);
                  }}
                  className="w-full h-2 bg-[#2d3242] rounded cursor-pointer"
                  style={{ accentColor: localSettings.micInputVolume > 100 ? '#f59e0b' : accent }}
                />
              </div>

              {/* Noise Gate */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[13px] font-bold text-white">Microphone Noise Gate</h4>
                    <p className="text-[11.5px] text-[#7e8697]">
                      Silences background keyboard clicks and fan hum below threshold
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLocalSettings((prev) => ({
                        ...prev,
                        isNoiseGateEnabled: !prev.isNoiseGateEnabled,
                      }));
                      audioEngine.setNoiseGateEnabled(!localSettings.isNoiseGateEnabled);
                    }}
                    style={localSettings.isNoiseGateEnabled ? { backgroundColor: accent } : undefined}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      localSettings.isNoiseGateEnabled ? '' : 'bg-[#2a2f3d]'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        localSettings.isNoiseGateEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {localSettings.isNoiseGateEnabled && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-[11.5px] text-[#8e97aa] mb-1">
                      <span>Gate Threshold</span>
                      <span className="font-mono font-bold text-white">{localSettings.noiseGateThreshold || -39} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-70}
                      max={-10}
                      value={localSettings.noiseGateThreshold || -39}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setLocalSettings((prev) => ({ ...prev, noiseGateThreshold: val }));
                        audioEngine.setNoiseGateThreshold(val);
                      }}
                      className="w-full h-2 bg-[#2d3242] rounded cursor-pointer"
                      style={{ accentColor: accent }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SHORTCUTS & HOTKEYS */}
          {activeTab === 'hotkeys' && (
            <div className="space-y-5">
              {/* Quick Instant Replay Audio Clip Recording */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Clapperboard size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Audio Clip Shortcut</span>
                  </div>
                  <button
                    onClick={() => {
                      setRecordingRecordClip(true);
                      setRecordingVideoClip(false);
                      setRecordingPanic(false);
                      setRecordingOverlay(false);
                    }}
                    style={
                      recordingRecordClip
                        ? { backgroundColor: accent, color: '#000000', borderColor: accent }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-mono border transition-all cursor-pointer ${
                      recordingRecordClip
                        ? 'animate-pulse font-extrabold'
                        : 'bg-[#111319] text-white border-[#2a2f3f] hover:border-white/40'
                    }`}
                  >
                    {recordingRecordClip ? 'Press any Key...' : localSettings.recordHotkey || 'F9'}
                  </button>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Instantly snips the last {localSettings.recordDuration || 5} seconds of audio into your soundboard.
                </p>

                {/* Duration & Recording Source Selector */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#8e97aa] mb-1.5">
                      Clip Buffer Length
                    </label>
                    <select
                      value={localSettings.recordDuration || 5}
                      onChange={(e) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          recordDuration: parseInt(e.target.value) || 5,
                        }))
                      }
                      className="w-full p-2.5 bg-[#111319] border border-[#2a2f3f] rounded-[10px] text-[12px] text-white focus:outline-none transition-colors"
                    >
                      <option value={3}>Last 3 Seconds</option>
                      <option value={5}>Last 5 Seconds</option>
                      <option value={10}>Last 10 Seconds</option>
                      <option value={15}>Last 15 Seconds</option>
                      <option value={30}>Last 30 Seconds</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#8e97aa] mb-1.5">
                      Recording Source
                    </label>
                    <select
                      value={localSettings.recordSource || 'screen'}
                      onChange={(e) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          recordSource: e.target.value as any,
                        }))
                      }
                      className="w-full p-2.5 bg-[#111319] border border-[#2a2f3f] rounded-[10px] text-[12px] text-white focus:outline-none transition-colors"
                    >
                      <option value="screen">Computer Audio (Loopback)</option>
                      <option value="all">Screen + Mic Combined</option>
                      <option value="mic">Microphone Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Medal-like Game/Screen Video Clipping Shortcut */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Video size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Screen Video Clip Shortcut (Medal-like)</span>
                  </div>
                  <button
                    onClick={() => {
                      setRecordingVideoClip(true);
                      setRecordingRecordClip(false);
                      setRecordingPanic(false);
                      setRecordingOverlay(false);
                    }}
                    style={
                      recordingVideoClip
                        ? { backgroundColor: accent, color: '#000000', borderColor: accent }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-mono border transition-all cursor-pointer ${
                      recordingVideoClip
                        ? 'animate-pulse font-extrabold'
                        : 'bg-[#111319] text-white border-[#2a2f3f] hover:border-white/40'
                    }`}
                  >
                    {recordingVideoClip ? 'Press any Key...' : localSettings.videoClipHotkey || 'F10'}
                  </button>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Captures the last {localSettings.videoClipDuration || 15} seconds of game/screen video and saves to your Videos folder.
                </p>

                <div className="w-1/2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#8e97aa] mb-1.5">
                    Video Clip Length
                  </label>
                  <select
                    value={localSettings.videoClipDuration || 15}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        videoClipDuration: parseInt(e.target.value) || 15,
                      }))
                    }
                    className="w-full p-2.5 bg-[#111319] border border-[#2a2f3f] rounded-[10px] text-[12px] text-white focus:outline-none transition-colors"
                  >
                    <option value={15}>Last 15 Seconds</option>
                    <option value={30}>Last 30 Seconds</option>
                    <option value={45}>Last 45 Seconds</option>
                    <option value={60}>Last 60 Seconds</option>
                  </select>
                </div>
              </div>

              {/* Stop All Panic Hotkey */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Sliders size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Stop All Sounds (Panic Key)</span>
                  </div>
                  <button
                    onClick={() => {
                      setRecordingPanic(true);
                      setRecordingOverlay(false);
                      setRecordingRecordClip(false);
                    }}
                    style={
                      recordingPanic
                        ? { backgroundColor: accent, color: '#000000', borderColor: accent }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-mono border transition-all cursor-pointer ${
                      recordingPanic
                        ? 'animate-pulse font-extrabold'
                        : 'bg-[#111319] text-white border-[#2a2f3f] hover:border-white/40'
                    }`}
                  >
                    {recordingPanic ? 'Press any Key...' : localSettings.panicHotkey || 'Esc'}
                  </button>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Instantly terminates all active sound playback and clears queue.
                </p>
              </div>

              {/* Repeat Last Sound Hotkey */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <RotateCcw size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Repeat Last Sound Hotkey</span>
                  </div>
                  <button
                    onClick={() => {
                      setRecordingRepeatLast(true);
                      setRecordingPanic(false);
                      setRecordingOverlay(false);
                      setRecordingRecordClip(false);
                    }}
                    style={
                      recordingRepeatLast
                        ? { backgroundColor: accent, color: '#000000', borderColor: accent }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-mono border transition-all cursor-pointer ${
                      recordingRepeatLast
                        ? 'animate-pulse font-extrabold'
                        : 'bg-[#111319] text-white border-[#2a2f3f] hover:border-white/40'
                    }`}
                  >
                    {recordingRepeatLast ? 'Press any Key...' : localSettings.repeatLastHotkey || 'F7'}
                  </button>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Instantly replays the most recently played sound with a single keypress.
                </p>
              </div>

              {/* In-Game Overlay HUD Hotkey */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <Sliders size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">In-Game Overlay Hotkey</span>
                  </div>
                  <button
                    onClick={() => {
                      setRecordingOverlay(true);
                      setRecordingPanic(false);
                      setRecordingRecordClip(false);
                    }}
                    style={
                      recordingOverlay
                        ? { backgroundColor: accent, color: '#000000', borderColor: accent }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-[8px] text-[12px] font-mono border transition-all cursor-pointer ${
                      recordingOverlay
                        ? 'animate-pulse font-extrabold'
                        : 'bg-[#111319] text-white border-[#2a2f3f] hover:border-white/40'
                    }`}
                  >
                    {recordingOverlay ? 'Press any Key...' : localSettings.overlayHotkey || 'F8'}
                  </button>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Pops up the interactive soundboard HUD directly over full-screen games without alt-tabbing.
                </p>
              </div>

              {/* Startup & System Tray Behavior */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-4">
                <div className="flex items-center gap-2.5 text-white">
                  <Power size={17} style={{ color: accent }} />
                  <span className="text-[13.5px] font-bold">Startup & System Tray</span>
                </div>

                {/* Option: Start on Boot */}
                <label className="flex items-center justify-between cursor-pointer group select-none">
                  <div className="space-y-0.5">
                    <span className="text-[13px] font-semibold text-white/90 group-hover:text-white transition-colors">
                      Start on Windows Boot
                    </span>
                    <p className="text-[11.5px] text-[#7e8697]">
                      Automatically launch Prism Soundboard when Windows starts up.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.startOnBoot || false}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, startOnBoot: e.target.checked })
                    }
                    className="w-4 h-4 rounded cursor-pointer transition-all"
                    style={{ accentColor: accent }}
                  />
                </label>

                {/* Option: Start in Tray (Minimized) */}
                <label className="flex items-center justify-between cursor-pointer group select-none pt-2 border-t border-[var(--theme-border,#222436)]">
                  <div className="space-y-0.5">
                    <span className="text-[13px] font-semibold text-white/90 group-hover:text-white transition-colors">
                      Start Minimized to System Tray
                    </span>
                    <p className="text-[11.5px] text-[#7e8697]">
                      Keep the main window hidden on launch and run silently in the taskbar notification tray.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.startInTray || false}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, startInTray: e.target.checked })
                    }
                    className="w-4 h-4 rounded cursor-pointer transition-all"
                    style={{ accentColor: accent }}
                  />
                </label>

                {/* Option: Minimize to Tray on Close */}
                <label className="flex items-center justify-between cursor-pointer group select-none pt-2 border-t border-[var(--theme-border,#222436)]">
                  <div className="space-y-0.5">
                    <span className="text-[13px] font-semibold text-white/90 group-hover:text-white transition-colors">
                      Minimize to System Tray on Close (X)
                    </span>
                    <p className="text-[11.5px] text-[#7e8697]">
                      Closing the window keeps the soundboard running in the background for global hotkeys.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.minimizeToTray !== false}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, minimizeToTray: e.target.checked })
                    }
                    className="w-4 h-4 rounded cursor-pointer transition-all"
                    style={{ accentColor: accent }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: BACKUP & STORAGE */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              {/* Unified Media Storage Location (Sounds & Videos) */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-white">
                    <FolderOpen size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Unified Media & Clips Storage Location</span>
                  </div>
                  <button
                    disabled={isRelocatingStorage}
                    onClick={handleChangeStorageFolder}
                    style={{ backgroundColor: `${accent}20`, color: accent, borderColor: `${accent}40` }}
                    className="px-3.5 py-1.5 rounded-[8px] border text-[11.5px] font-bold hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isRelocatingStorage ? 'Relocating...' : 'Change Location'}
                  </button>
                </div>

                <p className="text-[11.5px] text-[#7e8697] leading-relaxed">
                  Choose a root folder on your PC. Prism will automatically manage <span className="font-mono text-white font-semibold">/Sounds</span> and <span className="font-mono text-white font-semibold">/Videos</span> inside it. Changing this location automatically moves all your existing audio and video files!
                </p>

                {storagePaths && (
                  <div className="p-3 bg-[#111319] rounded-[10px] border border-[#2a2f3f] space-y-1.5 font-mono text-[11.5px]">
                    <div className="text-white truncate">
                      <span className="text-[#7e8697]">Root: </span>{storagePaths.root}
                    </div>
                    <div className="text-[#8e97aa] text-[10.5px] flex items-center gap-4">
                      <span>• {storagePaths.sounds}</span>
                      <span>• {storagePaths.videos}</span>
                    </div>
                  </div>
                )}

                {storageRelocateMsg && (
                  <div
                    className={`p-3 rounded-[10px] text-[12px] font-semibold border ${
                      storageRelocateMsg.error
                        ? 'bg-[#e81123]/15 border-[#e81123]/30 text-[#ff4d5e]'
                        : 'bg-[#00ff88]/15 border-[#00ff88]/30 text-[#00ff88]'
                    }`}
                  >
                    {storageRelocateMsg.text}
                  </div>
                )}
              </div>

              {/* Soundboard Backup */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3.5">
                <div className="flex items-center gap-2.5 text-white">
                  <DownloadCloud size={17} style={{ color: accent }} />
                  <span className="text-[13.5px] font-bold">Soundboard Full Library Backup (.prism)</span>
                </div>
                <p className="text-[11.5px] text-[#7e8697] leading-relaxed">
                  Export all your added sounds, audio files, and keybind settings into a single bundled <span className="font-mono font-bold" style={{ color: accent }}>.prism</span> backup archive or restore one on any PC.
                </p>

                {backupMsg && (
                  <div
                    className={`p-3 rounded-[10px] text-[12px] font-semibold border ${
                      backupMsg.error
                        ? 'bg-[#e81123]/15 border-[#e81123]/30 text-[#ff4d5e]'
                        : 'bg-[#00ff88]/15 border-[#00ff88]/30 text-[#00ff88]'
                    }`}
                  >
                    {backupMsg.text}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleBackupExport}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[12px] font-semibold transition-all cursor-pointer shadow-sm hover:border-white/30"
                  >
                    <DownloadCloud size={15} style={{ color: accent }} />
                    <span>Export Backup Archive</span>
                  </button>

                  <button
                    onClick={handleBackupImport}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[12px] font-semibold transition-all cursor-pointer shadow-sm hover:border-white/30"
                  >
                    <UploadCloud size={15} style={{ color: accent }} />
                    <span>Import Backup Archive</span>
                  </button>
                </div>
              </div>

              {/* Deleted Sounds Archive */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3.5">
                <div className="flex items-center gap-2.5 text-white">
                  <FolderOpen size={17} style={{ color: accent }} />
                  <span className="text-[13.5px] font-bold">Recycle Bin & Deleted Sounds</span>
                </div>
                <p className="text-[11.5px] text-[#7e8697]">
                  Deleted sounds are stored in the archive folder so you can restore them at any time without losing audio files.
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => {
                      if (window.soundboardAPI?.openSoundsDirectory) {
                        window.soundboardAPI.openSoundsDirectory();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-[#c4cad7] hover:text-white text-[12px] font-semibold transition-all cursor-pointer shadow-sm hover:border-white/30"
                  >
                    <FolderOpen size={14} style={{ color: accent }} />
                    <span>Open Sounds Folder in Explorer</span>
                  </button>

                  {deletedCount > 0 && onOpenDeletedArchive && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenDeletedArchive();
                      }}
                      style={{
                        backgroundColor: `${accent}15`,
                        borderColor: `${accent}40`,
                        color: accent,
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] border text-[12px] font-semibold transition-all cursor-pointer shadow-sm hover:brightness-125"
                    >
                      <span>Restore Deleted ({deletedCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Danger Zone: Factory Reset */}
              <div className="p-5 bg-red-500/5 rounded-[16px] border border-red-500/20 space-y-3.5">
                <div className="flex items-center gap-2.5 text-red-400">
                  <AlertTriangle size={17} />
                  <span className="text-[13.5px] font-bold">Danger Zone: Full Factory Reset</span>
                </div>
                <p className="text-[11.5px] text-[#8e95a5] leading-relaxed">
                  Permanently deletes all saved sounds, audio files, video clips, and configuration settings from your PC, restoring Prism Soundboard to an absolute fresh state.
                </p>

                {showResetConfirm ? (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
                    <p className="text-[12px] font-bold text-red-400">
                      Are you completely sure? This will delete EVERYTHING and restart the app!
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={handleFactoryReset}
                        disabled={isResettingApp}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[12px] transition-all cursor-pointer shadow-lg disabled:opacity-50"
                      >
                        {isResettingApp ? 'Resetting Everything...' : 'Yes, Delete Everything'}
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        disabled={isResettingApp}
                        className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[12px] font-medium transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 hover:text-red-300 text-[12px] font-semibold transition-all cursor-pointer shadow-sm"
                  >
                    <Trash2 size={14} />
                    <span>Reset All App Data & Files</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: UPDATES */}
          {activeTab === 'updates' && (
            <div className="space-y-5">
              {/* App Version & Checker Card */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={prismLogo} alt="Prism" className="w-8 h-8 object-contain drop-shadow" />
                    <div>
                      <h4 className="text-[14px] font-bold text-white flex items-center gap-2">
                        <span>Prism Soundboard</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white font-mono font-semibold">v1.4.2</span>
                      </h4>
                      <p className="text-[11.5px] text-[#7e8697]">
                        Direct GitHub releases update channel (fafaidot/Prism-Soundboard)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdate}
                    style={{
                      backgroundColor: accent,
                      color: '#000000',
                    }}
                    className="flex items-center gap-2 px-4.5 py-2.5 rounded-[10px] text-[12px] font-bold hover:brightness-110 active:scale-98 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
                    <span>{isCheckingUpdate ? 'Checking GitHub...' : 'Check for Updates'}</span>
                  </button>
                </div>

                {/* Results Section */}
                {updateResult && (
                  <div className="pt-2">
                    {updateResult.hasUpdate ? (
                      <div className="p-4 bg-[#00ff88]/10 rounded-[14px] border border-[#00ff88]/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Sparkles size={18} className="text-[#00ff88]" />
                            <span className="text-[13px] font-bold text-white">
                              New Update Available: {updateResult.latestVersion}
                            </span>
                          </div>
                          {updateResult.downloadUrl && (
                            <button
                              disabled={isDownloadingUpdate}
                              onClick={async () => {
                                const downloadUrl = updateResult.downloadUrl;
                                if (!downloadUrl) return;

                                setIsDownloadingUpdate(true);
                                setDownloadError(null);
                                setDownloadProgressPercent(0);

                                if (window.soundboardAPI?.downloadAndInstallUpdate) {
                                  const res = await window.soundboardAPI.downloadAndInstallUpdate(downloadUrl);
                                  if (!res.success) {
                                    setIsDownloadingUpdate(false);
                                    setDownloadError(res.error || 'Failed to download or install update.');
                                  }
                                } else if (window.soundboardAPI?.openExternal) {
                                  window.soundboardAPI.openExternal(downloadUrl);
                                  setIsDownloadingUpdate(false);
                                }
                              }}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-[#00ff88] text-black text-[11.5px] font-bold hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Download size={13} />
                              <span>{isDownloadingUpdate ? 'Downloading...' : 'Update & Restart'}</span>
                            </button>
                          )}
                        </div>

                        {/* In-app download progress bar */}
                        {isDownloadingUpdate && (
                          <div className="p-3 bg-black/40 rounded-[10px] border border-white/10 space-y-2">
                            <div className="flex items-center justify-between text-[11.5px]">
                              <span className="text-white font-medium flex items-center gap-1.5">
                                <RefreshCw size={12} className="animate-spin text-[#00ff88]" />
                                <span>Downloading update...</span>
                              </span>
                              <span className="text-[#00ff88] font-mono font-bold">
                                {downloadProgressPercent}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                              <div
                                className="h-full bg-[#00ff88] rounded-full transition-all duration-150"
                                style={{ width: `${downloadProgressPercent}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-[#7e8697]">
                              {downloadProgressPercent >= 100
                                ? 'Launching installer and updating Prism Soundboard...'
                                : 'Downloading directly in background — the installer will launch automatically.'}
                            </p>
                          </div>
                        )}

                        {downloadError && (
                          <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-[8px] text-[11.5px]">
                            {downloadError}
                          </div>
                        )}

                        {updateResult.releaseNotes && (
                          <div className="p-3 bg-black/30 rounded-[10px] text-[11.5px] text-[#c4cad7] max-h-36 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-white/5">
                            {updateResult.releaseNotes}
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-[11px] text-[#7e8697]">
                          <span>Current: v{updateResult.currentVersion}</span>
                          <span>•</span>
                          <button
                            onClick={() => {
                              if (window.soundboardAPI?.openExternal && updateResult.releaseUrl) {
                                window.soundboardAPI.openExternal(updateResult.releaseUrl);
                              }
                            }}
                            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer underline"
                          >
                            <span>View Release on GitHub</span>
                            <ExternalLink size={11} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-white/5 rounded-[14px] border border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 size={18} className="text-[#00ff88]" />
                          <div>
                            <span className="text-[12.5px] font-bold text-white">
                              {updateResult.error ? 'Could not reach GitHub' : "You're up to date!"}
                            </span>
                            <p className="text-[11px] text-[#7e8697] mt-0.5">
                              {updateResult.error
                                ? updateResult.error
                                : updateResult.message
                                ? updateResult.message
                                : `Prism Soundboard v${updateResult.currentVersion} is currently the latest release.`}
                            </p>
                          </div>
                        </div>

                        {updateResult.owner && updateResult.repo && (
                          <button
                            onClick={() => {
                              if (window.soundboardAPI?.openExternal) {
                                window.soundboardAPI.openExternal(`https://github.com/${updateResult.owner}/${updateResult.repo}/releases`);
                              }
                            }}
                            className="flex items-center gap-1.5 text-[11px] text-[#7e8697] hover:text-white transition-colors cursor-pointer"
                          >
                            <span>Releases</span>
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* GitHub Repository Settings Card */}
              <div className="p-5 bg-[var(--theme-bg-card,#171826)] rounded-[16px] border border-[var(--theme-border,#222436)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[13px] font-bold text-white">GitHub Repository Source</h4>
                    <p className="text-[11.5px] text-[#7e8697] mt-0.5">
                      Target repository used to query GitHub Releases for new updates
                    </p>
                  </div>
                </div>

                <div className="pt-1">
                  <input
                    type="text"
                    disabled
                    value="fafaidot/Prism-Soundboard"
                    className="w-full max-w-md px-3.5 py-2.5 bg-[#111319]/60 border border-[#262a38] rounded-[10px] text-[12.5px] text-[#00ff88] font-mono focus:outline-none cursor-default"
                  />
                  <p className="text-[10.5px] text-[#606778] mt-1.5">
                    Hardcoded repository source: <code className="text-[#a4abbd]">fafaidot/Prism-Soundboard</code>. Clicking "Check for Updates" directly queries this repository's releases.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clean Footer */}
        <div className="px-7 py-4.5 border-t border-[var(--theme-border,#222436)] flex items-center justify-between bg-[var(--theme-bg-header,#090a0f)]">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-[#7e8697]">Prism Soundboard v1.4.2</span>
            <span className="text-[#3b4152]">•</span>
            <button
              onClick={() => {
                setActiveTab('updates');
                handleCheckUpdates();
              }}
              className="text-[11px] text-[#7e8697] hover:text-[var(--accent-color,#38bdf8)] transition-colors cursor-pointer flex items-center gap-1"
            >
              <RefreshCw size={11} className={isCheckingUpdate ? 'animate-spin' : ''} />
              <span>Check for Updates</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4.5 py-2 rounded-[10px] text-[12px] font-semibold text-[#a4abbd] hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                backgroundColor: accent,
                color: '#000000',
              }}
              className="px-6 py-2 rounded-[10px] text-[12px] font-bold hover:brightness-110 active:scale-98 transition-all cursor-pointer"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
