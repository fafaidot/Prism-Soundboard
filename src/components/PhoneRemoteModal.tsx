import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Wifi,
  Globe,
  Users,
  Lock,
  Unlock,
  Copy,
  Check,
  RefreshCw,
  Share2,
  Sliders,
  Trash2,
  AlertTriangle,
  Activity,
  Square,
  Volume2,
} from 'lucide-react';
import {
  AudioSettings,
  RemoteServerStatus,
  RemoteGuestPermissions,
  RemoteConnectedDevice,
  ActivePlaybackEntry,
} from '../types';
import { getTheme } from '../themes';

interface PhoneRemoteModalProps {
  isOpen: boolean;
  settings: AudioSettings;
  onClose: () => void;
  onSaveSettings: (settings: AudioSettings, immediate?: boolean) => void;
}

const DEFAULT_GUEST_PERMS: RemoteGuestPermissions = {
  canStopAll: false,
  canControlVolume: false,
  canEditSounds: false,
  canDeleteSounds: false,
  canAddSounds: false,
  canAudioClip: false,
  canVideoClip: false,
};

const DEFAULT_PERMISSION_ITEMS: Array<{ key: keyof RemoteGuestPermissions; label: string }> = [
  { key: 'canStopAll', label: 'Stop All / Pause Sounds' },
  { key: 'canControlVolume', label: 'Soundboard Volume Slider' },
  { key: 'canAddSounds', label: 'Add Sounds (YouTube / Upload)' },
  { key: 'canAudioClip', label: 'Capture Audio Clips' },
  { key: 'canVideoClip', label: 'Capture & Watch Video Clips' },
  { key: 'canEditSounds', label: 'Edit Properties (Vol / Speed / Title)' },
  { key: 'canDeleteSounds', label: 'Delete Sounds & Clips' },
];

const DEVICE_PERMISSION_ITEMS: Array<{ key: keyof RemoteGuestPermissions; label: string }> = [
  { key: 'canStopAll', label: 'Stop All / Pause' },
  { key: 'canControlVolume', label: 'Volume Slider' },
  { key: 'canAddSounds', label: 'Add Sounds' },
  { key: 'canAudioClip', label: 'Audio Clips' },
  { key: 'canVideoClip', label: 'Video Clips' },
  { key: 'canEditSounds', label: 'Edit Sound Props' },
  { key: 'canDeleteSounds', label: 'Delete Sounds & Clips' },
];

const TIMEOUT_DURATION_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: 'Manual', seconds: 0 },
];

const COOLDOWN_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: 'Off', seconds: 0 },
  { label: '1s', seconds: 1 },
  { label: '2s', seconds: 2 },
  { label: '3s', seconds: 3 },
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
  { label: '15s', seconds: 15 },
];

function formatDurationPill(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatTimeoutRemaining(untilMs?: number | null, nowMs: number = Date.now()): string | null {
  if (!untilMs || untilMs <= nowMs) return null;
  const totalSec = Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

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

const ActorAvatar: React.FC<{
  initials?: string;
  color?: string;
  size?: 'sm' | 'md';
}> = ({ initials = 'PC', color = '#38bdf8', size = 'md' }) => (
  <div
    style={{ backgroundColor: color }}
    className={`${
      size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-[11px]'
    } rounded-full flex items-center justify-center font-black text-slate-950 tracking-tight shrink-0 shadow-sm border border-black/20`}
  >
    {initials}
  </div>
);

interface DeviceRowProps {
  dev: RemoteConnectedDevice;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  currentPlayback?: ActivePlaybackEntry | null;
  accent: string;
  nowMs: number;
  timeoutDurationSec: number;
  onToggleTimeout: () => void;
  onRemove: () => void;
  onUpdatePermission: (key: keyof RemoteGuestPermissions, nextVal: boolean) => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({
  dev,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  isExpanded,
  onToggleExpand,
  currentPlayback,
  accent,
  nowMs,
  timeoutDurationSec,
  onToggleTimeout,
  onRemove,
  onUpdatePermission,
}) => {
  const devPerms: RemoteGuestPermissions = dev.permissions || DEFAULT_GUEST_PERMS;
  const displayInitials =
    dev.initials ||
    (dev.role === 'owner' ? 'HP' : (dev.name || dev.label || 'FR').slice(0, 2).toUpperCase());
  const displayColor = dev.color || (dev.role === 'owner' ? '#38bdf8' : '#a78bfa');

  return (
    <div className="flex flex-col">
      <div
        onClick={() => selectable && onToggleSelect?.()}
        className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
          selectable ? 'cursor-pointer' : ''
        } ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              style={isSelected ? { backgroundColor: accent, borderColor: accent } : undefined}
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                isSelected
                  ? 'text-slate-950'
                  : 'bg-white/[0.03] border-white/[0.18] hover:border-white/40'
              }`}
              aria-label={`Select ${dev.label}`}
            >
              {isSelected && <Check size={10} strokeWidth={3} />}
            </button>
          )}
          <ActorAvatar initials={displayInitials} color={displayColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-white truncate">
                {dev.name ? dev.name : dev.label}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${
                  dev.role === 'guest'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-white/[0.08] text-slate-300'
                }`}
              >
                {dev.role === 'guest' ? 'Friend' : 'Owner'}
              </span>
              {dev.hasCustomPermissions && (
                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-violet-500/15 text-violet-300">
                  Custom
                </span>
              )}
              {dev.tempLocked ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 font-mono">
                  <Lock size={9} />
                  <span>
                    {(() => {
                      const rem = formatTimeoutRemaining(dev.tempLockedUntil, nowMs);
                      return rem ? `Timed Out · ${rem}` : 'Timed Out';
                    })()}
                  </span>
                </span>
              ) : dev.online ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Live
                </span>
              ) : (
                <span className="text-[10.5px] font-medium text-theme-muted">
                  Connecting
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-theme-muted mt-0.5 truncate">
              {dev.name && (
                <>
                  <span>{dev.label.replace(`${dev.name} (`, '').replace(/\)$/, '')}</span>
                  <span>·</span>
                </>
              )}
              <span className="font-mono">{dev.ip}</span>
              {currentPlayback && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-300 truncate max-w-[200px]">
                    <Volume2 size={10} className="shrink-0" />
                    <span className="truncate">{currentPlayback.soundTitle}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {dev.role === 'guest' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className={`h-8 px-2.5 rounded-lg border text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isExpanded
                  ? 'bg-white/[0.14] border-white/[0.25] text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.1] text-slate-300 hover:text-white'
              }`}
            >
              <Sliders size={12} />
              <span>Permissions</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTimeout();
            }}
            className={`h-8 px-3 rounded-lg text-[11.5px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors text-white shadow-sm ${
              dev.tempLocked
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-[#ea580c] hover:bg-[#f97316]'
            }`}
          >
            {dev.tempLocked ? <Unlock size={12} /> : <Lock size={12} />}
            <span>
              {dev.tempLocked
                ? 'End Timeout'
                : timeoutDurationSec > 0
                ? `Timeout (${formatDurationPill(timeoutDurationSec)})`
                : 'Timeout'}
            </span>
          </button>

          <button
            type="button"
            title="Remove device (requires PIN to reconnect)"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="h-8 px-3 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white text-[11.5px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>
      </div>

      {isExpanded && dev.role === 'guest' && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-4 pb-3 pt-2 bg-black/25 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {DEVICE_PERMISSION_ITEMS.map((perm) => (
            <div
              key={perm.key}
              className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-2"
            >
              <span className="text-[11.5px] font-medium text-theme-primary">{perm.label}</span>
              <ToggleSwitch
                checked={!!devPerms[perm.key]}
                accent={accent}
                onChange={(nextVal) => onUpdatePermission(perm.key, nextVal)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const PhoneRemoteModal: React.FC<PhoneRemoteModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSaveSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<AudioSettings>(settings);
  const [remoteStatus, setRemoteStatus] = useState<RemoteServerStatus | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [expandedDevicePermsId, setExpandedDevicePermsId] = useState<string | null>(null);
  const [copiedRemoteUrl, setCopiedRemoteUrl] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [copiedFriendInvite, setCopiedFriendInvite] = useState(false);
  const [timeoutDurationSec, setTimeoutDurationSec] = useState<number>(60);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasTimedOutCountdown =
    isOpen && !!remoteStatus?.devices?.some((d) => d.tempLocked && !!d.tempLockedUntil);

  useEffect(() => {
    if (!hasTimedOutCountdown) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasTimedOutCountdown]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const syncRemoteStatus = (st: RemoteServerStatus) => {
      setRemoteStatus(st);
      const validIds = new Set((st.devices || []).map((d) => d.id));
      setSelectedDeviceIds((prev) => prev.filter((id) => validIds.has(id)));
    };
    if (window.soundboardAPI?.getRemoteServerStatus) {
      window.soundboardAPI.getRemoteServerStatus().then(syncRemoteStatus).catch(() => {});
    }
    const unsub = window.soundboardAPI?.onRemoteServerStatusUpdated?.((st) => {
      syncRemoteStatus(st);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentTheme = getTheme(localSettings.theme, localSettings.accentColor);
  const accent = currentTheme.accent || 'var(--accent-color)';
  const isRemoteEnabled = localSettings.remoteControlEnabled !== false;
  const guestEnabled = localSettings.remoteGuestEnabled !== false;
  const devices = remoteStatus?.devices || [];
  const deviceCount = devices.length;
  const activePlaybacks = remoteStatus?.activePlaybacks || [];
  const activityLog = remoteStatus?.activityLog || [];

  const getPlaybackForActor = (actorId: string) =>
    activePlaybacks.find((p) => p.actorId === actorId) || null;

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToggleSingleTimeout = async (dev: RemoteConnectedDevice) => {
    if (!window.soundboardAPI?.setRemoteTempLock) return;
    const locking = !dev.tempLocked;
    const st = await window.soundboardAPI.setRemoteTempLock(
      [dev.id],
      locking,
      locking ? timeoutDurationSec : 0
    );
    setRemoteStatus(st);
  };

  const handleRemoveSingleDevice = async (devId: string) => {
    if (!window.soundboardAPI?.removeRemoteDevices) return;
    const st = await window.soundboardAPI.removeRemoteDevices([devId]);
    setRemoteStatus(st);
    setSelectedDeviceIds((prev) => prev.filter((id) => id !== devId));
    if (expandedDevicePermsId === devId) setExpandedDevicePermsId(null);
  };

  const handleUpdateSinglePermission = async (
    devId: string,
    key: keyof RemoteGuestPermissions,
    nextVal: boolean
  ) => {
    if (!window.soundboardAPI?.setRemoteDevicePermissions) return;
    const st = await window.soundboardAPI.setRemoteDevicePermissions(devId, {
      [key]: nextVal,
    });
    setRemoteStatus(st);
  };

  const currentCooldown =
    localSettings.remoteGuestCooldownSeconds ?? remoteStatus?.guestCooldownSeconds ?? 1;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden h-[700px] max-h-[92vh]"
      >
        {/* Unified Top Header */}
        <header className="px-6 py-4 border-b border-white/[0.08] frosted-modal-chrome bg-white/[0.03] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
              <Smartphone size={17} style={{ color: accent }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[15px] font-black tracking-wide text-theme-primary">
                  PHONE <span style={{ color: accent }}>REMOTE</span>
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.09] text-[10.5px] font-mono font-semibold text-theme-secondary">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      remoteStatus?.running
                        ? deviceCount > 0
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-sky-400'
                        : 'bg-slate-500'
                    }`}
                  />
                  {remoteStatus?.running
                    ? `${deviceCount} connected · Port ${localSettings.remoteControlPort || 3940}`
                    : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-theme-muted">
                Access codes, Wi-Fi & internet links, friend controls, and live activity in one place
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Compact Server Port + Power Toggle */}
            {isRemoteEnabled && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <span className="text-[10.5px] font-semibold text-theme-muted">Port</span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={localSettings.remoteControlPort || 3940}
                  onChange={(e) => {
                    const p = Math.max(1024, Math.min(65535, Number(e.target.value) || 3940));
                    setLocalSettings({ ...localSettings, remoteControlPort: p });
                  }}
                  onBlur={() => onSaveSettings(localSettings, true)}
                  className="w-14 bg-transparent font-mono text-[11.5px] font-bold text-theme-primary focus:outline-none text-right"
                />
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-[11px] font-bold text-theme-secondary">Server</span>
              <ToggleSwitch
                checked={isRemoteEnabled}
                accent={accent}
                onChange={(checked) => {
                  const updated = { ...localSettings, remoteControlEnabled: checked };
                  setLocalSettings(updated);
                  onSaveSettings(updated, true);
                }}
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-theme-secondary hover:text-theme-primary flex items-center justify-center transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Optional Quick-Jump Anchor Strip (All content remains visible on this single page) */}
        {isRemoteEnabled && (
          <div className="px-6 py-2 border-b border-white/[0.06] bg-white/[0.015] flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => scrollToSection('remote-sec-codes')}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-semibold text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Lock size={11} style={{ color: accent }} />
              <span>Codes & Links</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('remote-sec-rules')}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-semibold text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sliders size={11} style={{ color: accent }} />
              <span>Friend Permissions & Cooldown</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('remote-sec-devices')}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-semibold text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Users size={11} style={{ color: accent }} />
              <span>Connected ({deviceCount})</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('remote-sec-activity')}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] font-semibold text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Activity size={11} style={{ color: accent }} />
              <span>
                Live Activity{activePlaybacks.length > 0 ? ` (${activePlaybacks.length} playing)` : ''}
              </span>
            </button>
          </div>
        )}

        {/* Single Unified Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent">
          {remoteStatus?.error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12px] flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>{remoteStatus.error}</span>
            </div>
          )}

          {!isRemoteEnabled ? (
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
              <div>
                <h4 className="text-[14px] font-bold text-theme-primary">Phone Remote is turned off</h4>
                <p className="text-[12px] text-theme-muted mt-0.5">
                  Turn it on to connect your phone over Wi-Fi or share a public link with friends.
                </p>
              </div>
              <ToggleSwitch
                checked={false}
                accent={accent}
                onChange={() => {
                  const updated = { ...localSettings, remoteControlEnabled: true };
                  setLocalSettings(updated);
                  onSaveSettings(updated, true);
                }}
              />
            </div>
          ) : (
            <>
              {/* SECTION 1: CODES & LINKS TOGETHER */}
              <section id="remote-sec-codes" className="space-y-4">
                {/* Owner Code & Friend Code Side-by-Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Owner Code Card */}
                  <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.09] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
                          <Lock size={13} style={{ color: accent }} />
                        </div>
                        <div>
                          <h3 className="text-[13px] font-bold text-theme-primary">Owner PIN</h3>
                          <p className="text-[10.5px] text-theme-muted">Full remote control for your own phone</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-white/[0.07] text-slate-200 border border-white/[0.12]">
                        Admin
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={localSettings.remoteControlPin ?? remoteStatus?.pin ?? ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setLocalSettings({ ...localSettings, remoteControlPin: digits });
                        }}
                        onBlur={() => {
                          const clean = String(localSettings.remoteControlPin || '').replace(/\D/g, '');
                          if (clean.length >= 4) {
                            onSaveSettings({ ...localSettings, remoteControlPin: clean }, true);
                          }
                        }}
                        placeholder="4-6 digits"
                        className="w-full px-3.5 py-2 rounded-xl bg-black/25 border border-white/[0.1] font-mono text-[17px] font-bold tracking-[0.3em] text-theme-primary focus:outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.soundboardAPI?.regenerateRemotePin) {
                            const st = await window.soundboardAPI.regenerateRemotePin();
                            setRemoteStatus(st);
                            setLocalSettings((prev) => ({ ...prev, remoteControlPin: st.pin }));
                          }
                        }}
                        title="Generate new Owner PIN & disconnect current phones"
                        className="px-3 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 text-[11.5px] font-semibold cursor-pointer flex-shrink-0"
                      >
                        <RefreshCw size={13} />
                        <span>New</span>
                      </button>
                    </div>
                  </div>

                  {/* Friend Code Card */}
                  <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.09] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center">
                          <Users size={13} className="text-sky-300" />
                        </div>
                        <div>
                          <h3 className="text-[13px] font-bold text-theme-primary">Friend PIN</h3>
                          <p className="text-[10.5px] text-theme-muted">
                            {guestEnabled ? 'Guest code with permissions & cooldown' : 'Friend access is turned off'}
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={guestEnabled}
                        accent={accent}
                        onChange={(checked) => {
                          const updated = { ...localSettings, remoteGuestEnabled: checked };
                          setLocalSettings(updated);
                          onSaveSettings(updated, true);
                        }}
                      />
                    </div>

                    {guestEnabled && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={localSettings.remoteGuestPin ?? remoteStatus?.guestPin ?? ''}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setLocalSettings({ ...localSettings, remoteGuestPin: digits });
                          }}
                          onBlur={() => {
                            const clean = String(localSettings.remoteGuestPin || '').replace(/\D/g, '');
                            const ownerPin = String(localSettings.remoteControlPin || remoteStatus?.pin || '');
                            if (clean.length >= 4 && clean !== ownerPin) {
                              onSaveSettings({ ...localSettings, remoteGuestPin: clean }, true);
                            }
                          }}
                          placeholder="4-6 digits"
                          className="w-full px-3.5 py-2 rounded-xl bg-black/25 border border-white/[0.1] font-mono text-[17px] font-bold tracking-[0.3em] text-theme-primary focus:outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.soundboardAPI?.regenerateGuestPin) {
                              const st = await window.soundboardAPI.regenerateGuestPin();
                              setRemoteStatus(st);
                              if (st.guestPin) {
                                setLocalSettings((prev) => ({ ...prev, remoteGuestPin: st.guestPin }));
                              }
                            }
                          }}
                          title="Generate new Friend PIN (disconnects existing Friends)"
                          className="px-3 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-theme-secondary hover:text-theme-primary flex items-center gap-1.5 text-[11.5px] font-semibold cursor-pointer flex-shrink-0"
                        >
                          <RefreshCw size={13} />
                          <span>New</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Local Wi-Fi Link + Public Internet Link Side-by-Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Local Wi-Fi Card */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex gap-3.5 items-center">
                    {remoteStatus?.qrDataUrl ? (
                      <img
                        src={remoteStatus.qrDataUrl}
                        alt="Scan Wi-Fi URL"
                        className="w-24 h-24 rounded-xl bg-black/30 p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-white/[0.04] flex items-center justify-center text-[10px] text-theme-muted shrink-0">
                        Starting...
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Wifi size={13} style={{ color: accent }} />
                        <h4 className="text-[12.5px] font-bold text-theme-primary">Same Wi-Fi Link</h4>
                      </div>
                      <div className="px-2.5 py-1.5 rounded-xl bg-black/25 border border-white/[0.09] font-mono text-[11px] text-theme-primary select-text truncate">
                        {remoteStatus?.primaryUrl || `http://localhost:${localSettings.remoteControlPort || 3940}`}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const url = remoteStatus?.primaryUrl;
                            if (url) {
                              navigator.clipboard?.writeText(url);
                              setCopiedRemoteUrl(true);
                              setTimeout(() => setCopiedRemoteUrl(false), 1800);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-semibold text-theme-primary flex items-center gap-1 cursor-pointer"
                        >
                          {copiedRemoteUrl ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          <span>{copiedRemoteUrl ? 'Copied' : 'Copy URL'}</span>
                        </button>
                        {remoteStatus &&
                          remoteStatus.urls.slice(1, 3).map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(u);
                                setCopiedRemoteUrl(true);
                                setTimeout(() => setCopiedRemoteUrl(false), 1800);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] font-mono text-[10px] text-theme-muted hover:text-theme-primary cursor-pointer truncate max-w-[140px]"
                              title={`Copy alternate URL: ${u}`}
                            >
                              {u.replace(/^https?:\/\//, '')}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Public Internet Link Card */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe
                          size={14}
                          style={remoteStatus?.tunnel?.status === 'online' ? { color: accent } : undefined}
                          className={remoteStatus?.tunnel?.status === 'online' ? 'shrink-0' : 'text-theme-muted shrink-0'}
                        />
                        <h4 className="text-[12.5px] font-bold text-theme-primary truncate">Public Internet Link</h4>
                        {remoteStatus?.tunnel?.status === 'online' ? (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Online
                          </span>
                        ) : remoteStatus?.tunnel?.status === 'downloading' ? (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Downloading {remoteStatus.tunnel.downloadProgress ?? 0}%
                          </span>
                        ) : remoteStatus?.tunnel?.status === 'starting' ? (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Starting...
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-white/[0.06] text-theme-muted border border-white/[0.1]">
                            Offline
                          </span>
                        )}
                      </div>

                      <ToggleSwitch
                        checked={!!remoteStatus?.tunnel?.active}
                        disabled={
                          remoteStatus?.tunnel?.status === 'downloading' ||
                          remoteStatus?.tunnel?.status === 'starting'
                        }
                        accent={accent}
                        onChange={async (checked) => {
                          if (checked) {
                            const st = await window.soundboardAPI?.startPublicTunnel?.();
                            if (st) setRemoteStatus(st);
                          } else {
                            const st = await window.soundboardAPI?.stopPublicTunnel?.();
                            if (st) setRemoteStatus(st);
                          }
                        }}
                      />
                    </div>

                    {remoteStatus?.tunnel?.error && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span className="truncate">{remoteStatus.tunnel.error}</span>
                      </div>
                    )}

                    {remoteStatus?.tunnel?.status === 'online' && remoteStatus.tunnel.url ? (
                      <div className="flex items-center gap-3">
                        {remoteStatus.tunnel.qrDataUrl && (
                          <img
                            src={remoteStatus.tunnel.qrDataUrl}
                            alt="Public Link QR"
                            className="w-20 h-20 rounded-xl bg-black/30 p-1 shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="px-2.5 py-1.5 rounded-xl bg-black/25 border border-white/[0.09] font-mono text-[11px] text-theme-primary select-text truncate">
                            {remoteStatus.tunnel.url}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(remoteStatus.tunnel!.url);
                                setCopiedPublicUrl(true);
                                setTimeout(() => setCopiedPublicUrl(false), 1800);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-semibold text-theme-primary flex items-center gap-1 cursor-pointer"
                            >
                              {copiedPublicUrl ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              <span>{copiedPublicUrl ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const invitePin = guestEnabled
                                  ? localSettings.remoteGuestPin || remoteStatus.guestPin || ''
                                  : localSettings.remoteControlPin || remoteStatus.pin;
                                const label = guestEnabled ? 'Friend PIN' : 'PIN';
                                navigator.clipboard?.writeText(
                                  `Prism Soundboard: ${remoteStatus.tunnel!.url} (${label}: ${invitePin})`
                                );
                                setCopiedFriendInvite(true);
                                setTimeout(() => setCopiedFriendInvite(false), 2000);
                              }}
                              style={{ backgroundColor: accent }}
                              className="px-2.5 py-1.5 rounded-lg text-black text-[11px] font-bold flex items-center gap-1 hover:brightness-110 active:scale-95 transition-colors cursor-pointer"
                            >
                              {copiedFriendInvite ? <Check size={12} /> : <Share2 size={12} />}
                              <span>{copiedFriendInvite ? 'Copied Invite!' : 'Copy Invite + Code'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-theme-muted leading-relaxed">
                        Turn on to get a temporary HTTPS link anyone outside your Wi-Fi can open.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* SECTION 2: FRIEND PERMISSIONS & SPAM COOLDOWN */}
              {guestEnabled && (
                <section
                  id="remote-sec-rules"
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sliders size={14} style={{ color: accent }} />
                      <div>
                        <h3 className="text-[13px] font-bold text-theme-primary">
                          Friend Default Permissions & Cooldown
                        </h3>
                        <p className="text-[11px] text-theme-muted">
                          Applies to friends joining with the Friend PIN (you can also override per person below)
                        </p>
                      </div>
                    </div>

                    {/* Spam Cooldown Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-theme-muted mr-1">Cooldown:</span>
                      {COOLDOWN_OPTIONS.map((opt) => {
                        const isActive = currentCooldown === opt.seconds;
                        return (
                          <button
                            key={opt.seconds}
                            type="button"
                            onClick={() => {
                              const updated = {
                                ...localSettings,
                                remoteGuestCooldownSeconds: opt.seconds,
                              };
                              setLocalSettings(updated);
                              onSaveSettings(updated, true);
                            }}
                            style={
                              isActive
                                ? {
                                    backgroundColor: `${accent}26`,
                                    borderColor: `${accent}88`,
                                    color: '#ffffff',
                                  }
                                : undefined
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              isActive
                                ? ''
                                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.1] text-theme-secondary'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {DEFAULT_PERMISSION_ITEMS.map((perm) => {
                      const currentPerms = localSettings.remoteGuestPermissions || DEFAULT_GUEST_PERMS;
                      const checked = !!currentPerms[perm.key];
                      return (
                        <div
                          key={perm.key}
                          className="px-3 py-2 rounded-xl bg-black/20 border border-white/[0.07] flex items-center justify-between gap-2.5"
                        >
                          <span className="text-[11.5px] font-medium text-theme-primary truncate">
                            {perm.label}
                          </span>
                          <ToggleSwitch
                            checked={checked}
                            accent={accent}
                            onChange={async (nextVal) => {
                              const nextPerms = {
                                ...currentPerms,
                                [perm.key]: nextVal,
                              };
                              const updated = {
                                ...localSettings,
                                remoteGuestPermissions: nextPerms,
                              };
                              setLocalSettings(updated);
                              if (window.soundboardAPI?.setRemoteGuestPermissions) {
                                const st = await window.soundboardAPI.setRemoteGuestPermissions(nextPerms);
                                setRemoteStatus(st);
                              } else {
                                onSaveSettings(updated, true);
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* SECTION 3: CONNECTED DEVICES & TIMEOUTS */}
              <section id="remote-sec-devices" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13.5px] font-bold text-theme-primary flex items-center gap-2">
                      <Users size={14} style={{ color: accent }} />
                      <span>Connected Devices ({deviceCount})</span>
                    </h3>
                    <p className="text-[11px] text-theme-muted">
                      Timeout, remove, or customize permissions for any phone or friend
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/35 border border-white/[0.09]">
                      <span className="text-[10px] font-semibold text-slate-400 px-2">
                        Timer
                      </span>
                      {TIMEOUT_DURATION_OPTIONS.map((opt) => (
                        <button
                          key={opt.seconds}
                          type="button"
                          onClick={() => setTimeoutDurationSec(opt.seconds)}
                          className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                            timeoutDurationSec === opt.seconds
                              ? 'bg-white/[0.16] text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {devices.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.soundboardAPI?.setRemoteTempLock) return;
                            const anyNotTimedOut = devices.some((d) => !d.tempLocked);
                            const st = await window.soundboardAPI.setRemoteTempLock(
                              'all',
                              anyNotTimedOut,
                              anyNotTimedOut ? timeoutDurationSec : 0
                            );
                            setRemoteStatus(st);
                          }}
                          className={`h-8 px-2.5 rounded-lg text-[11px] font-bold text-white cursor-pointer transition-colors shadow-sm ${
                            devices.some((d) => !d.tempLocked)
                              ? 'bg-[#ea580c] hover:bg-[#f97316]'
                              : 'bg-emerald-600 hover:bg-emerald-500'
                          }`}
                        >
                          {devices.some((d) => !d.tempLocked)
                            ? timeoutDurationSec > 0
                              ? `Timeout All (${formatDurationPill(timeoutDurationSec)})`
                              : 'Timeout All'
                            : 'End All Timeouts'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.soundboardAPI?.disconnectRemoteClients) {
                              const st = await window.soundboardAPI.disconnectRemoteClients();
                              setRemoteStatus(st);
                            }
                          }}
                          className="h-8 px-2.5 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white text-[11px] font-bold cursor-pointer transition-colors shadow-sm"
                        >
                          Revoke All
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {selectedDeviceIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09]">
                    <span className="text-[11px] font-semibold text-theme-secondary mr-1">
                      {selectedDeviceIds.length} selected:
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.soundboardAPI?.setRemoteTempLock) return;
                        const st = await window.soundboardAPI.setRemoteTempLock(
                          selectedDeviceIds,
                          true,
                          timeoutDurationSec
                        );
                        setRemoteStatus(st);
                      }}
                      className="h-7 px-2.5 rounded-lg bg-[#ea580c] hover:bg-[#f97316] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Lock size={11} />
                      <span>
                        {timeoutDurationSec > 0
                          ? `Timeout ${formatDurationPill(timeoutDurationSec)}`
                          : 'Timeout'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.soundboardAPI?.setRemoteTempLock) return;
                        const st = await window.soundboardAPI.setRemoteTempLock(selectedDeviceIds, false, 0);
                        setRemoteStatus(st);
                      }}
                      className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Unlock size={11} />
                      <span>End Timeout</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.soundboardAPI?.removeRemoteDevices) return;
                        const st = await window.soundboardAPI.removeRemoteDevices(selectedDeviceIds);
                        setRemoteStatus(st);
                        setSelectedDeviceIds([]);
                      }}
                      className="h-7 px-2.5 rounded-lg bg-[#e11d48] hover:bg-[#f43f5e] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Trash2 size={11} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}

                {devices.length > 0 ? (
                  <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06]">
                    {devices.map((dev) => {
                      const isSelected = selectedDeviceIds.includes(dev.id);
                      return (
                        <DeviceRow
                          key={dev.id}
                          dev={dev}
                          selectable
                          isSelected={isSelected}
                          onToggleSelect={() =>
                            setSelectedDeviceIds((prev) =>
                              prev.includes(dev.id) ? prev.filter((id) => id !== dev.id) : [...prev, dev.id]
                            )
                          }
                          isExpanded={expandedDevicePermsId === dev.id}
                          onToggleExpand={() =>
                            setExpandedDevicePermsId(expandedDevicePermsId === dev.id ? null : dev.id)
                          }
                          currentPlayback={getPlaybackForActor(dev.id)}
                          accent={accent}
                          nowMs={nowMs}
                          timeoutDurationSec={timeoutDurationSec}
                          onToggleTimeout={() => handleToggleSingleTimeout(dev)}
                          onRemove={() => handleRemoveSingleDevice(dev.id)}
                          onUpdatePermission={(key, val) => handleUpdateSinglePermission(dev.id, key, val)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-theme-muted text-center">
                    No phones or friends connected right now. Share the Wi-Fi or Public link and PIN above.
                  </div>
                )}
              </section>
            </>
          )}

          {/* SECTION 4: LIVE ACTIVITY */}
          <section id="remote-sec-activity" className="space-y-3 pt-2 border-t border-white/[0.07]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-bold text-theme-primary flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePlaybacks.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span>Live Activity ({activityLog.length})</span>
              </h3>
              {activityLog.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.soundboardAPI?.clearRemoteActivity) {
                      const st = await window.soundboardAPI.clearRemoteActivity();
                      setRemoteStatus(st);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-semibold text-theme-secondary hover:text-theme-primary cursor-pointer"
                >
                  Clear Log
                </button>
              )}
            </div>

            {activePlaybacks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activePlaybacks.map((pb) => (
                  <div
                    key={`${pb.soundId}-${pb.startedAt}`}
                    className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.1] flex items-center gap-3"
                  >
                    <ActorAvatar initials={pb.initials} color={pb.color} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-theme-primary truncate">
                        {pb.soundTitle}
                      </p>
                      <p className="text-[11px] text-theme-muted truncate">
                        Played by <span className="text-theme-secondary font-semibold">{pb.actorName}</span>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                      Playing
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activityLog.length > 0 ? (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
                {activityLog.map((ev) => (
                  <div key={ev.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ActorAvatar initials={ev.initials} color={ev.color} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold text-theme-primary">
                            {ev.actorName}
                          </span>
                          <span className="text-[12px] text-theme-secondary">{ev.action}</span>
                          {ev.detail && (
                            <span className="text-[12px] font-semibold text-white truncate max-w-[260px]">
                              “{ev.detail}”
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ev.type === 'stop' && <Square size={11} className="text-rose-400" />}
                      <span className="text-[10.5px] font-mono text-theme-muted">
                        {formatRelativeTime(ev.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-theme-muted text-center">
                No remote or playback events recorded yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
