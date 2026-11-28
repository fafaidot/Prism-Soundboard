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
  VolumeX,
  Play,
  Pause,
  Trash2,
  Music,
  Clapperboard,
  Film,
  Loader2,
  Wifi,
  User,
  Bell,
  MoreVertical,
  LogOut,
} from 'lucide-react';
import { SoundItem, VideoClipItem, YouTubeSearchResult, RemoteGuestPermissions, ActivePlaybackEntry, RemoteActivityEvent } from '../types';
import {
  RemoteStateSnapshot,
  RemoteSettingsSnapshot,
  RemoteSessionInfo,
  getHealth,
  verifyPin,
  submitFriendName,
  getSessionStatus,
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

const FRIEND_NAME_STORAGE_KEY = 'prism_remote_friend_name';

function loadSavedFriendName(): string {
  try {
    return (localStorage.getItem(FRIEND_NAME_STORAGE_KEY) || '').trim().slice(0, 36);
  } catch {
    return '';
  }
}

function persistSavedFriendName(name: string): void {
  try {
    if (name) localStorage.setItem(FRIEND_NAME_STORAGE_KEY, name);
    else localStorage.removeItem(FRIEND_NAME_STORAGE_KEY);
  } catch {}
}

export const MobileApp: React.FC = () => {
  // Token stays strictly in React memory -> PIN is required every time a phone connects
  const [token, setToken] = useState<string | null>(null);
  const [hostName, setHostName] = useState('Studio PC');
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [isTempLocked, setIsTempLocked] = useState(false);
  const [tempLockReason, setTempLockReason] = useState<string>('Timed out from PC');
  const [tempLockedUntil, setTempLockedUntil] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [clockMs, setClockMs] = useState<number>(() => Date.now());
  const [isStreamConnected, setIsStreamConnected] = useState(false);

  const [sounds, setSounds] = useState<SoundItem[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClipItem[]>([]);
  const [activeSoundIds, setActiveSoundIds] = useState<string[]>([]);
  const [pausedSoundIds, setPausedSoundIds] = useState<string[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [activePlaybacks, setActivePlaybacks] = useState<ActivePlaybackEntry[]>([]);
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
  const [sessionRole, setSessionRole] = useState<'owner' | 'guest'>('owner');
  const [permissions, setPermissions] = useState<RemoteGuestPermissions>({
    canStopAll: true,
    canControlVolume: true,
    canEditSounds: true,
    canDeleteSounds: true,
    canAddSounds: true,
    canAudioClip: true,
    canVideoClip: true,
  });
  const [savedFriendName, setSavedFriendName] = useState<string>(() => loadSavedFriendName());
  const [pinLengths, setPinLengths] = useState<number[]>([4]);
  const [requiresName, setRequiresName] = useState(false);
  const [friendNameInput, setFriendNameInput] = useState<string>(() => loadSavedFriendName());
  const [submittingName, setSubmittingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Mobile View State
  const [tab, setTab] = useState<'all' | 'favorites' | 'clips' | 'youtube' | 'videos'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [activityFeed, setActivityFeed] = useState<RemoteActivityEvent[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [liveNotification, setLiveNotification] = useState<RemoteActivityEvent | null>(null);
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedFeedRef = useRef(false);
  const liveNotifTimerRef = useRef<any>(null);
  const showNotificationsRef = useRef(false);
  showNotificationsRef.current = showNotifications;
  const lastSyncHashesRef = useRef<{
    active: string;
    paused: string;
    progress: string;
    playbacks: string;
    session: string;
  }>({ active: '', paused: '', progress: '', playbacks: '', session: '' });
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [playingClip, setPlayingClip] = useState<VideoClipItem | null>(null);
  const [toast, setToast] = useState<{ message: string; kind?: string } | null>(null);
  const toastTimerRef = useRef<any>(null);
  const longPressTimerRef = useRef<any>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Interactive scrub bar & quick mute memory
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [prevSpeakerVolume, setPrevSpeakerVolume] = useState<number>(100);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);
  const lastSeekSentRef = useRef<number>(0);

  const showToast = (message: string, kind: string = 'info') => {
    setToast({ message, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    if (token) return;
    getHealth()
      .then((h) => {
        if (h.hostName) setHostName(h.hostName);
        if (Array.isArray(h.pinLengths) && h.pinLengths.length > 0) {
          setPinLengths(h.pinLengths);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor || '#38bdf8');
  }, [settings.accentColor]);

  const applyPermissions = (session?: RemoteSessionInfo) => {
    if (!session) return;
    setSessionRole(session.role);
    setRequiresName(session.role === 'guest' && !!session.requiresName);
    setPermissions(session.permissions);
    if (typeof session.cooldownSeconds === 'number') {
      setCooldownSeconds(session.cooldownSeconds);
    }
    if (!session.permissions.canEditSounds && !session.permissions.canDeleteSounds) {
      setEditingSoundId(null);
    }
    if (!session.permissions.canAddSounds) {
      setIsAddOpen(false);
    }
    if (!session.permissions.canVideoClip) {
      setPlayingClip(null);
      setTab((prev) => (prev === 'videos' ? 'all' : prev));
    }
  };

  const ingestActivityItems = (items?: RemoteActivityEvent[]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    if (!hasInitializedFeedRef.current) {
      hasInitializedFeedRef.current = true;
      for (const item of items) {
        if (item?.id) seenActivityIdsRef.current.add(item.id);
      }
      setActivityFeed(items.slice(0, 50));
      return;
    }

    const fresh: RemoteActivityEvent[] = [];
    for (const item of items) {
      if (!item?.id || seenActivityIdsRef.current.has(item.id)) continue;
      seenActivityIdsRef.current.add(item.id);
      fresh.push(item);
    }

    if (fresh.length === 0) return;

    setActivityFeed((prev) => {
      const merged = [...fresh, ...prev];
      const uniq: RemoteActivityEvent[] = [];
      const seen = new Set<string>();
      for (const entry of merged) {
        if (entry?.id && !seen.has(entry.id)) {
          seen.add(entry.id);
          uniq.push(entry);
        }
        if (uniq.length >= 50) break;
      }
      return uniq;
    });

    if (!showNotificationsRef.current) {
      setUnreadNotifications((n) => Math.min(99, n + fresh.length));
    }

    // Keep 'play' events in the Bell feed without floating popup clutter (Now Playing already shows who played)
    const bannerEvent = fresh.find((item) => item.type !== 'play');
    if (bannerEvent) {
      setLiveNotification(bannerEvent);
      if (liveNotifTimerRef.current) clearTimeout(liveNotifTimerRef.current);
      liveNotifTimerRef.current = setTimeout(() => setLiveNotification(null), 2800);
    }
  };

  const applySnapshot = (snap: RemoteStateSnapshot) => {
    if (Array.isArray(snap.sounds)) setSounds(snap.sounds);
    if (Array.isArray(snap.videoClips)) setVideoClips(snap.videoClips);
    if (Array.isArray(snap.activeSoundIds)) setActiveSoundIds(snap.activeSoundIds);
    if (Array.isArray(snap.pausedSoundIds)) setPausedSoundIds(snap.pausedSoundIds);
    if (snap.progressMap) setProgressMap(snap.progressMap);
    if (Array.isArray(snap.activePlaybacks)) setActivePlaybacks(snap.activePlaybacks);
    if (Array.isArray(snap.recentActivity)) ingestActivityItems(snap.recentActivity);
    if (snap.settings) setSettings(snap.settings);
    setIsRecordingClip(!!snap.isRecordingClip);
    if (snap.hostName) setHostName(snap.hostName);
    if (snap.session) applyPermissions(snap.session);
  };

  // Live countdown ticker (only runs while timed timeout or spam cooldown is active)
  const isCooldownActive = sessionRole === 'guest' && cooldownUntil > clockMs;
  const hasTimeoutCountdown = isTempLocked && !!tempLockedUntil;

  useEffect(() => {
    if (!isCooldownActive && !hasTimeoutCountdown) return;
    const stepMs = isCooldownActive ? 100 : 1000;
    const id = setInterval(() => {
      const now = Date.now();
      setClockMs(now);
      if (hasTimeoutCountdown && tempLockedUntil && now >= tempLockedUntil && token) {
        syncStatusNow(token);
      }
    }, stepMs);
    return () => clearInterval(id);
  }, [isCooldownActive, hasTimeoutCountdown, tempLockedUntil, token]);

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
      onPlaybacks: setActivePlaybacks,
      onActivity: (entry) => ingestActivityItems([entry]),
      onSettings: setSettings,
      onRecording: setIsRecordingClip,
      onPermissions: applyPermissions,
      onToast: (t) => showToast(t.message, t.kind),
      onTempLocked: (d) => {
        setIsTempLocked(!!d.locked);
        setTempLockedUntil(d.locked ? d.until || null : null);
        if (d.locked) {
          setClockMs(Date.now());
          setTempLockReason(d.reason || 'Timed out from PC');
          setEditingSoundId(null);
          setIsAddOpen(false);
          setPlayingClip(null);
        } else {
          showToast('Timeout ended', 'success');
        }
      },
      onLocked: (reason) => {
        setToken(null);
        setIsTempLocked(false);
        setTempLockedUntil(null);
        setCooldownUntil(0);
        setIsStreamConnected(false);
        hasInitializedFeedRef.current = false;
        seenActivityIdsRef.current.clear();
        setLockMessage(reason || 'Session ended on desktop');
      },
      onConnectionChange: setIsStreamConnected,
    });
    return disconnect;
  }, [token]);

  // Always-on lightweight sync loop + immediate wake sync so Timeout & playing state stay synced even if a proxy buffers SSE
  const syncStatusNow = (activeToken: string) => {
    getSessionStatus(activeToken)
      .then((st) => {
        setIsTempLocked((prev) => {
          if (prev && !st.tempLocked) {
            showToast('Timeout ended', 'success');
          }
          return !!st.tempLocked;
        });
        setTempLockedUntil(st.tempLocked ? st.tempLockedUntil || null : null);
        if (st.tempLocked) {
          setClockMs(Date.now());
          setTempLockReason('Timed out from PC');
          setEditingSoundId(null);
          setIsAddOpen(false);
          setPlayingClip(null);
        }
        if (st.session) {
          const sessHash = JSON.stringify(st.session);
          if (sessHash !== lastSyncHashesRef.current.session) {
            lastSyncHashesRef.current.session = sessHash;
            applyPermissions(st.session);
          }
        }
        if (Array.isArray(st.activeSoundIds)) {
          const h = st.activeSoundIds.join(',');
          if (h !== lastSyncHashesRef.current.active) {
            lastSyncHashesRef.current.active = h;
            setActiveSoundIds(st.activeSoundIds);
          }
        }
        if (Array.isArray(st.pausedSoundIds)) {
          const h = st.pausedSoundIds.join(',');
          if (h !== lastSyncHashesRef.current.paused) {
            lastSyncHashesRef.current.paused = h;
            setPausedSoundIds(st.pausedSoundIds);
          }
        }
        if (st.progressMap) {
          const h = JSON.stringify(st.progressMap);
          if (h !== lastSyncHashesRef.current.progress) {
            lastSyncHashesRef.current.progress = h;
            setProgressMap(st.progressMap);
          }
        }
        if (Array.isArray(st.activePlaybacks)) {
          const h = JSON.stringify(st.activePlaybacks);
          if (h !== lastSyncHashesRef.current.playbacks) {
            lastSyncHashesRef.current.playbacks = h;
            setActivePlaybacks(st.activePlaybacks);
          }
        }
        if (Array.isArray(st.recentActivity)) ingestActivityItems(st.recentActivity);
      })
      .catch((err: any) => {
        if (err?.status === 401) {
          setToken(null);
          setIsTempLocked(false);
          setIsStreamConnected(false);
          hasInitializedFeedRef.current = false;
          seenActivityIdsRef.current.clear();
          setLockMessage('Session expired — enter PIN to reconnect');
        }
      });
  };

  useEffect(() => {
    if (!token) return;
    syncStatusNow(token);

    const intervalMs = isTempLocked ? 1200 : 1800;
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden' && !isTempLocked) return;
      syncStatusNow(token);
    }, intervalMs);

    const onWake = () => syncStatusNow(token);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    // Leaving/closing the tab locks the user out immediately so they don't linger in Standby
    const handleLeaveSite = () => {
      const url = `/api/auth/logout?token=${encodeURIComponent(token)}`;
      let sent = false;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          sent = navigator.sendBeacon(url);
        }
      } catch {}
      if (!sent) {
        try {
          fetch(url, { method: 'POST', keepalive: true, cache: 'no-store' }).catch(() => {});
        } catch {}
      }
      setToken(null);
      setIsTempLocked(false);
      setTempLockedUntil(null);
      setCooldownUntil(0);
      setIsStreamConnected(false);
      hasInitializedFeedRef.current = false;
      seenActivityIdsRef.current.clear();
      setLockMessage('Session locked after leaving the page');
    };

    window.addEventListener('pagehide', handleLeaveSite);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pagehide', handleLeaveSite);
    };
  }, [token, isTempLocked]);

  const handlePinSubmit = async (pin: string) => {
    const remembered = savedFriendName.trim();
    const res = await verifyPin(pin, remembered || undefined);
    setLockMessage(null);
    setIsTempLocked(false);
    setTempLockedUntil(null);
    setCooldownUntil(0);
    applySnapshot(res.state);
    setToken(res.token);
  };

  const handleLock = async () => {
    if (token) await logoutSession(token);
    setToken(null);
    setRequiresName(false);
    setFriendNameInput(savedFriendName);
    setIsTempLocked(false);
    setTempLockedUntil(null);
    setCooldownUntil(0);
    setIsStreamConnected(false);
    setShowNotifications(false);
    setUnreadNotifications(0);
    setLiveNotification(null);
    hasInitializedFeedRef.current = false;
    seenActivityIdsRef.current.clear();
    setLockMessage(null);
  };

  const isAudioClipSound = (s: SoundItem) =>
    s.source === 'clip' || (s.title || '').toLowerCase().startsWith('clipped');

  const isYouTubeSound = (s: SoundItem) => {
    if (s.source === 'youtube') return true;
    if (s.author && (s.author.toLowerCase().includes('youtube') || s.author.toLowerCase().includes('yt'))) return true;
    if (s.thumbnail && (s.thumbnail.includes('ytimg') || s.thumbnail.includes('youtube') || s.thumbnail.includes('ggpht'))) return true;
    return false;
  };

  const filteredSounds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sounds.filter((s) => {
      if (tab === 'favorites' && !s.isFavorite) return false;
      if (tab === 'clips' && !isAudioClipSound(s)) return false;
      if (tab === 'youtube' && !isYouTubeSound(s)) return false;
      if (!q) return true;
      const title = (s.title || '').toLowerCase();
      return (
        title.includes(q) ||
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

  const clipCount = useMemo(() => sounds.filter(isAudioClipSound).length, [sounds]);
  const favoriteCount = useMemo(() => sounds.filter((s) => !!s.isFavorite).length, [sounds]);

  if (!token) {
    return (
      <PinGate
        hostName={hostName}
        lockMessage={lockMessage}
        savedName={savedFriendName}
        pinLengths={pinLengths}
        onClearSavedName={() => {
          persistSavedFriendName('');
          setSavedFriendName('');
          setFriendNameInput('');
        }}
        onSubmitPin={handlePinSubmit}
      />
    );
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
          {(() => {
            const remSec = tempLockedUntil ? Math.max(0, Math.ceil((tempLockedUntil - clockMs) / 1000)) : null;
            const remLabel =
              remSec === null
                ? null
                : remSec < 60
                ? `${remSec}s`
                : `${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, '0')}`;
            return (
              <>
                <div className="space-y-1.5">
                  <h1 className="text-[20px] font-bold tracking-tight text-white">
                    {tempLockReason === 'Temporarily locked from PC' ? 'Timed out from PC' : tempLockReason}
                  </h1>
                  {remLabel && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 font-mono-tabular text-[15px] font-bold text-amber-200 mt-1">
                      <span>Unlocks in {remLabel}</span>
                    </div>
                  )}
                  <p className="text-[13px] text-slate-400 leading-relaxed pt-1">
                    {remLabel
                      ? 'You are on a timed timeout. When the countdown ends (or the host ends it early), you will resume automatically with no PIN needed.'
                      : 'You are in timeout. When the host ends the timeout on PC, this screen will resume automatically with no PIN needed.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11.5px] font-medium text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {remLabel
                      ? isStreamConnected
                        ? `Resuming automatically in ${remLabel}...`
                        : 'Checking timeout status...'
                      : isStreamConnected
                      ? 'Waiting for host to end timeout...'
                      : 'Checking timeout status...'}
                  </span>
                </div>
              </>
            );
          })()}
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

  if (sessionRole === 'guest' && requiresName) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#07090e] flex flex-col items-center justify-between px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] select-none relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[360px] h-[220px] rounded-full blur-[110px] opacity-25"
          style={{ background: 'var(--accent)' }}
        />

        <div className="w-full max-w-sm flex items-center justify-between pt-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <img src={prismLogo} alt="Prism" className="w-6 h-6 object-contain" />
            <span className="text-[15px] font-bold tracking-tight text-white">Prism Deck</span>
          </div>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = friendNameInput.trim().slice(0, 36);
            if (!clean || submittingName) return;
            setSubmittingName(true);
            setNameError(null);
            try {
              const res = await submitFriendName(token, clean);
              persistSavedFriendName(clean);
              setSavedFriendName(clean);
              applyPermissions(res.session);
              setRequiresName(false);
            } catch (err: any) {
              setNameError(err?.message || 'Could not save name');
            } finally {
              setSubmittingName(false);
            }
          }}
          className="w-full max-w-xs flex flex-col items-center gap-4 my-auto relative z-10"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-sky-400">
            <User size={21} />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-[20px] font-bold tracking-tight text-white">What's your name?</h1>
            <p className="text-[12.5px] text-slate-400">Shown on the host soundboard</p>
          </div>

          <input
            type="text"
            autoFocus
            maxLength={36}
            value={friendNameInput}
            onChange={(e) => {
              setFriendNameInput(e.target.value);
              setNameError(null);
            }}
            placeholder="Your name"
            className="w-full h-12 px-4 rounded-2xl bg-white/[0.06] border border-white/[0.12] text-[15px] font-medium text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 text-center"
          />

          {nameError && <p className="text-[12px] text-rose-400 font-semibold">{nameError}</p>}

          <button
            type="submit"
            disabled={!friendNameInput.trim() || submittingName}
            style={{ backgroundColor: 'var(--accent)' }}
            className="w-full h-12 rounded-2xl text-slate-950 font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer"
          >
            {submittingName ? <Loader2 size={17} className="animate-spin" /> : 'Continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLock}
          className="text-[12px] text-slate-400 hover:text-white cursor-pointer relative z-10"
        >
          Back
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
      setClockMs(Date.now());
      setIsTempLocked(true);
      setTempLockReason(err.message || 'Timed out from PC');
      setTempLockedUntil(err?.data?.tempLockedUntil || null);
      return;
    }
    if (err?.status === 429) {
      const remMs = Number(err?.data?.cooldownRemainingMs) || 1000;
      const now = Date.now();
      setClockMs(now);
      setCooldownUntil(now + remMs);
      navigator.vibrate?.(8);
      return;
    }
    showToast(err?.message || fallback, 'error');
  };

  const handlePadTrigger = (soundId: string) => {
    const now = Date.now();
    if (sessionRole === 'guest' && cooldownSeconds > 0 && cooldownUntil > now) {
      navigator.vibrate?.(6);
      return;
    }
    navigator.vibrate?.(12);
    const optimisticUntil =
      sessionRole === 'guest' && cooldownSeconds > 0
        ? now + Math.round(cooldownSeconds * 1000)
        : 0;
    if (optimisticUntil > now) {
      setClockMs(now);
      setCooldownUntil(optimisticUntil);
    }
    triggerSound(token, soundId)
      .then(() => {
        setTimeout(() => syncStatusNow(token), 90);
      })
      .catch((e) => {
        if (e?.status !== 429 && optimisticUntil) {
          setCooldownUntil(0);
        }
        handleApiError(e, 'Trigger failed');
      });
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

  const canControlVolume = sessionRole === 'owner' || !!permissions.canControlVolume;
  const hasBottomBarActions =
    permissions.canStopAll || canControlVolume || permissions.canAddSounds;
  const isPlayingAnything = activeSoundIds.length > 0;
  const isCooldownShowing = sessionRole === 'guest' && cooldownUntil > clockMs;
  const showBottomDock = Boolean(nowPlayingSound || hasBottomBarActions || isCooldownShowing);

  return (
    <div
      className={`min-h-[100dvh] w-full bg-[#07090e] text-white flex flex-col ${
        showBottomDock ? (nowPlayingSound ? 'pb-28' : 'pb-16') : 'pb-6'
      }`}
    >
      {/* Clean Top Bar: Brand + Role on Left, Labeled Quick Actions + Activity + Leave on Right */}
      <header className="sticky top-0 z-30 bg-[#07090e]/95 border-b border-white/[0.08] pl-[max(1rem,calc(env(safe-area-inset-left)+0.75rem))] pr-[max(1rem,calc(env(safe-area-inset-right)+0.75rem))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Brand & Live Connection */}
          <div className="flex items-center gap-2 min-w-0">
            <img src={prismLogo} alt="Prism" className="w-5 h-5 object-contain shrink-0" />
            <span className="text-[14.5px] font-bold tracking-tight text-white truncate">
              Prism
            </span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isStreamConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
              title={isStreamConnected ? 'Connected' : 'Reconnecting'}
            />
          </div>

          {/* Right: Labeled Capture Actions, Notifications, Exit */}
          <div className="flex items-center gap-1.5 shrink-0">
            {permissions.canAudioClip && (
              <button
                type="button"
                disabled={isRecordingClip}
                onClick={handleTriggerAudioClip}
                className="h-8 px-2.5 rounded-xl bg-white/[0.06] active:bg-white/[0.14] border border-white/[0.1] text-[11.5px] font-semibold text-slate-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isRecordingClip ? (
                  <Loader2 size={13} className="animate-spin text-sky-400" />
                ) : (
                  <Scissors size={13} style={{ color: 'var(--accent)' }} />
                )}
                <span>Clip {settings.recordDuration || 5}s</span>
              </button>
            )}

            {permissions.canVideoClip && (
              <button
                type="button"
                disabled={isTriggeringVideoClip}
                onClick={handleTriggerVideoClip}
                className="h-8 px-2.5 rounded-xl bg-white/[0.06] active:bg-white/[0.14] border border-white/[0.1] text-[11.5px] font-semibold text-slate-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isTriggeringVideoClip ? (
                  <Loader2 size={13} className="animate-spin text-sky-400" />
                ) : (
                  <Video size={13} style={{ color: 'var(--accent)' }} />
                )}
                <span>Vid {settings.videoClipDuration || 30}s</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowNotifications((v) => {
                  const next = !v;
                  if (next) setUnreadNotifications(0);
                  return next;
                });
              }}
              style={showNotifications ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer transition-colors relative ${
                showNotifications ? 'bg-white/[0.1]' : 'bg-white/[0.05] border-white/[0.09] text-slate-300'
              }`}
              aria-label="Activity notifications"
            >
              <Bell size={14} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLock}
              aria-label="Disconnect and lock"
              title="Disconnect"
              className="h-8 px-2.5 rounded-xl bg-white/[0.05] active:bg-white/[0.14] border border-white/[0.09] text-slate-300 text-[11.5px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden xs:inline sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* Always-Visible Search + One-Tap Filter Pills */}
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                tab === 'videos'
                  ? `Search ${videoClips.length} video clips...`
                  : `Search ${sounds.length} sounds...`
              }
              className="w-full h-9 pl-8.5 pr-8 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12.5px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: 'all', label: `All (${sounds.length})` },
              { id: 'favorites', label: favoriteCount > 0 ? `Favorites (${favoriteCount})` : 'Favorites' },
              { id: 'clips', label: clipCount > 0 ? `Clips (${clipCount})` : 'Clips' },
              { id: 'youtube', label: 'YouTube' },
              ...(permissions.canVideoClip
                ? [{ id: 'videos', label: `Videos (${videoClips.length})` }]
                : []),
            ].map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as any)}
                  style={
                    active
                      ? {
                          backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--accent) 65%, transparent)',
                          color: '#ffffff',
                        }
                      : undefined
                  }
                  className={`h-7 px-3 rounded-full text-[11.5px] font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? ''
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {hasActiveFilterOrSearch && (
              <button
                type="button"
                onClick={() => {
                  setTab('all');
                  setSearchQuery('');
                }}
                style={{ color: 'var(--accent)' }}
                className="h-7 px-2 text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Activity Notifications Drawer */}
        {showNotifications && (
          <div className="mt-2 p-3 rounded-2xl bg-[#10141f] border border-white/[0.12] shadow-2xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                <Bell size={13} style={{ color: 'var(--accent)' }} />
                <span>Live Activity ({activityFeed.length})</span>
              </span>
              <div className="flex items-center gap-2">
                {activityFeed.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivityFeed([]);
                      setUnreadNotifications(0);
                    }}
                    className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close notifications"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {activityFeed.length === 0 ? (
              <p className="text-[11.5px] text-slate-400 py-3 text-center">No recent activity yet.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.06] pr-1">
                {activityFeed.map((ev) => {
                  const secAgo = Math.max(0, Math.floor((Date.now() - ev.timestamp) / 1000));
                  const timeLabel =
                    secAgo < 5 ? 'Just now' : secAgo < 60 ? `${secAgo}s` : `${Math.floor(secAgo / 60)}m`;
                  return (
                    <div key={ev.id} className="py-2 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          style={{ backgroundColor: ev.color }}
                          className="w-6 h-6 rounded-full text-[9.5px] font-black text-slate-950 flex items-center justify-center shrink-0"
                        >
                          {ev.initials}
                        </span>
                        <div className="min-w-0 text-[11.5px] leading-snug">
                          <span className="font-bold text-white">{ev.actorName}</span>{' '}
                          <span className="text-slate-300">{ev.action}</span>
                          {ev.detail && (
                            <span className="font-semibold text-white"> “{ev.detail}”</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono-tabular text-slate-500 shrink-0">{timeLabel}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto pl-[max(1rem,calc(env(safe-area-inset-left)+0.75rem))] pr-[max(1rem,calc(env(safe-area-inset-right)+0.75rem))] py-3">
        {tab === 'videos' ? (
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
                    {permissions.canEditSounds && (
                      <button
                        type="button"
                        onClick={() =>
                          updateVideoClip(token, clip.id, { isFavorite: !clip.isFavorite }).catch((e) =>
                            handleApiError(e, 'Update failed')
                          )
                        }
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${
                          clip.isFavorite
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                            : 'bg-white/[0.04] border-white/[0.09] text-slate-400'
                        }`}
                      >
                        <Star size={13} fill={clip.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    {permissions.canDeleteSounds && (
                      <button
                        type="button"
                        onClick={() =>
                          deleteVideoClip(token, clip.id).catch((e) => handleApiError(e, 'Delete failed'))
                        }
                        className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.09] text-slate-400 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
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
            {permissions.canAddSounds && (
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                style={{ backgroundColor: 'var(--accent)' }}
                className="h-9 px-4 rounded-xl text-slate-950 font-bold text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>Add Sound</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3">
            {filteredSounds.map((sound) => {
              const playingActor = activePlaybacks.find((p) => p.soundId === sound.id) || null;
              const isPlaying = activeSoundIds.includes(sound.id) || !!playingActor;
              const isPaused = pausedSoundIds.includes(sound.id);
              const prog = progressMap[sound.id] || 0;
              const activeAccent = playingActor?.color || 'var(--accent)';
              const hasThumbnail = !!sound.thumbnail;
              const isClip = sound.source === 'clip' || (sound.title || '').toLowerCase().startsWith('clipped');

              return (
                <div
                  key={sound.id}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    longPressTriggeredRef.current = false;
                    if (!permissions.canEditSounds && !permissions.canDeleteSounds) return;
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
                  {/* Lightweight Playing Glow only (avoids 180+ simultaneous GPU blur layers crashing mobile WebKit) */}
                  {isPlaying && (
                    <div
                      className="absolute -inset-1 rounded-3xl blur-md opacity-30 pointer-events-none"
                      style={{ backgroundColor: activeAccent }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Crisp Dark Card Surface (Zero heavy per-card backdrop-blur on mobile grids) */}
                  <div
                    style={
                      isPlaying
                        ? {
                            borderColor: activeAccent,
                            boxShadow: `0 0 18px ${activeAccent}45, 0 8px 20px rgba(0, 0, 0, 0.55)`,
                          }
                        : undefined
                    }
                    className={`relative flex-1 flex flex-col p-1.5 sm:p-2 rounded-2xl transition-all duration-200 overflow-hidden ${
                      isPlaying
                        ? 'bg-[#102030] border-2'
                        : 'bg-[#0e1219] border border-white/[0.1] shadow-[0_4px_14px_rgba(0,0,0,0.35)]'
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

                      {/* Duration badge (subtle bottom-right inside artwork) */}
                      {typeof sound.duration === 'number' && sound.duration > 0 && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/75 text-[9px] font-mono-tabular font-semibold text-slate-200 pointer-events-none z-10">
                          {formatDuration(sound.duration)}
                        </span>
                      )}

                      {/* Player Color + Initials Circle Badge (Visible whenever played) */}
                      {isPlaying && playingActor && (
                        <div
                          style={{ backgroundColor: playingActor.color }}
                          title={`Playing: ${playingActor.actorName}`}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 border-[#07090e] shadow-lg flex items-center justify-center text-[9.5px] font-black text-slate-950 tracking-tight z-30 pointer-events-none"
                        >
                          {playingActor.initials}
                        </div>
                      )}

                      {/* Playing Equalizer / Paused Center Indicator */}
                      {isPlaying && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20 pointer-events-none">
                          <div
                            style={{ borderColor: activeAccent, color: activeAccent }}
                            className="w-8 h-8 rounded-full bg-black/80 border-2 flex items-center justify-center shadow-md"
                          >
                            {isPaused ? (
                              <Pause size={12} fill="currentColor" />
                            ) : (
                              <div className="flex items-end gap-[2.5px] h-3 w-3 justify-center">
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.6s_infinite_alternate]"
                                  style={{ height: '55%', backgroundColor: activeAccent }}
                                />
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.8s_infinite_alternate]"
                                  style={{ height: '100%', backgroundColor: activeAccent }}
                                />
                                <span
                                  className="w-[2px] rounded-full animate-[bounce_0.5s_infinite_alternate]"
                                  style={{ height: '75%', backgroundColor: activeAccent }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Live playback progress strip at bottom of artwork frame */}
                      {isPlaying && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3.5px] bg-black/60 z-20">
                          <div
                            className="h-full transition-all duration-100"
                            style={{
                              width: `${Math.min(100, Math.max(4, prog * 100))}%`,
                              backgroundColor: activeAccent,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Clear 2-Line Title + Slim Inline Options Trigger Below Artwork */}
                    <div className="relative z-10 mt-1.5 px-0.5 h-7 flex items-start justify-between gap-0.5 shrink-0">
                      <h4 className="text-[11px] leading-[1.25] font-semibold text-slate-100 line-clamp-2 flex-1 min-w-0">
                        {sound.title}
                      </h4>
                      {(permissions.canEditSounds || permissions.canDeleteSounds) && (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSoundId(sound.id);
                          }}
                          aria-label={`Options for ${sound.title}`}
                          className="w-4 h-5 -mr-0.5 rounded text-slate-400 hover:text-white active:bg-white/[0.1] flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <MoreVertical size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Single Floating Feedback Pill (Toast takes priority over Live Notification so they never overlap) */}
      {toast ? (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-[#171d2c] border border-white/[0.15] shadow-2xl text-[12px] font-semibold text-white whitespace-nowrap pointer-events-none ${
            showBottomDock ? (nowPlayingSound || isCooldownShowing ? 'bottom-30' : 'bottom-18') : 'bottom-6'
          }`}
        >
          {toast.message}
        </div>
      ) : (
        liveNotification &&
        !showNotifications && (
          <div
            className={`fixed left-1/2 -translate-x-1/2 z-40 max-w-[92vw] px-3 py-1.5 rounded-full bg-[#131927]/95 border border-white/[0.14] shadow-2xl flex items-center gap-2 pointer-events-none ${
              showBottomDock ? (nowPlayingSound || isCooldownShowing ? 'bottom-30' : 'bottom-18') : 'bottom-6'
            }`}
          >
            <span
              style={{ backgroundColor: liveNotification.color }}
              className="w-5 h-5 rounded-full text-[9px] font-black text-slate-950 flex items-center justify-center shrink-0"
            >
              {liveNotification.initials}
            </span>
            <span className="text-[11.5px] text-slate-200 truncate">
              <span className="font-bold text-white">{liveNotification.actorName}</span>{' '}
              {liveNotification.action}
              {liveNotification.detail ? ` “${liveNotification.detail}”` : ''}
            </span>
          </div>
        )
      )}

      {/* Compact Single-Row Action & Volume Dock (+ Optional Slim Now-Playing Strip Above) */}
      {showBottomDock && (
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0b0e16]/95 border-t border-white/[0.1] pl-[max(1rem,calc(env(safe-area-inset-left)+0.75rem))] pr-[max(1rem,calc(env(safe-area-inset-right)+0.75rem))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-2">
          {/* Interactive Playback Progress Bar along top edge */}
          {nowPlayingSound && (
            permissions.canStopAll ? (
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
            ) : (
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/[0.12] pointer-events-none">
                <div
                  className="h-full transition-all duration-100"
                  style={{
                    width: `${Math.min(100, Math.max(3, nowPlayingProgress * 100))}%`,
                    backgroundColor: 'var(--accent)',
                  }}
                />
              </div>
            )
          )}

          {/* Slim Now Playing Strip (Only visible while playing) OR Cooldown Strip */}
          {(nowPlayingSound || isCooldownShowing) && (
            <div className="flex items-center justify-between gap-2 px-2.5 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08]">
              {nowPlayingSound ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const actor = activePlaybacks.find((p) => p.soundId === nowPlayingSound.id);
                      return actor ? (
                        <span
                          style={{ backgroundColor: actor.color }}
                          title={actor.actorName}
                          className="w-5 h-5 rounded-full text-[9px] font-black text-slate-950 flex items-center justify-center shrink-0"
                        >
                          {actor.initials}
                        </span>
                      ) : (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      );
                    })()}
                    <span className="text-[12px] font-semibold text-white truncate">
                      {nowPlayingSound.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isCooldownShowing && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono-tabular font-bold text-amber-200">
                        {((cooldownUntil - clockMs) / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span className="font-mono-tabular text-[10.5px] text-slate-400">
                      {formatDuration((nowPlayingSound.duration || 0) * nowPlayingProgress)} / {formatDuration(nowPlayingSound.duration)}
                    </span>
                    {permissions.canStopAll && (
                      <button
                        type="button"
                        onClick={() =>
                          togglePauseSound(token, nowPlayingSound.id).catch((e) => handleApiError(e, 'Pause failed'))
                        }
                        className="w-6 h-6 rounded-lg bg-white/[0.1] text-white flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Pause or resume"
                      >
                        {pausedSoundIds.includes(nowPlayingSound.id) ? (
                          <Play size={11} fill="currentColor" />
                        ) : (
                          <Pause size={11} fill="currentColor" />
                        )}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full flex items-center justify-between text-[11px] font-semibold text-amber-200">
                  <span>Spam Cooldown</span>
                  <span className="font-mono-tabular">
                    Wait {((cooldownUntil - clockMs) / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Single-Row Controls: Stop | Soundboard Volume Slider | + Add */}
          {hasBottomBarActions && (
            <div className="w-full flex items-center gap-2">
              {permissions.canStopAll && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.vibrate?.(25);
                    stopAll(token).catch((e) => handleApiError(e, 'Stop failed'));
                  }}
                  className={`h-9 px-3 rounded-xl font-bold text-[12px] flex items-center gap-1.5 shrink-0 active:scale-95 transition-all cursor-pointer ${
                    isPlayingAnything
                      ? 'bg-rose-600 active:bg-rose-500 text-white shadow-sm'
                      : 'bg-rose-500/15 active:bg-rose-500/25 border border-rose-500/35 text-rose-200'
                  }`}
                >
                  <Square size={12} fill="currentColor" />
                  <span>Stop</span>
                </button>
              )}

              {canControlVolume ? (
                <div className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-white/[0.05] border border-white/[0.09] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const isMuted = settings.masterSpeakerVolume === 0;
                      const nextVol = isMuted ? (prevSpeakerVolume > 0 ? prevSpeakerVolume : 100) : 0;
                      if (!isMuted) setPrevSpeakerVolume(settings.masterSpeakerVolume || 100);
                      setSettings((prev) => ({ ...prev, masterSpeakerVolume: nextVol, masterMicVolume: nextVol }));
                      updateSettings(token, { masterSpeakerVolume: nextVol }).catch(() => {});
                    }}
                    aria-label={settings.masterSpeakerVolume === 0 ? 'Unmute soundboard' : 'Mute soundboard'}
                    className="text-slate-200 hover:text-white cursor-pointer shrink-0"
                  >
                    {settings.masterSpeakerVolume === 0 ? (
                      <VolumeX size={14} className="text-rose-400" />
                    ) : (
                      <Volume2 size={14} style={{ color: 'var(--accent)' }} />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.masterSpeakerVolume}
                    aria-label="Soundboard Volume"
                    style={{
                      background: `linear-gradient(to right, var(--accent) ${settings.masterSpeakerVolume}%, rgba(255,255,255,0.14) ${settings.masterSpeakerVolume}%)`,
                    }}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSettings((prev) => ({ ...prev, masterSpeakerVolume: val, masterMicVolume: val }));
                      updateSettings(token, { masterSpeakerVolume: val }).catch(() => {});
                    }}
                    className="prism-range-compact flex-1 min-w-0 cursor-pointer"
                  />
                  <span className="font-mono-tabular text-[10.5px] font-bold text-slate-200 w-8 text-right shrink-0">
                    {settings.masterSpeakerVolume}%
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {permissions.canAddSounds && (
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="h-9 px-3 rounded-xl text-slate-950 font-bold text-[12px] flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
                >
                  <Plus size={15} strokeWidth={2.5} />
                  <span>Add</span>
                </button>
              )}
            </div>
          )}
        </footer>
      )}

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
        canEdit={permissions.canEditSounds}
        canDelete={permissions.canDeleteSounds}
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
        isOpen={isAddOpen && permissions.canAddSounds}
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
