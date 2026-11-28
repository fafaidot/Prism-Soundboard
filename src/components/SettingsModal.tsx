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
  RotateCcw,
  ExternalLink,
  Sparkles,
  Video,
  Trash2,
  Palette,
} from 'lucide-react';
import { AudioSettings } from '../types';
import { audioEngine } from '../services/audioEngine';
import { videoClipper } from '../services/videoClipper';
import { getTheme, THEMES, applyThemeToDom } from '../themes';
import prismLogo from '../assets/Prism.png';
import { Slider } from './Slider';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: 'devices' | 'voice' | 'hotkeys' | 'theme' | 'backup' | 'updates';
  settings: AudioSettings;
  onClose: () => void;
  onSaveSettings: (settings: AudioSettings, immediate?: boolean) => void;
  onReloadSounds?: () => void;
  deletedCount?: number;
  onOpenDeletedArchive?: () => void;
  sounds?: any[];
  videoClips?: any[];
  onOpenClearAllModal?: () => void;
}

// Sleek iOS/macOS-style pill switch toggle
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: string;
  disabled?: boolean;
}> = ({ checked, onChange, accent = 'var(--accent-color)', disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    style={checked ? { backgroundColor: accent } : undefined}
    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 disabled:opacity-40 select-none ${
      checked ? '' : 'bg-white/[0.06] border border-white/[0.12]'
    }`}
  >
    <span
      className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab,
  settings,
  onClose,
  onSaveSettings,
  onReloadSounds,
  deletedCount = 0,
  onOpenDeletedArchive,
  sounds,
  videoClips,
  onOpenClearAllModal,
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
  const [activeTab, setActiveTab] = useState<'devices' | 'voice' | 'hotkeys' | 'theme' | 'backup' | 'updates'>('devices');
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
    const unsubBackup = window.soundboardAPI?.onBackupProgress?.((progress) => {
      setBackupMsg({ text: `[${progress.percent}%] ${progress.detail}` });
    });
    const unsubRelocate = window.soundboardAPI?.onStorageRelocationProgress?.((progress) => {
      setStorageRelocateMsg({ text: `[${progress.percent}%] ${progress.detail}` });
    });
    return () => {
      if (unsubBackup) unsubBackup();
      if (unsubRelocate) unsubRelocate();
    };
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const currentTheme = getTheme(localSettings.theme, localSettings.accentColor);
  const accent = currentTheme.accent || 'var(--accent-color)';

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

      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        if (recordingPanic) {
          setLocalSettings((prev) => ({ ...prev, panicHotkey: 'Escape' }));
          setRecordingPanic(false);
          return;
        } else {
          setRecordingRepeatLast(false);
          setRecordingOverlay(false);
          setRecordingRecordClip(false);
          setRecordingVideoClip(false);
          return;
        }
      }

      let key = e.key;
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
      const res = await window.soundboardAPI.exportSoundboardBackup(sounds, videoClips);
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
        if (res.settings) {
          setLocalSettings(res.settings);
          const restoredTheme = getTheme(res.settings.theme, res.settings.accentColor);
          applyThemeToDom(restoredTheme);
          const frostedEnabled = res.settings.enableFrostedGlass !== false;
          document.documentElement.classList.toggle('no-frosted-glass', !frostedEnabled);
          if (document.body) {
            document.body.style.backgroundColor = frostedEnabled ? 'transparent' : '#090b10';
          }
        }
        setBackupMsg({ text: 'Backup imported successfully! Manifest, media, and settings restored.' });
        if (onReloadSounds) await onReloadSounds();
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
        currentVersion: '1.6.2',
        error: e?.message || 'Failed to check updates.',
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSave = () => {
    if (localSettings.videoClipDuration) {
      videoClipper.setDuration(localSettings.videoClipDuration);
    }
    const finalTheme = getTheme(localSettings.theme, localSettings.accentColor);
    applyThemeToDom(finalTheme);
    if (window.soundboardAPI?.sendIpcCommand) {
      window.soundboardAPI.sendIpcCommand('sync-settings-changed', localSettings);
    }
    onSaveSettings(localSettings, true);
    onClose();
  };

  const handleClose = () => {
    const originalTheme = getTheme(localSettings.theme, localSettings.accentColor);
    applyThemeToDom(originalTheme);
    onClose();
  };

  const virtualOutput = outputDevices.find(
    (d) =>
      d.label.toLowerCase().includes('cable input') ||
      d.label.toLowerCase().includes('vb-audio') ||
      d.label.toLowerCase().includes('voicemod')
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex overflow-hidden h-[680px] max-h-[92vh] transition-all duration-150"
      >
        {/* Left Navigation Sidebar */}
        <aside className="w-64 min-w-[256px] frosted-modal-chrome bg-white/[0.03] border-r border-white/[0.08] flex flex-col justify-between p-5 select-none">
          <div className="space-y-6">
            {/* Header: Logo and App Title */}
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shadow-sm">
                <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain" />
              </div>
              <div>
                <h2 className="text-[14px] font-black tracking-wide text-theme-primary flex items-center gap-1.5">
                  PRISM <span style={{ color: accent }}>SETTINGS</span>
                </h2>
                <span className="text-[10px] font-mono font-bold text-theme-muted">v1.6.2</span>
              </div>
            </div>

            {/* Navigation Category Groups */}
            <nav className="space-y-5">
              {/* Group 1: Audio & Voice */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  Audio & Voice
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('devices')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-all cursor-pointer ${
                    activeTab === 'devices'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Radio
                    size={16}
                    style={activeTab === 'devices' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Audio Devices</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('voice')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-all cursor-pointer ${
                    activeTab === 'voice'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Mic
                    size={16}
                    style={activeTab === 'voice' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Voice & Noise Gate</span>
                </button>
              </div>

              {/* Group 2: Controls */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  Controls & Keys
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('hotkeys')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-all cursor-pointer ${
                    activeTab === 'hotkeys'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Sliders
                    size={16}
                    style={activeTab === 'hotkeys' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Global Hotkeys</span>
                </button>
              </div>

              {/* Group 3: Appearance & Style */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  Appearance & Style
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('theme')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-all cursor-pointer ${
                    activeTab === 'theme'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Palette
                    size={16}
                    style={activeTab === 'theme' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Theme & Palette</span>
                </button>
              </div>

              {/* Group 4: Data & Updates */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  System & Storage
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('backup')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-all cursor-pointer ${
                    activeTab === 'backup'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <FolderOpen
                    size={16}
                    style={activeTab === 'backup' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Backup & Storage</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('updates')}
                  className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center justify-between transition-all cursor-pointer ${
                    activeTab === 'updates'
                      ? 'bg-white/[0.08] text-white'
                      : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RefreshCw
                      size={16}
                      style={activeTab === 'updates' ? { color: accent } : undefined}
                      className={`flex-shrink-0 ${isCheckingUpdate ? 'animate-spin' : ''}`}
                    />
                    <span>Updates</span>
                  </div>
                  {updateResult?.hasUpdate && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>
              </div>
            </nav>
          </div>

          {/* Sidebar Footer Info */}
          <div className="px-3 pt-4 border-t border-white/[0.08] flex flex-col gap-1">
            <span className="text-[11px] font-medium text-theme-muted">Prism Soundboard</span>
            <span className="text-[10px] text-theme-muted/70">Production Release</span>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 flex flex-col bg-transparent overflow-hidden">
          {/* Main Top Header */}
          <header className="h-16 px-8 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome bg-white/[0.025] shrink-0">
            <div>
              <h3 className="text-[15px] font-bold text-theme-primary tracking-wide">
                {activeTab === 'devices' && 'Audio Devices & Routing'}
                {activeTab === 'voice' && 'Microphone & Noise Gate'}
                {activeTab === 'hotkeys' && 'Global Shortcuts & Keybindings'}
                {activeTab === 'theme' && 'Themes & Color Palette'}
                {activeTab === 'backup' && 'Backup, Storage & Maintenance'}
                {activeTab === 'updates' && 'Application Updates'}
              </h3>
              <p className="text-[11px] text-theme-muted">
                {activeTab === 'devices' && 'Configure physical microphones, headsets, and virtual cables'}
                {activeTab === 'voice' && 'Real-time VU meter, sensitivity threshold, and voice projection'}
                {activeTab === 'hotkeys' && 'Set global hotkeys for instant replay, overlay HUD, and panic stop'}
                {activeTab === 'theme' && 'Personalize UI palettes, choose dark themes, and customize accent colors'}
                {activeTab === 'backup' && 'Manage your sounds directory, export backups, and recycle bin'}
                {activeTab === 'updates' && 'Check for updates and automatically install the latest release'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-theme-secondary hover:text-theme-primary flex items-center justify-center transition-colors cursor-pointer"
              title="Close Settings (Esc)"
            >
              <X size={15} />
            </button>
          </header>

          {/* Scrollable Settings Panel */}
          <div className="flex-1 overflow-y-auto p-8 space-y-5 bg-transparent">
            {/* TAB 1: AUDIO DEVICES */}
            {activeTab === 'devices' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Virtual Microphone Status Banner */}
                {virtualOutput ? (
                  <div className="pb-5 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                      <div>
                        <h4 className="text-[13px] font-bold text-theme-primary flex items-center gap-2">
                          <span>Virtual Microphone Ready</span>
                          <span className="text-[11px] text-emerald-400 font-medium">
                            · Connected
                          </span>
                        </h4>
                        <p className="text-[11.5px] text-theme-muted mt-0.5">
                          Routing through <span className="text-theme-secondary font-semibold">{virtualOutput.label}</span>. In Discord or games, choose <span className="text-theme-primary font-medium">CABLE Output</span> as your microphone.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={refreshDevices}
                      title="Refresh audio devices"
                      className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="pb-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 mt-0.5">
                        <AlertTriangle size={20} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-[13.5px] font-bold text-theme-primary">
                          Virtual Audio Cable Driver Required
                        </h4>
                        <p className="text-[11.5px] text-theme-secondary leading-relaxed mt-0.5">
                          Windows requires the virtual audio pipe so Discord, Steam, TeamSpeak, and games can hear your soundboard audio as a microphone.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleInstallDriver}
                        disabled={installingDriver}
                        style={{ backgroundColor: accent }}
                        className="px-4 py-2 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        <Download size={14} />
                        <span>{installingDriver ? 'Installing Driver...' : '1-Click Install Virtual Microphone'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={refreshDevices}
                        className="px-3.5 py-2 rounded-xl text-[11.5px] font-semibold text-theme-secondary hover:text-theme-primary bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-colors cursor-pointer"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                )}

                {/* 1. PHYSICAL MICROPHONE */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Mic size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">1. Physical Microphone (Voice Input)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <ShieldCheck size={12} /> Anti-Loop Active
                      </span>
                      <div className="flex items-center gap-2 select-none">
                        <span className="text-[11.5px] font-semibold text-theme-secondary">
                          Pass-Through
                        </span>
                        <ToggleSwitch
                          checked={localSettings.isMicPassThroughEnabled !== false}
                          onChange={(checked) =>
                            setLocalSettings((prev) => ({ ...prev, isMicPassThroughEnabled: checked }))
                          }
                          accent={accent}
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-[11.5px] text-theme-muted">
                    Your real headset or desktop microphone. Pass-through feeds your real voice directly into the virtual cable alongside soundboard sounds.
                  </p>

                  <select
                    value={localSettings.inputDeviceId}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, inputDeviceId: e.target.value }))
                    }
                    className="w-full p-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12.5px] text-theme-primary focus:outline-none focus:border-accent/50 transition-colors cursor-pointer"
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
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Headphones size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">2. Your Headphones (Personal Monitor)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTestAudio(localSettings.primaryDeviceId)}
                      className="px-3.5 py-1.5 rounded-xl text-[11.5px] font-bold bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-theme-primary flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Play size={11} className="fill-current" style={{ color: accent }} /> Test Audio
                    </button>
                  </div>

                  <p className="text-[11.5px] text-theme-muted">
                    Where YOU hear the sounds playing. Usually your main headset or speakers.
                  </p>

                  <select
                    value={localSettings.primaryDeviceId}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, primaryDeviceId: e.target.value }))
                    }
                    className="w-full p-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12.5px] text-theme-primary focus:outline-none focus:border-accent/50 transition-colors cursor-pointer"
                  >
                    <option value="">Default Speakers (Windows System Default)</option>
                    {outputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speakers (${d.deviceId.slice(0, 8)})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. VIRTUAL CABLE (MICROPHONE PROJECTION) */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Radio size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">3. Virtual Cable (Microphone Projection)</span>
                    </div>
                    <div className="flex items-center gap-2 select-none">
                      <span className="text-[11.5px] font-semibold text-theme-secondary">
                        Enable Projection
                      </span>
                      <ToggleSwitch
                        checked={localSettings.isSecondaryEnabled}
                        onChange={(checked) =>
                          setLocalSettings((prev) => ({ ...prev, isSecondaryEnabled: checked }))
                        }
                        accent={accent}
                      />
                    </div>
                  </div>

                  <p className="text-[11.5px] text-theme-muted">
                    Where OTHERS hear the sounds. Directs audio into games, Discord, and streaming apps.
                  </p>

                  <select
                    value={localSettings.secondaryDeviceId}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, secondaryDeviceId: e.target.value }))
                    }
                    className="w-full p-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12.5px] text-theme-primary focus:outline-none focus:border-accent/50 transition-colors cursor-pointer"
                  >
                    <option value="">Select Virtual Output Cable...</option>
                    {outputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Output Device (${d.deviceId.slice(0, 8)})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* TAB 2: VOICE & NOISE GATE */}
            {activeTab === 'voice' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Real-Time Microphone VU Meter Card */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary font-bold text-[13.5px]">
                      <Mic size={17} style={{ color: accent }} />
                      <span>Live Microphone Input Meter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          isGateOpen ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {isGateOpen ? '● Gate open' : '● Gate muted'}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-theme-secondary">
                        {rawDb > -99 ? `${Math.round(rawDb)} dB` : '-∞ dB'}
                      </span>
                    </div>
                  </div>

                  {/* VU Level Bar */}
                  <div className="w-full h-3 bg-black/35 rounded-full overflow-hidden border border-white/[0.08] relative p-0.5">
                    <div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${Math.min(100, Math.max(0, micLevel * 100))}%`,
                        backgroundColor: accent,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-theme-muted">
                    Speak into your microphone to verify level detection and noise threshold calibration.
                  </p>
                </div>

                {/* Voice Volume Boost */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-theme-primary font-bold text-[13.5px]">
                      <Volume2 size={17} style={{ color: localSettings.micInputVolume > 100 ? '#f59e0b' : accent }} />
                      <span>Mic Gain & Projection</span>
                    </div>
                    <span
                      className={`font-mono text-[12px] font-semibold tabular-nums ${
                        localSettings.micInputVolume > 100 ? 'text-amber-400' : 'text-accent'
                      }`}
                    >
                      {localSettings.micInputVolume}%
                    </span>
                  </div>

                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={localSettings.micInputVolume}
                    onChange={(vol) => {
                      setLocalSettings((prev) => ({ ...prev, micInputVolume: vol }));
                      audioEngine.setMicInputVolume(vol);
                    }}
                    fillColor={localSettings.micInputVolume > 100 ? '#f59e0b' : accent}
                  />
                  <p className="text-[11px] text-theme-muted">
                    Controls how loud your voice is projected to other players through the virtual microphone cable.
                  </p>
                </div>

                {/* Noise Gate */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13.5px] font-bold text-theme-primary">Microphone Noise Gate</h4>
                      <p className="text-[11.5px] text-theme-muted">
                        Silences background keyboard clicks and fan hum below the selected threshold
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={localSettings.isNoiseGateEnabled || false}
                      onChange={(checked) => {
                        setLocalSettings((prev) => ({ ...prev, isNoiseGateEnabled: checked }));
                        audioEngine.setNoiseGateEnabled(checked);
                      }}
                      accent={accent}
                    />
                  </div>

                  {localSettings.isNoiseGateEnabled && (
                    <div className="pt-2 border-t border-theme space-y-2.5">
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-theme-secondary font-semibold">Gate Threshold</span>
                        <span className="font-mono font-bold text-accent">{localSettings.noiseGateThreshold || -39} dB</span>
                      </div>
                      <Slider
                        min={-70}
                        max={-10}
                        step={1}
                        value={localSettings.noiseGateThreshold || -39}
                        onChange={(val) => {
                          setLocalSettings((prev) => ({ ...prev, noiseGateThreshold: val }));
                          audioEngine.setNoiseGateThreshold(val);
                        }}
                        fillColor={accent}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: SHORTCUTS & HOTKEYS */}
            {activeTab === 'hotkeys' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Quick Instant Replay Audio Clip Recording */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Clapperboard size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">Audio Clip Shortcut (Instant Replay)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (recordingRecordClip) {
                          setRecordingRecordClip(false);
                        } else {
                          setRecordingRecordClip(true);
                          setRecordingVideoClip(false);
                          setRecordingPanic(false);
                          setRecordingOverlay(false);
                          setRecordingRepeatLast(false);
                        }
                      }}
                      style={
                        recordingRecordClip
                          ? { backgroundColor: accent, borderColor: accent }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-mono border transition-all cursor-pointer ${
                        recordingRecordClip
                          ? 'animate-pulse font-extrabold shadow-md text-black'
                          : 'bg-white/[0.04] text-theme-primary border-white/[0.1] hover:border-accent/50'
                      }`}
                    >
                      {recordingRecordClip ? 'Press any Key...' : localSettings.recordHotkey || 'F9'}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Instantly snips the last {localSettings.recordDuration || 5} seconds of audio directly into your soundboard.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">
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
                        className="w-full p-2.5 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12px] text-theme-primary focus:outline-none focus:border-accent/50 cursor-pointer transition-colors"
                      >
                        <option value={3}>Last 3 Seconds</option>
                        <option value={5}>Last 5 Seconds</option>
                        <option value={10}>Last 10 Seconds</option>
                        <option value={15}>Last 15 Seconds</option>
                        <option value={30}>Last 30 Seconds</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">
                        Recording Source
                      </label>
                      <div className="w-full p-2.5 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12px] text-theme-primary flex items-center justify-between">
                        <span className="font-semibold text-theme-primary">Screen + Mic Combined</span>
                        <span className="text-[11px] text-accent font-medium">Active</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Screen Video Clipping Shortcut */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Video size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">Screen Video Clip Shortcut (Medal-like)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (recordingVideoClip) {
                          setRecordingVideoClip(false);
                        } else {
                          setRecordingVideoClip(true);
                          setRecordingRecordClip(false);
                          setRecordingPanic(false);
                          setRecordingOverlay(false);
                          setRecordingRepeatLast(false);
                        }
                      }}
                      style={
                        recordingVideoClip
                          ? { backgroundColor: accent, borderColor: accent }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-mono border transition-all cursor-pointer ${
                        recordingVideoClip
                          ? 'animate-pulse font-extrabold shadow-md text-black'
                          : 'bg-white/[0.04] text-theme-primary border-white/[0.1] hover:border-accent/50'
                      }`}
                    >
                      {recordingVideoClip ? 'Press any Key...' : localSettings.videoClipHotkey || 'F10'}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Captures the last {localSettings.videoClipDuration || 30} seconds of screen and game video into your Videos library.
                  </p>

                  <div className="w-1/2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1.5">
                      Video Clip Duration
                    </label>
                    <select
                      value={localSettings.videoClipDuration || 30}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 30;
                        setLocalSettings((prev) => ({
                          ...prev,
                          videoClipDuration: val,
                        }));
                        videoClipper.setDuration(val);
                      }}
                      className="w-full p-2.5 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12px] text-theme-primary focus:outline-none focus:border-accent/50 cursor-pointer transition-colors"
                    >
                      <option value={15}>Last 15 Seconds</option>
                      <option value={30}>Last 30 Seconds</option>
                      <option value={45}>Last 45 Seconds</option>
                      <option value={60}>Last 60 Seconds</option>
                    </select>
                  </div>
                </div>

                {/* Stop All Panic Hotkey */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Sliders size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">Stop All Sounds (Panic Key)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (recordingPanic) {
                          setRecordingPanic(false);
                        } else {
                          setRecordingPanic(true);
                          setRecordingOverlay(false);
                          setRecordingRecordClip(false);
                          setRecordingVideoClip(false);
                          setRecordingRepeatLast(false);
                        }
                      }}
                      style={
                        recordingPanic
                          ? { backgroundColor: accent, borderColor: accent }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-mono border transition-all cursor-pointer ${
                        recordingPanic
                          ? 'animate-pulse font-extrabold shadow-md text-black'
                          : 'bg-white/[0.04] text-theme-primary border-white/[0.1] hover:border-accent/50'
                      }`}
                    >
                      {recordingPanic ? 'Press any Key...' : localSettings.panicHotkey || 'Esc'}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Instantly terminates all active sound playback and clears queue.
                  </p>
                </div>

                {/* Repeat Last Sound Hotkey */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <RotateCcw size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">Repeat Last Sound Hotkey</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (recordingRepeatLast) {
                          setRecordingRepeatLast(false);
                        } else {
                          setRecordingRepeatLast(true);
                          setRecordingPanic(false);
                          setRecordingOverlay(false);
                          setRecordingRecordClip(false);
                          setRecordingVideoClip(false);
                        }
                      }}
                      style={
                        recordingRepeatLast
                          ? { backgroundColor: accent, borderColor: accent }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-mono border transition-all cursor-pointer ${
                        recordingRepeatLast
                          ? 'animate-pulse font-extrabold shadow-md text-black'
                          : 'bg-white/[0.04] text-theme-primary border-white/[0.1] hover:border-accent/50'
                      }`}
                    >
                      {recordingRepeatLast ? 'Press any Key...' : localSettings.repeatLastHotkey || 'F7'}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Instantly replays the most recently triggered sound with a single keypress.
                  </p>
                </div>

                {/* In-Game Overlay HUD Hotkey */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Sliders size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">In-Game Overlay Hotkey</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (recordingOverlay) {
                          setRecordingOverlay(false);
                        } else {
                          setRecordingOverlay(true);
                          setRecordingPanic(false);
                          setRecordingRecordClip(false);
                          setRecordingVideoClip(false);
                          setRecordingRepeatLast(false);
                        }
                      }}
                      style={
                        recordingOverlay
                          ? { backgroundColor: accent, borderColor: accent }
                          : undefined
                      }
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-mono border transition-all cursor-pointer ${
                        recordingOverlay
                          ? 'animate-pulse font-extrabold shadow-md text-black'
                          : 'bg-white/[0.04] text-theme-primary border-white/[0.1] hover:border-accent/50'
                      }`}
                    >
                      {recordingOverlay ? 'Press any Key...' : localSettings.overlayHotkey || 'F8'}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Pops up the interactive soundboard HUD directly over full-screen games without alt-tabbing.
                  </p>
                </div>

                {/* Startup & System Tray Behavior */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-4">
                  <div className="flex items-center gap-2.5 text-theme-primary">
                    <Power size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Startup & Background Behavior</span>
                  </div>

                  {/* Option: Start on Boot */}
                  <div className="flex items-center justify-between select-none">
                    <div className="space-y-0.5">
                      <span className="text-[13px] font-semibold text-theme-primary">
                        Start on Windows Boot
                      </span>
                      <p className="text-[11.5px] text-theme-muted">
                        Automatically launch Prism Soundboard when Windows starts up.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={localSettings.startOnBoot || false}
                      onChange={(checked) => setLocalSettings({ ...localSettings, startOnBoot: checked })}
                      accent={accent}
                    />
                  </div>

                  {/* Option: Start in Tray */}
                  <div className="flex items-center justify-between select-none pt-3 border-t border-theme">
                    <div className="space-y-0.5">
                      <span className="text-[13px] font-semibold text-theme-primary">
                        Start Minimized to System Tray
                      </span>
                      <p className="text-[11.5px] text-theme-muted">
                        Keep the main window hidden on launch and run silently in the taskbar notification tray.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={localSettings.startInTray || false}
                      onChange={(checked) => setLocalSettings({ ...localSettings, startInTray: checked })}
                      accent={accent}
                    />
                  </div>

                  {/* Option: Minimize to Tray on Close */}
                  <div className="flex items-center justify-between select-none pt-3 border-t border-theme">
                    <div className="space-y-0.5">
                      <span className="text-[13px] font-semibold text-theme-primary">
                        Minimize to System Tray on Close (X)
                      </span>
                      <p className="text-[11.5px] text-theme-muted">
                        Closing the window keeps the soundboard running in the background for global hotkeys.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={localSettings.minimizeToTray !== false}
                      onChange={(checked) => setLocalSettings({ ...localSettings, minimizeToTray: checked })}
                      accent={accent}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: THEMES & COLOR PALETTES */}
            {activeTab === 'theme' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Themes Grid */}
                <div className="pb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13.5px] font-bold text-theme-primary">
                      Active Theme
                    </h4>
                    <span className="text-[11px] text-theme-muted">
                      Slate Dark studio palette
                    </span>
                  </div>

                  <div className="space-y-2">
                    {THEMES.map((t) => {
                      const isSelected = (localSettings.theme || 'dark') === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            const newTheme = getTheme(t.id, t.accent);
                            const updated = {
                              ...localSettings,
                              theme: t.id,
                              accentColor: t.accent,
                            };
                            setLocalSettings(updated);
                            applyThemeToDom(newTheme);
                            if (window.soundboardAPI?.sendIpcCommand) {
                              window.soundboardAPI.sendIpcCommand('sync-settings-changed', updated);
                            }
                          }}
                          className="py-2.5 px-3 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer flex items-center justify-between gap-4 select-none"
                        >
                          <div className="min-w-0">
                            <span className="text-[13px] font-semibold text-theme-primary">
                              {t.name}
                            </span>
                            <p className="text-[11.5px] text-theme-muted mt-0.5">
                              {t.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-4 h-4 rounded border border-white/15"
                                style={{ backgroundColor: t.bgApp }}
                                title="Background"
                              />
                              <span
                                className="w-4 h-4 rounded border border-white/15"
                                style={{ backgroundColor: t.bgSurface }}
                                title="Surface"
                              />
                              <span
                                className="w-4 h-4 rounded border border-white/15"
                                style={{ backgroundColor: t.bgCard }}
                                title="Cards"
                              />
                            </div>

                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent text-black'
                                  : 'border-white/20 hover:border-white/40'
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Accent Color Customization Card */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13.5px] font-bold text-theme-primary">
                        Accent Color Override
                      </h4>
                      <p className="text-[11.5px] text-theme-muted mt-0.5">
                        Fine-tune the active theme's accent highlight or pick a custom color.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const baseTheme = THEMES.find((t) => t.id === localSettings.theme) || THEMES[0];
                        const defaultAccent = baseTheme.accent;
                        const restored = getTheme(localSettings.theme, defaultAccent);
                        const updated = {
                          ...localSettings,
                          accentColor: defaultAccent,
                        };
                        setLocalSettings(updated);
                        applyThemeToDom(restored);
                        if (window.soundboardAPI?.sendIpcCommand) {
                          window.soundboardAPI.sendIpcCommand('sync-settings-changed', updated);
                        }
                      }}
                      className="text-[11px] font-semibold text-theme-secondary hover:text-theme-primary px-2.5 py-1 rounded-lg border border-theme bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      Reset Default Accent
                    </button>
                  </div>

                  {/* Accent Swatches & Color Picker */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {[
                      { name: 'Titanium Silver', color: '#e4e4e7' },
                      { name: 'Golden Amber', color: '#f59e0b' },
                      { name: 'Sage Emerald', color: '#10b981' },
                      { name: 'Amethyst Purple', color: '#a855f7' },
                      { name: 'Ruby Crimson', color: '#f43f5e' },
                      { name: 'Pure White', color: '#ffffff' },
                      { name: 'Prism Cyan', color: '#31C5F4' },
                    ].map((swatch) => {
                      const isActive = accent.toLowerCase() === swatch.color.toLowerCase();
                      return (
                        <button
                          key={swatch.color}
                          type="button"
                          onClick={() => {
                            const updatedTheme = getTheme(localSettings.theme, swatch.color);
                            const updated = {
                              ...localSettings,
                              accentColor: swatch.color,
                            };
                            setLocalSettings(updated);
                            applyThemeToDom(updatedTheme);
                            if (window.soundboardAPI?.sendIpcCommand) {
                              window.soundboardAPI.sendIpcCommand('sync-settings-changed', updated);
                            }
                          }}
                          title={swatch.name}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative shadow-sm ${
                            isActive
                              ? 'ring-2 ring-white scale-110'
                              : 'hover:scale-105 opacity-85 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: swatch.color }}
                        >
                          {isActive && (
                            <Check
                              size={14}
                              className={swatch.color === '#ffffff' || swatch.color === '#e4e4e7' ? 'text-black stroke-[3]' : 'text-white stroke-[3]'}
                            />
                          )}
                        </button>
                      );
                    })}

                    {/* Custom HTML Color Picker */}
                    <label
                      title="Choose Custom Color"
                      className="h-9 px-3 rounded-xl border border-theme bg-white/[0.04] hover:bg-white/[0.08] flex items-center gap-2 cursor-pointer transition-all text-[11.5px] font-medium text-theme-secondary hover:text-theme-primary"
                    >
                      <input
                        type="color"
                        value={accent}
                        onChange={(e) => {
                          const customHex = e.target.value;
                          const updatedTheme = getTheme(localSettings.theme, customHex);
                          const updated = {
                            ...localSettings,
                            accentColor: customHex,
                          };
                          setLocalSettings(updated);
                          applyThemeToDom(updatedTheme);
                          if (window.soundboardAPI?.sendIpcCommand) {
                            window.soundboardAPI.sendIpcCommand('sync-settings-changed', updated);
                          }
                        }}
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span>Custom Color</span>
                    </label>
                  </div>
                </div>

                {/* Frosted Glass Acrylic Toggle */}
                <div className="py-5 first:pt-0 last:pb-0 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold text-theme-primary">Frosted Glass Effects</span>
                    </div>
                    <p className="text-[11.5px] text-theme-muted">
                      Enable translucent frosted glass and Windows 11 acrylic backdrop blur
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={localSettings.enableFrostedGlass !== false}
                    onChange={(checked) => {
                      const updated = { ...localSettings, enableFrostedGlass: checked };
                      setLocalSettings(updated);
                      document.documentElement.classList.toggle('no-frosted-glass', !checked);
                      if (document.body) {
                        document.body.style.backgroundColor = checked ? 'transparent' : '#090b10';
                      }
                      onSaveSettings(updated, true);
                      if (window.soundboardAPI?.sendIpcCommand) {
                        window.soundboardAPI.sendIpcCommand('sync-settings-changed', updated);
                        window.soundboardAPI.sendIpcCommand('set-frosted-glass-enabled', checked);
                      }
                    }}
                    accent={accent}
                  />
                </div>
              </div>
            )}

            {/* TAB 4: BACKUP & STORAGE */}
            {activeTab === 'backup' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Unified Media Storage Location */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <FolderOpen size={17} style={{ color: accent }} />
                      <span className="text-[13.5px] font-bold">Media & Clips Storage Location</span>
                    </div>
                    <button
                      type="button"
                      disabled={isRelocatingStorage}
                      onClick={handleChangeStorageFolder}
                      className="px-3.5 py-1.5 rounded-xl border border-accent/40 bg-accent-soft text-accent text-[11.5px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isRelocatingStorage ? 'Relocating...' : 'Change Location'}
                    </button>
                  </div>

                  <p className="text-[11.5px] text-theme-muted leading-relaxed">
                    Choose a root folder on your PC. Prism automatically manages <span className="font-mono text-theme-primary">/Sounds</span> and <span className="font-mono text-theme-primary">/Videos</span> inside it. Changing this location automatically relocates all files!
                  </p>

                  {storagePaths && (
                    <div className="p-3 bg-white/[0.04] rounded-xl border border-white/[0.08] space-y-1 font-mono text-[11.5px]">
                      <div className="text-theme-primary truncate">
                        <span className="text-theme-muted">Root: </span>{storagePaths.root}
                      </div>
                      <div className="text-theme-secondary text-[10.5px] flex items-center gap-4">
                        <span>• {storagePaths.sounds}</span>
                        <span>• {storagePaths.videos}</span>
                      </div>
                    </div>
                  )}

                  {storageRelocateMsg && (
                    <div
                      className={`p-3 rounded-xl text-[12px] font-semibold border ${
                        storageRelocateMsg.error
                          ? 'bg-red-500/15 border-red-500/30 text-red-400'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      }`}
                    >
                      {storageRelocateMsg.text}
                    </div>
                  )}
                </div>

                {/* Soundboard Backup */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center gap-2.5 text-theme-primary">
                    <DownloadCloud size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Soundboard Full Library Backup (.prism)</span>
                  </div>
                  <p className="text-[11.5px] text-theme-muted leading-relaxed">
                    Export all your sounds, audio files, game video clips, and keybind settings into a single bundled <span className="font-mono font-bold" style={{ color: accent }}>.prism</span> archive or restore one on any PC.
                  </p>

                  {backupMsg && (
                    <div
                      className={`p-3 rounded-xl text-[12px] font-semibold border ${
                        backupMsg.error
                          ? 'bg-red-500/15 border-red-500/30 text-red-400'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      }`}
                    >
                      {backupMsg.text}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleBackupExport}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] hover:border-accent/40 text-theme-primary text-[12px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <DownloadCloud size={15} style={{ color: accent }} />
                      <span>Export Backup Archive</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleBackupImport}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] hover:border-accent/40 text-theme-primary text-[12px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <UploadCloud size={15} style={{ color: accent }} />
                      <span>Import Backup Archive</span>
                    </button>
                  </div>
                </div>

                {/* Deleted Sounds Archive */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center gap-2.5 text-theme-primary">
                    <FolderOpen size={17} style={{ color: accent }} />
                    <span className="text-[13.5px] font-bold">Recycle Bin & Archive Folder</span>
                  </div>
                  <p className="text-[11.5px] text-theme-muted">
                    Deleted sounds are safely moved to the archive directory so you can restore them anytime without losing files.
                  </p>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.soundboardAPI?.openSoundsDirectory) {
                          window.soundboardAPI.openSoundsDirectory();
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] hover:border-accent/40 text-theme-primary text-[12px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <FolderOpen size={14} style={{ color: accent }} />
                      <span>Open Sounds Folder in Explorer</span>
                    </button>

                    {deletedCount > 0 && onOpenDeletedArchive && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDeletedArchive();
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-soft border border-accent/40 text-accent text-[12px] font-bold transition-all cursor-pointer shadow-sm hover:brightness-110 active:scale-95"
                      >
                        <span>Restore Deleted ({deletedCount})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Library Clear */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-theme-primary">
                      <Trash2 size={17} className="text-red-400" />
                      <span className="text-[13.5px] font-bold">Sound Library Management</span>
                    </div>
                    {sounds && sounds.length > 0 && (
                      <span className="text-[11.5px] font-mono text-slate-400 tabular-nums">
                        {sounds.length} {sounds.length === 1 ? 'sound' : 'sounds'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-theme-muted leading-relaxed">
                    Clear all sounds from your active library. You will have the option to save a full backup before clearing.
                  </p>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenClearAllModal) {
                          onClose();
                          onOpenClearAllModal();
                        }
                      }}
                      disabled={!sounds || sounds.length === 0}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-[12px] font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                      <span>Clear All Sounds ({sounds?.length || 0})</span>
                    </button>
                  </div>
                </div>

                {/* Danger Zone: Factory Reset */}
                <div className="py-5 last:pb-0 space-y-3.5">
                  <div className="flex items-center gap-2.5 text-red-400">
                    <AlertTriangle size={17} />
                    <span className="text-[13.5px] font-bold">Danger Zone: Full Factory Reset</span>
                  </div>
                  <p className="text-[11.5px] text-theme-muted leading-relaxed">
                    Permanently deletes all saved sounds, audio files, video clips, and configuration settings, restoring Prism to an absolute fresh state.
                  </p>

                  {showResetConfirm ? (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
                      <p className="text-[12px] font-bold text-red-400">
                        Are you completely sure? This will delete EVERYTHING and restart the app!
                      </p>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={handleFactoryReset}
                          disabled={isResettingApp}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[12px] transition-all cursor-pointer shadow-lg disabled:opacity-50"
                        >
                          {isResettingApp ? 'Resetting Everything...' : 'Yes, Delete Everything'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowResetConfirm(false)}
                          disabled={isResettingApp}
                          className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-theme-primary text-[12px] font-medium transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-[12px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
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
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* App Version & Checker Card */}
                <div className="py-5 first:pt-0 last:pb-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center shadow-sm">
                        <img src={prismLogo} alt="Prism" className="w-6 h-6 object-contain drop-shadow" />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-theme-primary flex items-center gap-2">
                          <span>Prism Soundboard</span>
                          <span className="text-[12px] text-accent font-mono font-medium">v1.6.2</span>
                        </h4>
                        <p className="text-[11.5px] text-theme-muted">
                          Direct GitHub releases update channel (fafaidot/Prism-Soundboard)
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckUpdates}
                      disabled={isCheckingUpdate}
                      style={{ backgroundColor: accent }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
                      <span>{isCheckingUpdate ? 'Checking GitHub...' : 'Check for Updates'}</span>
                    </button>
                  </div>

                  {/* Results Section */}
                  {updateResult && (
                    <div className="pt-2">
                      {updateResult.hasUpdate ? (
                        <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Sparkles size={18} className="text-emerald-400" />
                              <span className="text-[13px] font-bold text-theme-primary">
                                New Update Available: {updateResult.latestVersion}
                              </span>
                            </div>
                            {updateResult.downloadUrl && (
                              <button
                                type="button"
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
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 text-black text-[11.5px] font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-md"
                              >
                                <Download size={13} />
                                <span>{isDownloadingUpdate ? 'Downloading...' : 'Update & Restart'}</span>
                              </button>
                            )}
                          </div>

                          {/* In-app download progress bar */}
                          {isDownloadingUpdate && (
                            <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-2">
                              <div className="flex items-center justify-between text-[11.5px]">
                                <span className="text-theme-primary font-medium flex items-center gap-1.5">
                                  <RefreshCw size={12} className="animate-spin text-emerald-400" />
                                  <span>Downloading update...</span>
                                </span>
                                <span className="text-emerald-400 font-mono font-bold">
                                  {downloadProgressPercent}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all duration-150"
                                  style={{ width: `${downloadProgressPercent}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-theme-muted">
                                {downloadProgressPercent >= 100
                                  ? 'Launching installer and updating Prism Soundboard...'
                                  : 'Downloading directly in background — the installer will launch automatically.'}
                              </p>
                            </div>
                          )}

                          {downloadError && (
                            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-[11.5px]">
                              {downloadError}
                            </div>
                          )}

                          {updateResult.releaseNotes && (
                            <div className="p-3 bg-black/30 rounded-xl text-[11.5px] text-theme-secondary max-h-36 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-white/5">
                              {updateResult.releaseNotes}
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-[11px] text-theme-muted">
                            <span>Current: v{updateResult.currentVersion}</span>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.soundboardAPI?.openExternal && updateResult.releaseUrl) {
                                  window.soundboardAPI.openExternal(updateResult.releaseUrl);
                                }
                              }}
                              className="flex items-center gap-1 hover:text-theme-primary transition-colors cursor-pointer underline"
                            >
                              <span>View Release on GitHub</span>
                              <ExternalLink size={11} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-white/[0.04] rounded-2xl border border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 size={18} className="text-emerald-400" />
                            <div>
                              <span className="text-[12.5px] font-bold text-theme-primary">
                                {updateResult.error ? 'Could not reach GitHub' : "You're up to date!"}
                              </span>
                              <p className="text-[11px] text-theme-muted mt-0.5">
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
                              type="button"
                              onClick={() => {
                                if (window.soundboardAPI?.openExternal) {
                                  window.soundboardAPI.openExternal(`https://github.com/${updateResult.owner}/${updateResult.repo}/releases`);
                                }
                              }}
                              className="flex items-center gap-1.5 text-[11px] text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
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
                <div className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <h4 className="text-[13px] font-bold text-theme-primary">GitHub Repository Source</h4>
                  <p className="text-[11.5px] text-theme-muted">
                    Target repository used to query GitHub Releases for new updates
                  </p>

                  <div className="pt-1">
                    <input
                      type="text"
                      disabled
                      value="fafaidot/Prism-Soundboard"
                      className="w-full max-w-md px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] rounded-xl text-[12.5px] text-accent font-mono focus:outline-none cursor-default"
                    />
                    <p className="text-[10.5px] text-theme-muted mt-1.5">
                      Target repository: <code className="text-theme-primary/80">fafaidot/Prism-Soundboard</code>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Clean Footer Bar */}
          <footer className="h-16 px-8 border-t border-white/[0.08] flex items-center justify-between frosted-modal-chrome bg-white/[0.025] shrink-0">
            <div className="flex items-center gap-2 text-[11.5px] text-theme-muted">
              <span>Prism Soundboard v1.6.2</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('updates');
                  handleCheckUpdates();
                }}
                className="hover:text-accent transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw size={11} className={isCheckingUpdate ? 'animate-spin text-accent' : ''} />
                <span>Check for Updates</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  backgroundColor: accent,
                }}
                className="px-6 py-2 rounded-xl text-[12px] font-bold text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
              >
                Save Settings
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};
