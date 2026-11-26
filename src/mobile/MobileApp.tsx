import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Square,
  Scissors,
  Video,
  Plus,
  Lock,
  Star,
  Volume2,
  Play,
  Pause,
  SlidersHorizontal,
  Trash2,
  Music,
  Clapperboard,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
  Menu,
  Wifi,
} from 'lucide-react';
import { SoundItem, VideoClipItem, YouTubeSearchResult } from '../types';
import {
  RemoteStateSnapshot,
  RemoteSettingsSnapshot,
  getHealth,
  verifyPin,
  logoutSession,
  connectRemoteEvents,
  triggerSound,
  stopAll,
  togglePauseSound,
  seekSound,
  triggerAudioClip,
  triggerVideoClip,
  updateSound,
  deleteSound,
  updateSettings,
  getTrendingYouTube,
  searchYouTube,
  downloadYouTubeSound,
  uploadSoundFile,
  updateVideoClip,
  deleteVideoClip,
} from './api';
import { PinGate } from './components/PinGate';
import { SoundEditSheet } from './components/SoundEditSheet';
import { AddSoundSheet } from './components/AddSoundSheet';
import prismLogo from '../assets/Prism.png';

function formatDuration(sec?: number): string {
  if (!sec || !isFinite(sec)) return '0:00';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

export const MobileApp: React.FC = () => {
  // Token stays strictly in React memory -> PIN is required every time a phone connects
  const [token, setToken] = useState<string | null>(null);
  const [hostName, setHostName] = useState('Studio PC');
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [isTempLocked, setIsTempLocked] = useState(false);
  const [tempLockReason, setTempLockReason] = useState<string>('Temporarily locked from PC');
  const [isStreamConnected, setIsStreamConnected] = useState(false);

  const [sounds, setSounds] = useState<SoundItem[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClipItem[]>([]);
  const [activeSoundIds, setActiveSoundIds] = useState<string[]>([]);
  const [pausedSoundIds, setPausedSoundIds] = useState<string[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<RemoteSettingsSnapshot>({
    accentColor: '#38bdf8',
    theme: 'dark',
    masterSpeakerVolume: 100,
    masterMicVolume: 100,
    recordDuration: 5,
    videoClipDuration: 30,
    recordSource: 'all',
  });
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isTriggeringVideoClip, setIsTriggeringVideoClip] = useState(false);

  // Mobile View State
  const [tab, setTab] = useState<'all' | 'favorites' | 'clips'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [playingClip, setPlayingClip] = useState<VideoClipItem | null>(null);
  const [toast, setToast] = useState<{ message: string; kind?: string } | null>(null);
  const toastTimerRef = useRef<any>(null);
  const longPressTimerRef = useRef<any>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Interactive scrub bar state for active playback
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);
  const lastSeekSentRef = useRef<number>(0);

  const showToast = (message: string, kind: string = 'info') => {
    setToast({ message, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    getHealth()
      .then((h) => {
        if (h.hostName) setHostName(h.hostName);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      const doc: any = document;
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor || '#38bdf8');
  }, [settings.accentColor]);

  const applySnapshot = (snap: RemoteStateSnapshot) => {
    if (Array.isArray(snap.sounds)) setSounds(snap.sounds);
    if (Array.isArray(snap.videoClips)) setVideoClips(snap.videoClips);
    if (Array.isArray(snap.activeSoundIds)) setActiveSoundIds(snap.activeSoundIds);
    if (Array.isArray(snap.pausedSoundIds)) setPausedSoundIds(snap.pausedSoundIds);
    if (snap.progressMap) setProgressMap(snap.progressMap);
    if (snap.settings) setSettings(snap.settings);
    setIsRecordingClip(!!snap.isRecordingClip);
    if (snap.hostName) setHostName(snap.hostName);
  };

  // Subscribe to SSE stream once authenticated
  useEffect(() => {
    if (!token) return;
    const disconnect = connectRemoteEvents(token, {
      onState: applySnapshot,
      onSounds: setSounds,
      onClips: (clips) => {
        setVideoClips(clips);
        setIsTriggeringVideoClip(false);
      },
      onActive: setActiveSoundIds,
      onPaused: setPausedSoundIds,
      onProgress: setProgressMap,
      onSettings: setSettings,
      onRecording: setIsRecordingClip,
      onToast: (t) => showToast(t.message, t.kind),
      onTempLocked: (d) => {
        setIsTempLocked(!!d.locked);
        if (d.locked) {
          setTempLockReason(d.reason || 'Temporarily locked from PC');
          setEditingSoundId(null);
          setIsAddOpen(false);
          setPlayingClip(null);
        } else {
          showToast('Unlocked from PC', 'success');
        }
      },
      onLocked: (reason) => {
        setToken(null);
        setIsTempLocked(false);
        setIsStreamConnected(false);
        setLockMessage(reason || 'Session locked on desktop');
      },
      onConnectionChange: setIsStreamConnected,
    });
    return disconnect;
  }, [token]);

  const handlePinSubmit = async (pin: string) => {
    const res = await verifyPin(pin);
    setLockMessage(null);
    setIsTempLocked(false);
    applySnapshot(res.state);
    setToken(res.token);
  };

  const handleLock = async () => {
    if (token) await logoutSession(token);
    setToken(null);
    setIsTempLocked(false);
    setIsStreamConnected(false);
    setLockMessage(null);
  };

  const handleToggleFullscreen = async () => {
    const doc: any = document;
    const el: any = document.documentElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else showToast('Use browser "Add to Home Screen" for full screen');
      }
    } catch {
      showToast('Use browser "Add to Home Screen" for full screen');
    }
  };

  const filteredSounds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sounds.filter((s) => {
      if (tab === 'favorites' && !s.isFavorite) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.author && s.author.toLowerCase().includes(q)) ||
        (s.hotkey && s.hotkey.toLowerCase().includes(q))
      );
    });
  }, [sounds, tab, searchQuery]);

  const filteredClips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videoClips.filter((c) => {
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || (c.game && c.game.toLowerCase().includes(q));
    });
  }, [videoClips, searchQuery]);

  const editingSound = useMemo(
    () => (editingSoundId ? sounds.find((s) => s.id === editingSoundId) || null : null),
    [sounds, editingSoundId]
  );

  const nowPlayingSound = useMemo(() => {
    if (activeSoundIds.length === 0) return null;
    const latestId = activeSoundIds[activeSoundIds.length - 1];
    return sounds.find((s) => s.id === latestId) || null;
  }, [activeSoundIds, sounds]);

  if (!token) {
    return <PinGate hostName={hostName} lockMessage={lockMessage} onSubmitPin={handlePinSubmit} />;
  }

  if (isTempLocked) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#07090e] flex flex-col items-center justify-between px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] select-none relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-[110px] opacity-20"
          style={{ background: '#f59e0b' }}
        />

        <div className="w-full max-w-sm flex items-center justify-between pt-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <img src={prismLogo} alt="Prism" className="w-6 h-6 object-contain" />
            <span className="text-[15px] font-bold tracking-tight text-white">Prism Deck</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.09] text-[11px] font-medium text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isStreamConnected ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <Wifi size={12} className="text-amber-400" />
            <span className="max-w-[130px] truncate">{hostName || 'Studio PC'}</span>
          </div>
        </div>

        <div className="w-full max-w-xs flex flex-col items-center text-center gap-4 my-auto relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-300 shadow-[0_0_28px_rgba(245,158,11,0.18)]">
            <Lock size={24} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[20px] font-bold tracking-tight text-white">
              {tempLockReason}
            </h1>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              Your session is paused. When unlocked from your PC, this screen will reconnect automatically with no PIN needed.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11.5px] font-medium text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>{isStreamConnected ? 'Waiting for PC unlock...' : 'Reconnecting stream...'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLock}
          className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[12px] font-semibold text-slate-300 cursor-pointer relative z-10"
        >
          Disconnect (Require PIN)
        </button>
      </div>
    );
  }

  const handleUploadAudioFile = async (file: File, customTitle?: string) => {
    if (file.size > 35 * 1024 * 1024) {
      throw new Error('File must be 35 MB or smaller');
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
    await uploadSoundFile(token, {
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      base64,
      title: customTitle,
    });
    showToast(`Added ${customTitle || file.name}`, 'success');
  };

  const handleApiError = (err: any, fallback: string) => {
    if (err?.status === 423) {
      setIsTempLocked(true);
      setTempLockReason(err.message || 'Temporarily locked from PC');
      return;
    }
    showToast(err?.message || fallback, 'error');
  };

  const handlePadTrigger = (soundId: string) => {
    navigator.vibrate?.(12);
    triggerSound(token, soundId).catch((e) => handleApiError(e, 'Trigger failed'));
  };

  const handleTriggerAudioClip = async () => {
    navigator.vibrate?.(18);
    try {
      await triggerAudioClip(token, settings.recordDuration);
      showToast(`Capturing last ${settings.recordDuration}s audio clip...`);
    } catch (e: any) {
      handleApiError(e, 'Audio clip failed');
    }
  };

  const handleTriggerVideoClip = async () => {
    navigator.vibrate?.(20);
    setIsTriggeringVideoClip(true);
    try {
      await triggerVideoClip(token, settings.videoClipDuration);
      showToast(`Saving last ${settings.videoClipDuration}s video clip...`);
      setTimeout(() => setIsTriggeringVideoClip(false), 6000);
    } catch (e: any) {
      setIsTriggeringVideoClip(false);
      handleApiError(e, 'Video clip failed');
    }
  };

  const hasActiveFilterOrSearch = tab !== 'all' || searchQuery.trim().length > 0;
  const liveProgress = nowPlayingSound ? progressMap[nowPlayingSound.id] || 0 : 0;
  const nowPlayingProgress = scrubProgress !== null ? scrubProgress : liveProgress;

  const computeScrubRatio = (clientX: number): number => {
    const el = scrubTrackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const commitSeek = (ratio: number, force = false) => {
    if (!nowPlayingSound || !token) return;
    const now = Date.now();
    if (force || now - lastSeekSentRef.current >= 55) {
      lastSeekSentRef.current = now;
      seekSound(token, nowPlayingSound.id, ratio).catch(() => {});
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090e] text-white flex flex-col pb-14">
      {/* Compact Single-Row Top Studio Bar (Notch-safe horizontal insets) */}
      <header className="sticky top-0 z-30 bg-[#07090e]/90 backdrop-blur-xl border-b border-white/[0.08] pl-[max(1.25rem,calc(env(safe-area-inset-left)+0.75rem))] pr-[max(1.25rem,calc(env(safe-area-inset-right)+0.75rem))] pt-[max(0.45rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Brand & Live Status */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain shrink-0" />
            <span className="text-[13.5px] font-bold tracking-tight text-white truncate">
              Prism<span className="hidden sm:inline"> Deck</span>
            </span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isStreamConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            {hasActiveFilterOrSearch && (
              <span
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-white/[0.04] text-[10.5px] font-semibold truncate max-w-[140px]"
              >
                {tab === 'favorites' ? 'Favorites' : tab === 'clips' ? 'Videos' : ''}
                {tab !== 'all' && searchQuery.trim() ? ' · ' : ''}
                {searchQuery.trim() ? `"${searchQuery.trim()}"` : ''}
              </span>
            )}
          </div>

          {/* Right: Menu (Search/Filters), Mixer, Audio Clip, Video Clip, Fullscreen, Lock */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowFilterMenu((v) => !v);
                setShowMixer(false);
              }}
              style={
                showFilterMenu || hasActiveFilterOrSearch
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : undefined
              }
              className={`h-8 px-2 rounded-lg border flex items-center gap-1.5 text-[11.5px] font-semibold cursor-pointer transition-colors relative ${
                showFilterMenu
                  ? 'bg-white/[0.1]'
                  : 'bg-white/[0.05] border-white/[0.09] text-slate-200'
              }`}
              aria-label="Search and filters"
            >
              <Menu size={14} />
              <span className="hidden sm:inline">Menu</span>
              {hasActiveFilterOrSearch && (
                <span
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="w-1.5 h-1.5 rounded-full"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowMixer((v) => !v);
                setShowFilterMenu(false);
              }}
              style={showMixer ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                showMixer ? 'bg-white/[0.1]' : 'bg-white/[0.05] border-white/[0.09] text-slate-300'
              }`}
              aria-label="Master mixer"
            >
              <SlidersHorizontal size={14} />
            </button>

            <button
              type="button"
              disabled={isRecordingClip}
              onClick={handleTriggerAudioClip}
              className="h-8 px-2 rounded-lg bg-white/[0.06] active:bg-white/[0.14] border border-white/[0.09] text-[11px] font-semibold text-slate-100 flex items-center gap-1 cursor-pointer disabled:opacity-60"
            >
              {isRecordingClip ? (
                <Loader2 size={12} className="animate-spin text-sky-400" />
              ) : (
                <Scissors size={12} style={{ color: 'var(--accent)' }} />
              )}
              <span>
                <span className="hidden sm:inline">Clip </span>
                {settings.recordDuration || 5}s
              </span>
            </button>

            <button
              type="button"
              disabled={isTriggeringVideoClip}
              onClick={handleTriggerVideoClip}
              className="h-8 px-2 rounded-lg bg-white/[0.06] active:bg-white/[0.14] border border-white/[0.09] text-[11px] font-semibold text-slate-100 flex items-center gap-1 cursor-pointer disabled:opacity-60"
            >
              {isTriggeringVideoClip ? (
                <Loader2 size={12} className="animate-spin text-sky-400" />
              ) : (
                <Video size={12} style={{ color: 'var(--accent)' }} />
              )}
              <span>
                <span className="hidden sm:inline">Vid </span>
                {settings.videoClipDuration || 30}s
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="w-8 h-8 rounded-lg bg-white/[0.05] active:bg-white/[0.14] border border-white/[0.09] text-slate-200 flex items-center justify-center cursor-pointer"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button
              type="button"
              onClick={handleLock}
              aria-label="Lock session"
              className="w-8 h-8 rounded-lg bg-white/[0.05] active:bg-white/[0.14] border border-white/[0.09] text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <Lock size={14} />
            </button>
          </div>
        </div>

        {/* Collapsible Search & Filter Menu Drawer */}
        {showFilterMenu && (
          <div className="mt-2 p-2.5 rounded-2xl bg-[#10141f] border border-white/[0.12] shadow-2xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tab === 'clips' ? 'Search video clips...' : 'Search sounds...'}
                  className="w-full h-9 pl-8 pr-8 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12.5px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] sm:w-72 shrink-0">
                {[
                  { id: 'all', label: `All (${sounds.length})` },
                  { id: 'favorites', label: 'Favorites' },
                  { id: 'clips', label: `Videos (${videoClips.length})` },
                ].map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTab(item.id as any);
                        setShowFilterMenu(false);
                      }}
                      className={`h-8 px-2 rounded-lg text-[11.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        active ? 'bg-white/[0.14] text-white' : 'text-slate-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
              <span>Connected to {hostName}</span>
              {hasActiveFilterOrSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('all');
                    setSearchQuery('');
                  }}
                  className="text-sky-400 font-semibold cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Collapsible Soundboard Volume Drawer (Host mic/voice controls disabled remotely) */}
        {showMixer && (
          <div className="mt-2 p-3 rounded-2xl bg-[#10141f] border border-white/[0.12] shadow-2xl space-y-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Volume2 size={13} style={{ color: 'var(--accent)' }} />
                  Soundboard Output Volume
                </span>
                <span className="font-mono-tabular font-bold text-white">
                  {settings.masterSpeakerVolume}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.masterSpeakerVolume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings((prev) => ({ ...prev, masterSpeakerVolume: val, masterMicVolume: val }));
                  updateSettings(token, { masterSpeakerVolume: val }).catch(() => {});
                }}
                className="prism-range w-full"
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Content — Notch-Safe Horizontal Padding + Compact 5-Column Cards */}
      <main className="flex-1 w-full max-w-3xl mx-auto pl-[max(1.75rem,calc(env(safe-area-inset-left)+1.25rem))] pr-[max(1.75rem,calc(env(safe-area-inset-right)+1.25rem))] py-3">
        {tab === 'clips' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredClips.length === 0 ? (
              <div className="col-span-full py-12 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-slate-400">
                  <Film size={20} />
                </div>
                <p className="text-[13.5px] font-semibold text-slate-300">No video clips yet</p>
                <button
                  type="button"
                  onClick={handleTriggerVideoClip}
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="h-9 px-4 rounded-xl text-slate-950 font-bold text-[12.5px] inline-flex items-center gap-2 cursor-pointer"
                >
                  <Video size={14} />
                  <span>Capture Last {settings.videoClipDuration || 30}s Clip</span>
                </button>
              </div>
            ) : (
              filteredClips.map((clip) => (
                <div
                  key={clip.id}
                  className="p-3 rounded-2xl bg-[#10141f] border border-white/[0.09] flex items-center justify-between gap-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setPlayingClip(clip)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-sky-400 shrink-0">
                      <Play size={16} fill="currentColor" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{clip.title}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        {formatDuration(clip.duration)} • {(clip.fileSize / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateVideoClip(token, clip.id, { isFavorite: !clip.isFavorite }).catch(() => {})
                      }
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${
                        clip.isFavorite
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-white/[0.04] border-white/[0.09] text-slate-400'
                      }`}
                    >
                      <Star size={13} fill={clip.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteVideoClip(token, clip.id).catch(() => {})}
                      className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.09] text-slate-400 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : filteredSounds.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-slate-400">
              <Music size={20} />
            </div>
            <p className="text-[13.5px] font-semibold text-slate-300">
              {searchQuery ? 'No matching sounds' : 'Your soundboard is empty'}
            </p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              style={{ backgroundColor: 'var(--accent)' }}
              className="h-9 px-4 rounded-xl text-slate-950 font-bold text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>Add Sound</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 min-[480px]:grid-cols-5 gap-3 sm:gap-3.5">
            {filteredSounds.map((sound) => {
              const isPlaying = activeSoundIds.includes(sound.id);
              const isPaused = pausedSoundIds.includes(sound.id);
              const prog = progressMap[sound.id] || 0;
              const hasThumbnail = !!sound.thumbnail;
              const isClip = sound.source === 'clip' || sound.title.toLowerCase().startsWith('clipped');

              return (
                <div
                  key={sound.id}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    longPressTriggeredRef.current = false;
                    longPressOriginRef.current = { x: e.clientX, y: e.clientY };
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      navigator.vibrate?.(25);
                      setEditingSoundId(sound.id);
                    }, 430);
                  }}
                  onPointerMove={(e) => {
                    const origin = longPressOriginRef.current;
                    if (!origin) return;
                    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                      longPressOriginRef.current = null;
                    }
                  }}
                  onPointerUp={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    longPressOriginRef.current = null;
                  }}
                  onPointerCancel={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    longPressOriginRef.current = null;
                  }}
                  onClick={() => {
                    if (longPressTriggeredRef.current) return;
                    handlePadTrigger(sound.id);
                  }}
                  className="group relative aspect-square flex flex-col cursor-pointer select-none transition-transform active:scale-[0.96]"
                >
                  {/* Ambient Thumbnail Color Glow (Matches Main App SoundCard) */}
                  {hasThumbnail ? (
                    <div
                      className={`absolute -inset-2 rounded-3xl bg-cover bg-center blur-xl pointer-events-none transition-opacity duration-300 ${
                        isPlaying ? 'opacity-55' : 'opacity-30'
                      }`}
                      style={{ backgroundImage: `url(${sound.thumbnail})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <div
                      className={`absolute -inset-2 rounded-3xl blur-xl pointer-events-none transition-opacity duration-300 ${
                        isPlaying ? 'opacity-35' : 'opacity-15'
                      }`}
                      style={{ backgroundColor: 'var(--accent)' }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Frosted Glass Card Surface (Matches Main App SoundCard) */}
                  <div
                    style={
                      isPlaying
                        ? {
                            borderColor: 'var(--accent)',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                          }
                        : undefined
                    }
                    className={`relative flex-1 flex flex-col p-1.5 sm:p-2 rounded-2xl border transition-all duration-200 overflow-hidden backdrop-blur-2xl ${
                      isPlaying
                        ? 'bg-[#102030]/75'
                        : 'bg-[#0e1219]/75 border-white/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.35)]'
                    }`}
                  >
                    {/* Subtle Top Specular Sheen */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

                    {/* Inner Framed Artwork Area (Vivid Full Color, Zero Dimming) */}
                    <div className="relative z-10 flex-1 w-full rounded-xl bg-black/50 border border-white/[0.1] overflow-hidden flex items-center justify-center shadow-md">
                      {hasThumbnail ? (
                        <img
                          src={sound.thumbnail}
                          alt={sound.title}
                          draggable={false}
                          className="w-full h-full object-cover opacity-100 pointer-events-none"
                          loading="lazy"
                        />
                      ) : isClip ? (
                        <Clapperboard size={24} style={{ color: 'var(--accent)' }} className="opacity-85" />
                      ) : (
                        <Music size={24} style={{ color: 'var(--accent)' }} className="opacity-85" />
                      )}

                      {/* Playing Equalizer / Paused Center Indicator */}
                      {isPlaying && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center z-20 pointer-events-none">
                          <div
                            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                            className="w-8 h-8 rounded-full bg-black/80 border flex items-center justify-center shadow-md"
                          >
                            {isPaused ? (
                              <Pause size={12} fill="currentColor" />
                            ) : (
                              <div className="flex items-end gap-[2.5px] h-3 w-3 justify-center">
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.6s_infinite_alternate]"
                                  style={{ height: '55%', backgroundColor: 'var(--accent)' }}
                                />
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.8s_infinite_alternate]"
                                  style={{ height: '100%', backgroundColor: 'var(--accent)' }}
                                />
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.5s_infinite_alternate]"
                                  style={{ height: '75%', backgroundColor: 'var(--accent)' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Live playback progress strip at bottom of artwork frame */}
                      {isPlaying && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/50 z-20">
                          <div
                            className="h-full transition-all duration-100"
                            style={{
                              width: `${Math.min(100, Math.max(0, prog * 100))}%`,
                              backgroundColor: 'var(--accent)',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Clean Single-Line Title Below Artwork */}
                    <div className="relative z-10 mt-1.5 px-0.5 shrink-0">
                      <h4 className="text-[11px] sm:text-[11.5px] font-medium text-slate-100 truncate">
                        {sound.title}
                      </h4>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-[#171d2c] border border-white/[0.15] shadow-2xl text-[12px] font-semibold text-white whitespace-nowrap pointer-events-none">
          {toast.message}
        </div>
      )}

      {/* Slim Space-Efficient Bottom Bar with Interactive Scrub Progress */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0b0e16]/95 backdrop-blur-2xl border-t border-white/[0.1] pl-[max(1.25rem,calc(env(safe-area-inset-left)+0.75rem))] pr-[max(1.25rem,calc(env(safe-area-inset-right)+0.75rem))] pt-2 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {/* Interactive Full-Width Playback Scrub Bar */}
        {nowPlayingSound && (
          <div
            ref={scrubTrackRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const ratio = computeScrubRatio(e.clientX);
              setScrubProgress(ratio);
              commitSeek(ratio, true);
            }}
            onPointerMove={(e) => {
              if (scrubProgress === null) return;
              const ratio = computeScrubRatio(e.clientX);
              setScrubProgress(ratio);
              commitSeek(ratio);
            }}
            onPointerUp={(e) => {
              if (scrubProgress === null) return;
              const ratio = computeScrubRatio(e.clientX);
              commitSeek(ratio, true);
              setScrubProgress(null);
            }}
            onPointerCancel={() => setScrubProgress(null)}
            className="absolute -top-2.5 left-0 right-0 h-5 flex items-center cursor-pointer touch-none group"
            aria-label="Seek playback"
          >
            <div className="w-full h-[3px] group-active:h-[5px] bg-white/[0.14] transition-all relative">
              <div
                className="h-full relative"
                style={{
                  width: `${Math.min(100, Math.max(0, nowPlayingProgress * 100))}%`,
                  backgroundColor: 'var(--accent)',
                }}
              >
                <span
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full shadow-md ring-2 ring-[#07090e]"
                />
              </div>
            </div>
          </div>
        )}

        <div className="w-full flex items-center gap-2">
          {/* Panic Stop All */}
          <button
            type="button"
            onClick={() => {
              navigator.vibrate?.(25);
              stopAll(token).catch(() => {});
            }}
            className="h-9 px-3 rounded-xl bg-rose-600 active:bg-rose-500 text-white font-bold text-[12px] flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform cursor-pointer"
          >
            <Square size={12} fill="currentColor" />
            <span>Stop</span>
          </button>

          {/* Compact Single-Line Now Playing Pill */}
          <div className="relative flex-1 min-w-0 h-9 px-3 rounded-xl bg-white/[0.05] border border-white/[0.09] flex items-center justify-between gap-2 overflow-hidden">
            {nowPlayingSound ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                  <span className="text-[12px] font-bold text-white truncate">
                    {nowPlayingSound.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-tabular text-[10.5px] text-slate-400 hidden xs:inline sm:inline">
                    {formatDuration((nowPlayingSound.duration || 0) * nowPlayingProgress)} / {formatDuration(nowPlayingSound.duration)}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePauseSound(token, nowPlayingSound.id).catch(() => {})}
                    className="w-7 h-7 rounded-lg bg-white/[0.1] text-white flex items-center justify-center shrink-0 cursor-pointer"
                    aria-label="Pause or resume"
                  >
                    {pausedSoundIds.includes(nowPlayingSound.id) ? (
                      <Play size={12} fill="currentColor" />
                    ) : (
                      <Pause size={12} fill="currentColor" />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <span className="text-[11.5px] text-slate-400 truncate">
                Ready • {sounds.length} sounds • Hold pad for options
              </span>
            )}
          </div>

          {/* Compact Add Sound Button */}
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            style={{ backgroundColor: 'var(--accent)' }}
            className="h-9 px-3 rounded-xl text-slate-950 font-bold text-[12px] flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add</span>
          </button>
        </div>
      </footer>

      {/* Video Preview Modal */}
      {playingClip && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPlayingClip(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#10141f] border border-white/[0.14] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <p className="text-[13.5px] font-bold text-white truncate">{playingClip.title}</p>
              <button
                type="button"
                onClick={() => setPlayingClip(null)}
                className="w-8 h-8 rounded-xl bg-white/[0.06] text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <video
              controls
              autoPlay
              playsInline
              src={`/api/clips/${encodeURIComponent(playingClip.id)}/video?token=${encodeURIComponent(token)}`}
              className="w-full max-h-[70dvh] bg-black"
            />
          </div>
        </div>
      )}

      {/* Property Editor Sheet */}
      <SoundEditSheet
        sound={editingSound}
        token={token}
        isPlaying={editingSound ? activeSoundIds.includes(editingSound.id) : false}
        onClose={() => setEditingSoundId(null)}
        onTrigger={handlePadTrigger}
        onPatchSound={async (soundId, patch) => {
          await updateSound(token, soundId, patch);
        }}
        onDeleteSound={async (soundId) => {
          await deleteSound(token, soundId);
          setEditingSoundId(null);
          showToast('Moved sound to Trash');
        }}
      />

      {/* Add Sound Sheet (YouTube & Upload) */}
      <AddSoundSheet
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSearchYouTube={(q: string) => searchYouTube(token, q)}
        onLoadTrending={() => getTrendingYouTube(token)}
        onDownloadYouTube={async (item: YouTubeSearchResult) => {
          await downloadYouTubeSound(token, {
            url: item.url,
            title: item.title,
            thumbnail: item.thumbnail,
            durationSec: item.durationSec,
          });
          showToast(`Added ${item.title}`, 'success');
        }}
        onUploadFile={handleUploadAudioFile}
      />
    </div>
  );
};
