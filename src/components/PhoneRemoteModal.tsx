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
        className={`px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
          selectable ? 'cursor-pointer' : ''
        } ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectable && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              className="w-4 h-4 rounded border-white/20 accent-sky-400 cursor-pointer shrink-0"
            />
          )}
          <ActorAvatar initials={displayInitials} color={displayColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12.5px] font-semibold text-theme-primary truncate">
                {dev.label}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-bold border ${
                  dev.role === 'guest'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : 'bg-white/[0.08] text-slate-200 border-white/[0.12]'
                }`}
              >
                {dev.role === 'guest' ? 'Friend' : 'Owner'}
              </span>
              {dev.hasCustomPermissions && (
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Custom
                </span>
              )}
              {dev.tempLocked ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Timed Out
                </span>
              ) : dev.online ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Live
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-white/[0.06] text-theme-muted border border-white/[0.1]">
                  Connecting
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-[10.5px] font-mono text-theme-muted">{dev.ip}</span>
              {currentPlayback && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-300 truncate max-w-[220px]">
                  <Volume2 size={10} className="shrink-0" />
                  <span className="truncate">Playing: {currentPlayback.soundTitle}</span>
                </span>
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
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                isExpanded
                  ? 'bg-white/[0.12] border-white/[0.2] text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.1] text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <Sliders size={11} />
              <span>Permissions</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTimeout();
            }}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              dev.tempLocked
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35 text-emerald-300'
                : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
            }`}
          >
            {dev.tempLocked ? <Unlock size={12} /> : <Lock size={12} />}
            <span>{dev.tempLocked ? 'End Timeout' : 'Timeout'}</span>
          </button>

          <button
            type="button"
            title="Remove device (requires PIN to reconnect)"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="px-2.5 py-1.5 rounded-lg border bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25 text-rose-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
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
  const [activeTab, setActiveTab] = useState<'connection' | 'friends' | 'devices' | 'activity'>('connection');
  const [localSettings, setLocalSettings] = useState<AudioSettings>(settings);
  const [remoteStatus, setRemoteStatus] = useState<RemoteServerStatus | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [expandedDevicePermsId, setExpandedDevicePermsId] = useState<string | null>(null);
  const [copiedRemoteUrl, setCopiedRemoteUrl] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [copiedFriendInvite, setCopiedFriendInvite] = useState(false);

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
  const devices = remoteStatus?.devices || [];
  const friendDevices = devices.filter((d) => d.role === 'guest');
  const deviceCount = devices.length;
  const activePlaybacks = remoteStatus?.activePlaybacks || [];
  const activityLog = remoteStatus?.activityLog || [];

  const getPlaybackForActor = (actorId: string) =>
    activePlaybacks.find((p) => p.actorId === actorId) || null;

  const handleToggleSingleTimeout = async (dev: RemoteConnectedDevice) => {
    if (!window.soundboardAPI?.setRemoteTempLock) return;
    const st = await window.soundboardAPI.setRemoteTempLock([dev.id], !dev.tempLocked);
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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex overflow-hidden h-[660px] max-h-[92vh]"
      >
        {/* Left Navigation Sidebar */}
        <aside className="w-64 min-w-[256px] frosted-modal-chrome bg-white/[0.03] border-r border-white/[0.08] flex flex-col justify-between p-5 select-none">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shadow-sm">
                <Smartphone size={16} style={{ color: accent }} />
              </div>
              <div>
                <h2 className="text-[14px] font-black tracking-wide text-theme-primary flex items-center gap-1.5">
                  PHONE <span style={{ color: accent }}>REMOTE</span>
                </h2>
                <span className="text-[10px] font-mono font-bold text-theme-muted flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      remoteStatus?.running
                        ? remoteStatus.connectedClients > 0
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-sky-400'
                        : 'bg-slate-500'
                    }`}
                  />
                  {remoteStatus?.running
                    ? `${remoteStatus.connectedClients} active`
                    : 'Offline'}
                </span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('connection')}
                className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'connection'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                }`}
              >
                <Wifi
                  size={16}
                  style={activeTab === 'connection' ? { color: accent } : undefined}
                  className="flex-shrink-0"
                />
                <span>Wi-Fi & PIN</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'friends'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Globe
                    size={16}
                    style={activeTab === 'friends' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Internet & Friends</span>
                </div>
                {remoteStatus?.tunnel?.status === 'online' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : friendDevices.some((f) => f.tempLocked) ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/20 text-amber-300">
                    {friendDevices.filter((f) => f.tempLocked).length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('devices')}
                className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'devices'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users
                    size={16}
                    style={activeTab === 'devices' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Connected Devices</span>
                </div>
                {deviceCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.08] text-theme-primary">
                    {deviceCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`w-full px-3 py-2.5 rounded-xl text-[12.5px] font-bold flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'activity'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Activity
                    size={16}
                    style={activeTab === 'activity' ? { color: accent } : undefined}
                    className="flex-shrink-0"
                  />
                  <span>Live Activity</span>
                </div>
                {activePlaybacks.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                    {activePlaybacks.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Server Quick Power Card */}
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11.5px] font-bold text-theme-primary block">Remote Server</span>
              <span className="text-[10px] text-theme-muted block truncate">
                {isRemoteEnabled ? `Port ${localSettings.remoteControlPort || 3940}` : 'Turned off'}
              </span>
            </div>
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
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 flex flex-col bg-transparent overflow-hidden">
          <header className="h-16 px-8 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome bg-white/[0.025] shrink-0">
            <div>
              <h3 className="text-[15px] font-bold text-theme-primary tracking-wide">
                {activeTab === 'connection' && 'Local Wi-Fi & Owner PIN'}
                {activeTab === 'friends' && 'Internet Share & Friends'}
                {activeTab === 'devices' && `Connected Devices (${deviceCount})`}
                {activeTab === 'activity' && 'Live Activity Feed'}
              </h3>
              <p className="text-[11px] text-theme-muted">
                {activeTab === 'connection' && 'Scan QR or open URL on your phone over local Wi-Fi'}
                {activeTab === 'friends' && 'Public link, Friend PIN, permissions, and individual Timeouts'}
                {activeTab === 'devices' && 'Timeout, remove devices, or edit each friend separately'}
                {activeTab === 'activity' && 'Live monitor of who is playing what, clips, edits, and timeouts'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-theme-secondary hover:text-theme-primary flex items-center justify-center transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-8 space-y-5 bg-transparent">
            {remoteStatus?.error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12px] flex items-center gap-2">
                <AlertTriangle size={15} className="flex-shrink-0" />
                <span>{remoteStatus.error}</span>
              </div>
            )}

            {!isRemoteEnabled && (
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-[13.5px] font-bold text-theme-primary">Remote Server is Disabled</h4>
                  <p className="text-[11.5px] text-theme-muted mt-0.5">
                    Enable the server to pair your phone or share a public link with friends.
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
            )}

            {/* TAB 1: WI-FI & PIN */}
            {isRemoteEnabled && activeTab === 'connection' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                <div className="pb-5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
                  {/* QR Code */}
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.1] flex flex-col items-center gap-2.5">
                    {remoteStatus?.qrDataUrl ? (
                      <img
                        src={remoteStatus.qrDataUrl}
                        alt="Scan to open Prism Deck"
                        className="w-40 h-40 rounded-xl bg-black/30 p-1.5"
                      />
                    ) : (
                      <div className="w-40 h-40 rounded-xl bg-white/[0.04] flex items-center justify-center text-[11px] text-theme-muted">
                        Starting server...
                      </div>
                    )}
                    <span className="text-[10.5px] font-medium text-theme-muted text-center">
                      Scan with phone camera
                    </span>
                  </div>

                  {/* URL + PIN + Port */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">
                        Phone Website URL
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono text-[12.5px] text-theme-primary select-text truncate">
                          {remoteStatus?.primaryUrl || `http://localhost:${localSettings.remoteControlPort || 3940}`}
                        </div>
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
                          className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[12px] font-semibold text-theme-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copiedRemoteUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          <span>{copiedRemoteUrl ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {remoteStatus && remoteStatus.urls.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {remoteStatus.urls.slice(1).map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(u);
                                setCopiedRemoteUrl(true);
                                setTimeout(() => setCopiedRemoteUrl(false), 1800);
                              }}
                              className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] font-mono text-[10.5px] text-theme-muted hover:text-theme-primary cursor-pointer"
                              title="Click to copy alternate LAN address"
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* PIN & Port Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                          <Lock size={11} />
                          <span>Owner PIN</span>
                        </label>
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
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono text-[15px] font-bold tracking-[0.25em] text-theme-primary focus:outline-none focus:border-accent"
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
                            title="Generate new PIN & disconnect active phones"
                            className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-theme-secondary hover:text-theme-primary flex items-center gap-1 text-[11.5px] font-semibold cursor-pointer flex-shrink-0"
                          >
                            <RefreshCw size={13} />
                            <span>New</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">
                          Server Port
                        </label>
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
                          className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono text-[13px] font-semibold text-theme-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    {/* Quick Session Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11.5px] text-theme-muted">
                        {remoteStatus?.connectedClients
                          ? `${remoteStatus.connectedClients} active session${remoteStatus.connectedClients > 1 ? 's' : ''}`
                          : 'No phones connected right now'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!devices.length}
                          onClick={async () => {
                            if (!window.soundboardAPI?.setRemoteTempLock || !devices.length) return;
                            const anyNotTimedOut = devices.some((d) => !d.tempLocked);
                            const st = await window.soundboardAPI.setRemoteTempLock('all', anyNotTimedOut);
                            setRemoteStatus(st);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11.5px] font-semibold disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          {devices.some((d) => !d.tempLocked)
                            ? 'Timeout All'
                            : devices.length
                            ? 'End All Timeouts'
                            : 'Timeout All'}
                        </button>

                        <button
                          type="button"
                          disabled={!remoteStatus?.connectedClients}
                          onClick={async () => {
                            if (window.soundboardAPI?.disconnectRemoteClients) {
                              const st = await window.soundboardAPI.disconnectRemoteClients();
                              setRemoteStatus(st);
                            }
                          }}
                          title="Disconnects all phones and requires PIN again"
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-[11.5px] font-semibold disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          Revoke All (PIN)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INTERNET & FRIENDS */}
            {isRemoteEnabled && activeTab === 'friends' && (
              <div className="divide-y divide-white/[0.07] animate-in fade-in duration-100">
                {/* Public Share Link */}
                <div className="pb-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center">
                        <Globe
                          size={18}
                          style={remoteStatus?.tunnel?.status === 'online' ? { color: accent } : undefined}
                          className={remoteStatus?.tunnel?.status === 'online' ? '' : 'text-theme-muted'}
                        />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-bold text-theme-primary flex items-center gap-2">
                          <span>Public Share Link</span>
                          {remoteStatus?.tunnel?.status === 'online' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Online
                            </span>
                          ) : remoteStatus?.tunnel?.status === 'downloading' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                              Downloading {remoteStatus.tunnel.downloadProgress ?? 0}%
                            </span>
                          ) : remoteStatus?.tunnel?.status === 'starting' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Starting...
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.06] text-theme-muted border border-white/[0.1]">
                              Offline
                            </span>
                          )}
                        </h4>
                        <p className="text-[11.5px] text-theme-muted mt-0.5">
                          Instant HTTPS link and QR for friends over the internet.
                        </p>
                      </div>
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
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12px] flex items-center gap-2">
                      <AlertTriangle size={15} className="flex-shrink-0" />
                      <span>{remoteStatus.tunnel.error}</span>
                    </div>
                  )}

                  {remoteStatus?.tunnel?.status === 'online' && remoteStatus.tunnel.url && (
                    <div className="grid grid-cols-1 md:grid-cols-[150px_1fr] gap-4 items-center p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.1]">
                      {remoteStatus.tunnel.qrDataUrl && (
                        <div className="flex flex-col items-center gap-1.5">
                          <img
                            src={remoteStatus.tunnel.qrDataUrl}
                            alt="Public Share QR"
                            className="w-32 h-32 rounded-xl bg-black/30 p-1"
                          />
                          <span className="text-[10px] text-theme-muted">Public Link QR</span>
                        </div>
                      )}

                      <div className="space-y-3 min-w-0">
                        <div className="space-y-1">
                          <label className="text-[10.5px] font-bold uppercase tracking-wider text-theme-muted">
                            Public HTTPS Link
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-white/[0.09] font-mono text-[12px] text-theme-primary select-text truncate">
                              {remoteStatus.tunnel.url}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(remoteStatus.tunnel!.url);
                                setCopiedPublicUrl(true);
                                setTimeout(() => setCopiedPublicUrl(false), 1800);
                              }}
                              className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11.5px] font-semibold text-theme-primary flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                              {copiedPublicUrl ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                              <span>{copiedPublicUrl ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const guestEnabled = localSettings.remoteGuestEnabled !== false;
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
                            className="px-3.5 py-2 rounded-xl text-black text-[12px] font-bold flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-colors cursor-pointer"
                          >
                            {copiedFriendInvite ? <Check size={14} /> : <Share2 size={14} />}
                            <span>{copiedFriendInvite ? 'Invite Copied!' : 'Copy Invite Link + Friend PIN'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Connected & Timed-Out Friends One-by-One Controls */}
                <div className="py-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-bold text-theme-primary">
                        Friends ({friendDevices.length})
                      </h4>
                      <p className="text-[11px] text-theme-muted">
                        Timeout, end timeout, remove, or edit permissions for each friend one by one.
                      </p>
                    </div>
                    {friendDevices.some((f) => f.tempLocked) && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.soundboardAPI?.setRemoteTempLock) return;
                          const lockedIds = friendDevices.filter((f) => f.tempLocked).map((f) => f.id);
                          const st = await window.soundboardAPI.setRemoteTempLock(lockedIds, false);
                          setRemoteStatus(st);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlock size={12} />
                        <span>End All Friend Timeouts</span>
                      </button>
                    )}
                  </div>

                  {friendDevices.length > 0 ? (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06]">
                      {friendDevices.map((dev) => (
                        <DeviceRow
                          key={dev.id}
                          dev={dev}
                          isExpanded={expandedDevicePermsId === dev.id}
                          onToggleExpand={() =>
                            setExpandedDevicePermsId(expandedDevicePermsId === dev.id ? null : dev.id)
                          }
                          currentPlayback={getPlaybackForActor(dev.id)}
                          accent={accent}
                          onToggleTimeout={() => handleToggleSingleTimeout(dev)}
                          onRemove={() => handleRemoveSingleDevice(dev.id)}
                          onUpdatePermission={(key, val) => handleUpdateSinglePermission(dev.id, key, val)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[11.5px] text-theme-muted text-center">
                      No friends connected yet. Share the Friend PIN above.
                    </div>
                  )}
                </div>

                {/* Friend Guest Mode & Default Permissions */}
                <div className="pt-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center">
                        <Users size={18} style={localSettings.remoteGuestEnabled !== false ? { color: accent } : undefined} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-bold text-theme-primary">
                          Friend Guest Mode & Default Permissions
                        </h4>
                        <p className="text-[11.5px] text-theme-muted mt-0.5">
                          Separate PIN for friends with default permissions.
                        </p>
                      </div>
                    </div>

                    <ToggleSwitch
                      checked={localSettings.remoteGuestEnabled !== false}
                      accent={accent}
                      onChange={(checked) => {
                        const updated = { ...localSettings, remoteGuestEnabled: checked };
                        setLocalSettings(updated);
                        onSaveSettings(updated, true);
                      }}
                    />
                  </div>

                  {localSettings.remoteGuestEnabled !== false && (
                    <div className="space-y-4">
                      <div className="max-w-xs space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">
                          Friend Access PIN
                        </label>
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
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] font-mono text-[15px] font-bold tracking-[0.25em] text-theme-primary focus:outline-none focus:border-accent"
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
                            className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-theme-secondary hover:text-theme-primary flex items-center gap-1 text-[11.5px] font-semibold cursor-pointer flex-shrink-0"
                          >
                            <RefreshCw size={13} />
                            <span>New</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {DEFAULT_PERMISSION_ITEMS.map((perm) => {
                          const currentPerms = localSettings.remoteGuestPermissions || DEFAULT_GUEST_PERMS;
                          const checked = !!currentPerms[perm.key];
                          return (
                            <div
                              key={perm.key}
                              className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3"
                            >
                              <span className="text-[12px] font-medium text-theme-primary">{perm.label}</span>
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
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CONNECTED DEVICES */}
            {isRemoteEnabled && activeTab === 'devices' && (
              <div className="space-y-4 animate-in fade-in duration-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] text-theme-muted">
                    Select devices for bulk actions, or timeout / end timeout one by one.
                  </span>

                  {selectedDeviceIds.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.soundboardAPI?.setRemoteTempLock) return;
                          const st = await window.soundboardAPI.setRemoteTempLock(selectedDeviceIds, true);
                          setRemoteStatus(st);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Lock size={11} />
                        <span>Timeout ({selectedDeviceIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.soundboardAPI?.setRemoteTempLock) return;
                          const st = await window.soundboardAPI.setRemoteTempLock(selectedDeviceIds, false);
                          setRemoteStatus(st);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Unlock size={11} />
                        <span>End Timeout ({selectedDeviceIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.soundboardAPI?.removeRemoteDevices) return;
                          const st = await window.soundboardAPI.removeRemoteDevices(selectedDeviceIds);
                          setRemoteStatus(st);
                          setSelectedDeviceIds([]);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={11} />
                        <span>Remove ({selectedDeviceIds.length})</span>
                      </button>
                    </div>
                  )}
                </div>

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
                          onToggleTimeout={() => handleToggleSingleTimeout(dev)}
                          onRemove={() => handleRemoveSingleDevice(dev.id)}
                          onUpdatePermission={(key, val) => handleUpdateSinglePermission(dev.id, key, val)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-theme-muted text-center">
                    No devices connected right now.
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: LIVE ACTIVITY MONITOR */}
            {activeTab === 'activity' && (
              <div className="space-y-6 animate-in fade-in duration-100">
                {/* Currently Playing Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[12.5px] font-bold text-theme-primary flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activePlaybacks.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      <span>Playing Right Now ({activePlaybacks.length})</span>
                    </h4>
                  </div>

                  {activePlaybacks.length > 0 ? (
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
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[11.5px] text-theme-muted">
                      Nothing playing right now.
                    </div>
                  )}
                </div>

                {/* Full Chronological Activity Feed */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[12.5px] font-bold text-theme-primary">
                      Recent Events ({activityLog.length})
                    </h4>
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

                  {activityLog.length > 0 ? (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06]">
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
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.07] text-[12px] text-theme-muted text-center">
                      No remote or playback events recorded yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
