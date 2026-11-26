import { SoundItem, VideoClipItem, YouTubeSearchResult } from '../types';

export interface RemoteSettingsSnapshot {
  accentColor: string;
  theme: string;
  masterSpeakerVolume: number;
  masterMicVolume: number;
  micInputVolume: number;
  hearMyself: boolean;
  isMicPassThroughEnabled: boolean;
  recordDuration: number;
  videoClipDuration: number;
  recordSource: 'all' | 'screen' | 'mic';
}

export interface RemoteStateSnapshot {
  sounds: SoundItem[];
  videoClips: VideoClipItem[];
  activeSoundIds: string[];
  pausedSoundIds: string[];
  progressMap: Record<string, number>;
  settings: RemoteSettingsSnapshot;
  isRecordingClip: boolean;
  hostName: string;
  appVersion: string;
}

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text || 'Unexpected response' };
  }

  if (!res.ok) {
    const err: any = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json as T;
}

export async function getHealth(): Promise<{ ok: boolean; hostName: string; appVersion: string }> {
  return apiFetch('/api/health', '');
}

export async function verifyPin(pin: string): Promise<{ token: string; state: RemoteStateSnapshot }> {
  return apiFetch('/api/auth/verify', '', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export async function logoutSession(token: string): Promise<void> {
  await apiFetch('/api/auth/logout', token, { method: 'POST' }).catch(() => {});
}

export async function triggerSound(token: string, soundId: string): Promise<void> {
  await apiFetch(`/api/sounds/${encodeURIComponent(soundId)}/trigger`, token, { method: 'POST' });
}

export async function stopAll(token: string): Promise<void> {
  await apiFetch('/api/stop-all', token, { method: 'POST' });
}

export async function togglePauseSound(token: string, soundId: string): Promise<void> {
  await apiFetch(`/api/playback/${encodeURIComponent(soundId)}/pause`, token, { method: 'POST' });
}

export async function seekSound(token: string, soundId: string, progress: number): Promise<void> {
  await apiFetch(`/api/playback/${encodeURIComponent(soundId)}/seek`, token, {
    method: 'POST',
    body: JSON.stringify({ progress }),
  });
}

export async function triggerAudioClip(token: string, duration?: number): Promise<void> {
  await apiFetch('/api/clip/audio', token, {
    method: 'POST',
    body: JSON.stringify(duration ? { duration } : {}),
  });
}

export async function triggerVideoClip(token: string, duration?: number): Promise<void> {
  await apiFetch('/api/clip/video', token, {
    method: 'POST',
    body: JSON.stringify(duration ? { duration } : {}),
  });
}

export async function updateSound(token: string, soundId: string, patch: Partial<SoundItem>): Promise<{ sound: SoundItem }> {
  return apiFetch(`/api/sounds/${encodeURIComponent(soundId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteSound(token: string, soundId: string): Promise<void> {
  await apiFetch(`/api/sounds/${encodeURIComponent(soundId)}`, token, { method: 'DELETE' });
}

export async function updateSettings(token: string, patch: Partial<RemoteSettingsSnapshot>): Promise<void> {
  await apiFetch('/api/settings', token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getTrendingYouTube(token: string): Promise<YouTubeSearchResult[]> {
  const res = await apiFetch<{ results: YouTubeSearchResult[] }>('/api/youtube/trending', token);
  return res.results || [];
}

export async function searchYouTube(token: string, query: string): Promise<YouTubeSearchResult[]> {
  const res = await apiFetch<{ results: YouTubeSearchResult[] }>(
    `/api/youtube/search?q=${encodeURIComponent(query)}`,
    token
  );
  return res.results || [];
}

export async function downloadYouTubeSound(
  token: string,
  payload: { url: string; title?: string; thumbnail?: string; durationSec?: number }
): Promise<{ sound: SoundItem }> {
  return apiFetch('/api/youtube/download', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadSoundFile(
  token: string,
  payload: { fileName: string; mimeType: string; base64: string; title?: string; duration?: number }
): Promise<{ sound: SoundItem }> {
  return apiFetch('/api/sounds/upload', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVideoClip(
  token: string,
  clipId: string,
  patch: { title?: string; isFavorite?: boolean }
): Promise<{ clip: VideoClipItem }> {
  return apiFetch(`/api/clips/${encodeURIComponent(clipId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteVideoClip(token: string, clipId: string): Promise<void> {
  await apiFetch(`/api/clips/${encodeURIComponent(clipId)}`, token, { method: 'DELETE' });
}

export interface StreamCallbacks {
  onState: (snapshot: RemoteStateSnapshot) => void;
  onSounds: (sounds: SoundItem[]) => void;
  onClips: (clips: VideoClipItem[]) => void;
  onActive: (activeIds: string[]) => void;
  onPaused: (pausedIds: string[]) => void;
  onProgress: (progressMap: Record<string, number>) => void;
  onSettings: (settings: RemoteSettingsSnapshot) => void;
  onRecording: (isRecordingClip: boolean) => void;
  onToast: (toast: { message: string; kind?: string }) => void;
  onTempLocked: (payload: { locked: boolean; reason?: string }) => void;
  onLocked: (reason: string) => void;
  onConnectionChange: (connected: boolean) => void;
}

export function connectRemoteEvents(token: string, cb: StreamCallbacks): () => void {
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

  es.onopen = () => cb.onConnectionChange(true);
  es.onerror = () => cb.onConnectionChange(false);

  const bind = <T,>(name: string, fn: (data: T) => void) => {
    es.addEventListener(name, (ev: MessageEvent) => {
      try {
        fn(JSON.parse(ev.data));
      } catch {}
    });
  };

  bind<RemoteStateSnapshot>('state', (data) => {
    cb.onConnectionChange(true);
    cb.onState(data);
  });
  bind<SoundItem[]>('sounds', cb.onSounds);
  bind<VideoClipItem[]>('clips', cb.onClips);
  bind<string[]>('active', cb.onActive);
  bind<string[]>('paused', cb.onPaused);
  bind<Record<string, number>>('progress', cb.onProgress);
  bind<RemoteSettingsSnapshot>('settings', cb.onSettings);
  bind<{ isRecordingClip: boolean }>('recording', (d) => cb.onRecording(!!d.isRecordingClip));
  bind<{ message: string; kind?: string }>('toast', cb.onToast);
  bind<{ locked: boolean; reason?: string }>('temp_locked', cb.onTempLocked);
  bind<{ reason?: string }>('locked', (d) => {
    es.close();
    cb.onLocked(d.reason || 'Disconnected');
  });

  return () => {
    es.close();
  };
}
