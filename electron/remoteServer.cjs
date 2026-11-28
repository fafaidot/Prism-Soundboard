// @ts-check
'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

const MAX_JSON_BODY_BYTES = 40 * 1024 * 1024; // 40 MB (supports phone audio upload)

const DEFAULT_GUEST_PERMISSIONS = {
  canStopAll: false,
  canControlVolume: false,
  canEditSounds: false,
  canDeleteSounds: false,
  canAddSounds: false,
  canAudioClip: false,
  canVideoClip: false,
};

const FRIEND_COLORS = [
  '#fb7185', // rose
  '#fbbf24', // amber
  '#34d399', // emerald
  '#a78bfa', // violet
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#a3e635', // lime
];

class RemoteServer {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.enabled = true;
    this.port = 3940;
    this.pin = '';
    this.guestEnabled = true;
    this.guestPin = '';
    this.guestPermissions = { ...DEFAULT_GUEST_PERMISSIONS };
    this.guestCooldownSeconds = 1;
    this.timeoutExpiryTimer = null;
    this.lastError = '';
    this.distDir = '';
    this.devServerUrl = '';
    this.qrCache = { url: '', dataUrl: '' };

    // Authenticated sessions (in-memory only -> PIN required on every fresh phone connection)
    /** @type {Map<string, { id: string, role: 'owner' | 'guest', createdAt: number, lastSeen: number, userAgent: string, label: string, ip: string, tempLocked: boolean }>} */
    this.sessions = new Map();
    /** @type {Map<string, Set<import('http').ServerResponse>>} */
    this.sseClients = new Map();
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.failedAttempts = new Map();

    // Live synchronized snapshot
    this.state = {
      sounds: [],
      videoClips: [],
      activeSoundIds: [],
      pausedSoundIds: [],
      progressMap: {},
      activePlaybacks: [],
      settings: {},
      isRecordingClip: false,
      appVersion: '1.5.7',
    };

    // Rolling live activity log (newest first, max 150)
    this.activityLog = [];

    // Callbacks supplied by electron/main.cjs
    this.handlers = {};
    this.heartbeatTimer = null;
    this.lastProgressBroadcastAt = 0;
  }

  computeInitials(name = '', fallback = 'FR') {
    const clean = String(name || '').trim();
    if (!clean) return fallback;
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  pickFriendColor() {
    const counts = new Map();
    for (const c of FRIEND_COLORS) counts.set(c, 0);
    for (const sess of this.sessions.values()) {
      if (sess.role === 'guest' && sess.color && counts.has(sess.color)) {
        counts.set(sess.color, counts.get(sess.color) + 1);
      }
    }
    let best = FRIEND_COLORS[0];
    let minCount = Infinity;
    for (const c of FRIEND_COLORS) {
      const n = counts.get(c) || 0;
      if (n < minCount) {
        minCount = n;
        best = c;
      }
    }
    return best;
  }

  getActorFromSession(sess) {
    if (!sess) {
      return {
        id: 'host-pc',
        name: 'Host (PC)',
        initials: 'PC',
        color: this.state.settings?.accentColor || '#38bdf8',
        role: 'owner',
      };
    }
    if (sess.role === 'owner') {
      return {
        id: sess.id,
        name: sess.label || 'Host Phone',
        initials: sess.initials || 'HP',
        color: sess.color || this.state.settings?.accentColor || '#38bdf8',
        role: 'owner',
      };
    }
    const name = sess.friendName || sess.label || 'Friend';
    return {
      id: sess.id,
      name,
      initials: sess.initials || this.computeInitials(name, 'FR'),
      color: sess.color || '#a78bfa',
      role: 'guest',
    };
  }

  recordActivity({ type, actor, action, detail = '', soundId = '' }) {
    const who = actor || this.getActorFromSession(null);
    const entry = {
      id: crypto.randomBytes(6).toString('hex'),
      timestamp: Date.now(),
      type: type || 'play',
      actorId: who.id || 'host-pc',
      actorName: who.name || 'Host (PC)',
      initials: who.initials || this.computeInitials(who.name, 'PC'),
      color: who.color || '#38bdf8',
      actorRole: who.role === 'guest' ? 'guest' : 'owner',
      action: String(action || ''),
      detail: detail ? String(detail) : undefined,
      soundId: soundId ? String(soundId) : undefined,
    };
    this.activityLog.unshift(entry);
    if (this.activityLog.length > 150) {
      this.activityLog.length = 150;
    }
    this.broadcastSse('activity', entry);
    this.notifyStatusChanged();
    return entry;
  }

  clearActivityLog() {
    this.activityLog = [];
    this.notifyStatusChanged();
  }

  recordDesktopActivity(evt) {
    if (!evt || !evt.action) return;
    const hostActor = {
      id: 'host-pc',
      name: 'Host (PC)',
      initials: 'PC',
      color: this.state.settings?.accentColor || '#38bdf8',
      role: 'owner',
    };
    this.recordActivity({
      type: evt.type || 'play',
      actor: hostActor,
      action: evt.action,
      detail: evt.detail || '',
      soundId: evt.soundId || '',
    });
  }

  /**
   * Configure paths, initial state, and action callbacks.
   */
  configure({ distDir, devServerUrl, appVersion, handlers }) {
    this.distDir = distDir;
    this.devServerUrl = devServerUrl || '';
    this.state.appVersion = appVersion || '1.5.7';
    this.handlers = handlers || {};
  }

  /**
   * Generate a random 4-digit numeric PIN.
   */
  static generatePin() {
    return String(crypto.randomInt(1000, 10000));
  }

  /**
   * Collect local Wi-Fi / LAN IPv4 addresses prioritized for mobile devices.
   */
  getLanUrls(port = this.port) {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const [name, list] of Object.entries(interfaces)) {
      if (!Array.isArray(list)) continue;
      const lowerName = name.toLowerCase();
      // Deprioritize virtual adapters (WSL, Hyper-V, Docker, VirtualBox, VPNs)
      const isVirtual =
        lowerName.includes('vethernet') ||
        lowerName.includes('wsl') ||
        lowerName.includes('hyper-v') ||
        lowerName.includes('vmware') ||
        lowerName.includes('virtualbox') ||
        lowerName.includes('vbox') ||
        lowerName.includes('docker') ||
        lowerName.includes('tailscale') ||
        lowerName.includes('zerotier') ||
        lowerName.includes('loopback');

      for (const info of list) {
        if (!info || info.family !== 'IPv4' || info.internal) continue;
        const ip = info.address;
        let score = 0;
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan')) score += 40;
        else if (lowerName.includes('ethernet') || lowerName.includes('lan')) score += 30;
        if (!isVirtual) score += 50;
        if (ip.startsWith('192.168.')) score += 25;
        else if (ip.startsWith('10.')) score += 15;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 10;

        candidates.push({ ip, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const uniqueIps = [...new Set(candidates.map((c) => c.ip))];
    const urls = uniqueIps.map((ip) => `http://${ip}:${port}`);
    if (urls.length === 0) {
      urls.push(`http://127.0.0.1:${port}`);
    }
    return urls;
  }

  sanitizeSound(sound) {
    if (!sound || typeof sound !== 'object') return sound;
    const clone = { ...sound };
    delete clone.audioData;
    delete clone.audioPath;
    return clone;
  }

  sanitizeSounds(sounds) {
    if (!Array.isArray(sounds)) return [];
    return sounds.map((s) => this.sanitizeSound(s));
  }

  sanitizeClip(clip) {
    if (!clip || typeof clip !== 'object') return clip;
    return {
      id: clip.id,
      title: clip.title,
      duration: clip.duration,
      fileSize: clip.fileSize,
      dateAdded: clip.dateAdded,
      isFavorite: !!clip.isFavorite,
      game: clip.game,
      width: clip.width,
      height: clip.height,
    };
  }

  sanitizeSettings(settings) {
    const s = settings || {};
    return {
      accentColor: s.accentColor || '#38bdf8',
      theme: s.theme || 'dark',
      masterSpeakerVolume: typeof s.masterSpeakerVolume === 'number' ? s.masterSpeakerVolume : 100,
      masterMicVolume: typeof s.masterMicVolume === 'number' ? s.masterMicVolume : 100,
      recordDuration: s.recordDuration || 5,
      videoClipDuration: s.videoClipDuration || 30,
      recordSource: s.recordSource || 'all',
    };
  }

  getSessionRoleState(sess) {
    if (!sess || sess.role === 'owner') {
      return {
        role: 'owner',
        cooldownSeconds: 0,
        permissions: {
          canStopAll: true,
          canControlVolume: true,
          canEditSounds: true,
          canDeleteSounds: true,
          canAddSounds: true,
          canAudioClip: true,
          canVideoClip: true,
        },
      };
    }
    return {
      role: 'guest',
      name: sess.friendName || '',
      initials: sess.initials || this.computeInitials(sess.friendName || sess.label, 'FR'),
      color: sess.color || '#a78bfa',
      requiresName: !sess.friendName,
      cooldownSeconds: this.guestCooldownSeconds,
      permissions: { ...DEFAULT_GUEST_PERMISSIONS, ...(sess.permissions || this.guestPermissions) },
    };
  }

  getPublicStateSnapshot(sess = null) {
    return {
      sounds: this.sanitizeSounds(this.state.sounds),
      videoClips: (this.state.videoClips || []).map((c) => this.sanitizeClip(c)),
      activeSoundIds: this.state.activeSoundIds || [],
      pausedSoundIds: this.state.pausedSoundIds || [],
      progressMap: this.state.progressMap || {},
      activePlaybacks: this.state.activePlaybacks || [],
      recentActivity: this.activityLog.slice(0, 30),
      settings: this.sanitizeSettings(this.state.settings),
      isRecordingClip: !!this.state.isRecordingClip,
      hostName: os.hostname(),
      appVersion: this.state.appVersion,
      session: this.getSessionRoleState(sess),
    };
  }

  getConnectedClientCount() {
    let total = 0;
    for (const clients of this.sseClients.values()) {
      total += clients.size;
    }
    return total > 0 ? total : this.sessions.size;
  }

  formatDeviceLabel(userAgent = '') {
    const ua = String(userAgent);
    let device = 'Phone';
    if (/iphone/i.test(ua)) device = 'iPhone';
    else if (/ipad/i.test(ua)) device = 'iPad';
    else if (/samsung|sm-[a-z0-9]+/i.test(ua)) device = 'Samsung';
    else if (/pixel/i.test(ua)) device = 'Pixel';
    else if (/android/i.test(ua)) device = 'Android';
    else if (/windows/i.test(ua)) device = 'Windows';
    else if (/macintosh|mac os/i.test(ua)) device = 'Mac';

    let browser = '';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/crios|chrome/i.test(ua)) browser = 'Chrome';
    else if (/fxios|firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';

    return browser ? `${device} • ${browser}` : device;
  }

  cleanIp(ip = '') {
    let clean = String(ip).trim().replace(/^::ffff:/i, '');
    // Strip port if IPv4:port format came from X-Forwarded-For
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(clean)) {
      clean = clean.split(':')[0];
    }
    return clean;
  }

  extractClientIp(req) {
    const sockIp = this.cleanIp(req.socket?.remoteAddress || '');
    const isLoopback = !sockIp || sockIp === '127.0.0.1' || sockIp === '::1' || sockIp === 'localhost';
    if (isLoopback) {
      const cfIp = req.headers['cf-connecting-ip'];
      const realIp = req.headers['x-real-ip'];
      const xff = req.headers['x-forwarded-for'];
      if (cfIp) {
        const cleaned = this.cleanIp(Array.isArray(cfIp) ? cfIp[0] : cfIp);
        if (cleaned) return cleaned;
      }
      if (realIp) {
        const cleaned = this.cleanIp(Array.isArray(realIp) ? realIp[0] : realIp);
        if (cleaned) return cleaned;
      }
      if (xff) {
        const first = String(Array.isArray(xff) ? xff[0] : xff).split(',')[0];
        const cleaned = this.cleanIp(first);
        if (cleaned) return cleaned;
      }
    }
    return sockIp || 'unknown';
  }

  getConnectedDevices() {
    this.checkExpiredTimeouts();
    const devices = [];
    for (const [token, sess] of this.sessions.entries()) {
      const online = (this.sseClients.get(token)?.size || 0) > 0;
      const roleState = this.getSessionRoleState(sess);
      devices.push({
        id: sess.id,
        role: sess.role || 'owner',
        name: sess.friendName || '',
        initials: sess.initials || (sess.role === 'owner' ? 'HP' : this.computeInitials(sess.friendName || sess.label, 'FR')),
        color: sess.color || (sess.role === 'owner' ? this.state.settings?.accentColor || '#38bdf8' : '#a78bfa'),
        label: sess.label || this.formatDeviceLabel(sess.userAgent),
        ip: sess.ip,
        connectedAt: sess.createdAt,
        lastSeen: sess.lastSeen,
        online,
        tempLocked: !!sess.tempLocked,
        tempLockedUntil: sess.tempLockedUntil || null,
        permissions: roleState.permissions,
        hasCustomPermissions: !!sess.hasCustomPermissions,
      });
    }
    return devices.sort((a, b) => a.connectedAt - b.connectedAt);
  }

  async getStatus() {
    const urls = this.isRunning ? this.getLanUrls(this.port) : [];
    const primaryUrl = urls[0] || `http://127.0.0.1:${this.port}`;

    let qrDataUrl = '';
    if (this.isRunning && primaryUrl) {
      if (this.qrCache.url === primaryUrl && this.qrCache.dataUrl) {
        qrDataUrl = this.qrCache.dataUrl;
      } else {
        try {
          qrDataUrl = await QRCode.toDataURL(primaryUrl, {
            width: 240,
            margin: 2,
            color: { dark: '#f8fafc', light: '#00000000' },
          });
          this.qrCache = { url: primaryUrl, dataUrl: qrDataUrl };
        } catch (err) {
          console.error('[RemoteServer] QR generation error:', err);
        }
      }
    }

    const devices = this.getConnectedDevices();
    return {
      enabled: this.enabled,
      running: this.isRunning,
      port: this.port,
      pin: this.pin,
      guestEnabled: this.guestEnabled,
      guestPin: this.guestPin,
      guestPermissions: { ...this.guestPermissions },
      guestCooldownSeconds: this.guestCooldownSeconds,
      urls,
      primaryUrl,
      qrDataUrl,
      connectedClients: this.getConnectedClientCount(),
      devices,
      activePlaybacks: this.state.activePlaybacks || [],
      activityLog: this.activityLog.slice(0, 100),
      error: this.lastError || undefined,
    };
  }

  notifyStatusChanged() {
    if (typeof this.handlers.onStatusChanged === 'function') {
      this.getStatus()
        .then((status) => this.handlers.onStatusChanged(status))
        .catch(() => {});
    }
  }

  sendSseToToken(token, eventName, payload) {
    const clientSet = this.sseClients.get(token);
    if (!clientSet || clientSet.size === 0) return;
    const dataStr = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clientSet) {
      try {
        res.write(dataStr);
        if (typeof res.flush === 'function') res.flush();
      } catch (_) {
        clientSet.delete(res);
        if (clientSet.size === 0) {
          this.sseClients.delete(token);
        }
      }
    }
  }

  broadcastSse(eventName, payload) {
    if (!this.isRunning || this.sseClients.size === 0) return;
    const dataStr = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    const bypassTempLock = eventName === 'locked' || eventName === 'temp_locked';
    for (const [token, clientSet] of this.sseClients.entries()) {
      const sess = this.sessions.get(token);
      if (!bypassTempLock && sess?.tempLocked) continue;
      for (const res of clientSet) {
        try {
          res.write(dataStr);
          if (typeof res.flush === 'function') res.flush();
        } catch (_) {
          clientSet.delete(res);
          if (clientSet.size === 0) {
            this.sseClients.delete(token);
          }
        }
      }
    }
  }

  // State updaters called from main.cjs
  updateSounds(sounds) {
    if (!Array.isArray(sounds)) return;
    this.state.sounds = sounds;
    this.broadcastSse('sounds', this.sanitizeSounds(sounds));
  }

  updateVideoClips(clips) {
    if (!Array.isArray(clips)) return;
    this.state.videoClips = clips;
    this.broadcastSse('clips', clips.map((c) => this.sanitizeClip(c)));
  }

  updateActiveSounds(activeIds) {
    this.state.activeSoundIds = Array.isArray(activeIds) ? activeIds : [];
    this.broadcastSse('active', this.state.activeSoundIds);
  }

  updateActivePlaybacks(playbacks) {
    const clean = Array.isArray(playbacks) ? playbacks : [];
    this.state.activePlaybacks = clean;
    this.broadcastSse('playbacks', clean);
    this.notifyStatusChanged();
  }

  updatePausedSounds(pausedIds) {
    this.state.pausedSoundIds = Array.isArray(pausedIds) ? pausedIds : [];
    this.broadcastSse('paused', this.state.pausedSoundIds);
  }

  updateProgressMap(progressMap) {
    this.state.progressMap = progressMap && typeof progressMap === 'object' ? progressMap : {};
    const now = Date.now();
    if (now - this.lastProgressBroadcastAt >= 120) {
      this.lastProgressBroadcastAt = now;
      this.broadcastSse('progress', this.state.progressMap);
    }
  }

  updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') return;
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.broadcastSse('settings', this.sanitizeSettings(this.state.settings));
  }

  updateRecordingClip(isRecording) {
    this.state.isRecordingClip = !!isRecording;
    this.broadcastSse('recording', { isRecordingClip: this.state.isRecordingClip });
  }

  broadcastToast(message, kind = 'info') {
    this.broadcastSse('toast', { message, kind, ts: Date.now() });
  }

  /**
   * Lock and disconnect all mobile sessions (e.g. PIN changed or manual disconnect).
   */
  disconnectAllClients(reason = 'Session ended on desktop') {
    this.broadcastSse('locked', { reason });
    for (const sess of this.sessions.values()) {
      if (sess.disconnectTimer) {
        clearTimeout(sess.disconnectTimer);
        sess.disconnectTimer = null;
      }
    }
    for (const clientSet of this.sseClients.values()) {
      for (const res of clientSet) {
        try {
          res.end();
        } catch (_) {}
      }
    }
    this.sseClients.clear();
    this.sessions.clear();
    this.notifyStatusChanged();
  }

  /**
   * Disconnect and remove specific or all device sessions (requires PIN to reconnect).
   * @param {string[] | 'all'} deviceIds
   * @param {string} [reason]
   */
  disconnectDevices(deviceIds, reason = 'Removed from desktop') {
    const isAll = deviceIds === 'all';
    const targetIds = Array.isArray(deviceIds) ? new Set(deviceIds) : null;
    if (!isAll && (!targetIds || targetIds.size === 0)) return false;

    let changed = false;
    for (const [token, sess] of [...this.sessions.entries()]) {
      if (!isAll && !targetIds.has(sess.id)) continue;
      changed = true;
      this.sendSseToToken(token, 'locked', { reason });
      const clientSet = this.sseClients.get(token);
      if (clientSet) {
        for (const res of clientSet) {
          try {
            res.end();
          } catch (_) {}
        }
        this.sseClients.delete(token);
      }
      this.sessions.delete(token);
    }

    if (changed) {
      this.notifyStatusChanged();
    }
    return changed;
  }

  formatTimeoutLabel(seconds) {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    if (sec >= 60 && sec % 60 === 0) return `${sec / 60}m`;
    return `${sec}s`;
  }

  /**
   * Auto-unlock any timed timeouts whose expiry timestamp has passed.
   */
  checkExpiredTimeouts() {
    const now = Date.now();
    let changed = false;

    for (const [token, sess] of this.sessions.entries()) {
      if (sess.tempLocked && sess.tempLockedUntil && now >= sess.tempLockedUntil) {
        sess.tempLocked = false;
        sess.tempLockedUntil = null;
        changed = true;

        this.sendSseToToken(token, 'temp_locked', { locked: false, until: null });
        this.sendSseToToken(token, 'state', this.getPublicStateSnapshot(sess));

        const actor = this.getActorFromSession(sess);
        this.recordActivity({
          type: 'timeout',
          actor,
          action: 'Timed timeout ended',
          detail: sess.label,
        });
      }
    }

    this.scheduleTimeoutExpiry();

    if (changed) {
      this.notifyStatusChanged();
    }
    return changed;
  }

  scheduleTimeoutExpiry() {
    if (this.timeoutExpiryTimer) {
      clearTimeout(this.timeoutExpiryTimer);
      this.timeoutExpiryTimer = null;
    }

    let earliest = Infinity;
    for (const sess of this.sessions.values()) {
      if (sess.tempLocked && sess.tempLockedUntil && sess.tempLockedUntil < earliest) {
        earliest = sess.tempLockedUntil;
      }
    }

    if (Number.isFinite(earliest)) {
      const delay = Math.max(50, Math.min(earliest - Date.now() + 25, 2147483647));
      this.timeoutExpiryTimer = setTimeout(() => {
        this.timeoutExpiryTimer = null;
        this.checkExpiredTimeouts();
      }, delay);
      this.timeoutExpiryTimer.unref?.();
    }
  }

  /**
   * Put selected device sessions in Timeout (optionally for durationSeconds) or end Timeout without requiring a PIN to resume.
   * @param {string[] | 'all'} deviceIds
   * @param {boolean} locked
   * @param {number} [durationSeconds=0]
   */
  setTempLockForDevices(deviceIds, locked, durationSeconds = 0) {
    const isAll = deviceIds === 'all';
    const targetIds = Array.isArray(deviceIds) ? new Set(deviceIds) : null;
    if (!isAll && (!targetIds || targetIds.size === 0)) return false;

    const nextLocked = !!locked;
    const durSec =
      nextLocked && Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
        ? Math.round(Number(durationSeconds))
        : 0;
    const nextUntil = nextLocked && durSec > 0 ? Date.now() + durSec * 1000 : null;
    let changed = false;

    for (const [token, sess] of this.sessions.entries()) {
      if (!isAll && !targetIds.has(sess.id)) continue;
      if (!!sess.tempLocked === nextLocked && (sess.tempLockedUntil || null) === nextUntil) continue;

      sess.tempLocked = nextLocked;
      sess.tempLockedUntil = nextUntil;
      changed = true;

      if (nextLocked) {
        this.sendSseToToken(token, 'temp_locked', {
          locked: true,
          reason: 'Timed out from PC',
          until: nextUntil,
        });
      } else {
        this.sendSseToToken(token, 'temp_locked', { locked: false, until: null });
        this.sendSseToToken(token, 'state', this.getPublicStateSnapshot(sess));
      }

      const actor = this.getActorFromSession(sess);
      this.recordActivity({
        type: 'timeout',
        actor,
        action: nextLocked
          ? durSec > 0
            ? `Put in ${this.formatTimeoutLabel(durSec)} timeout`
            : 'Put in timeout'
          : 'Timeout ended',
        detail: sess.label,
      });
    }

    this.scheduleTimeoutExpiry();

    if (changed) {
      this.notifyStatusChanged();
    }
    return changed;
  }

  disconnectGuests(reason = 'Friend access updated on desktop') {
    const guestIds = [];
    for (const sess of this.sessions.values()) {
      if (sess.role === 'guest') guestIds.push(sess.id);
    }
    if (guestIds.length > 0) {
      this.disconnectDevices(guestIds, reason);
    }
  }

  broadcastPermissions() {
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.tempLocked) continue;
      this.sendSseToToken(token, 'permissions', this.getSessionRoleState(sess));
    }
  }

  /**
   * Update default Guest permissions live and push to all non-customized guest sessions.
   */
  setGuestDefaultPermissions(permissionsPatch) {
    if (!permissionsPatch || typeof permissionsPatch !== 'object') return false;
    const next = { ...this.guestPermissions };
    for (const key of Object.keys(DEFAULT_GUEST_PERMISSIONS)) {
      if (typeof permissionsPatch[key] === 'boolean') {
        next[key] = permissionsPatch[key];
      }
    }
    this.guestPermissions = next;

    for (const [token, sess] of this.sessions.entries()) {
      if (sess.role === 'guest' && !sess.hasCustomPermissions) {
        sess.permissions = { ...next };
        if (!sess.tempLocked) {
          this.sendSseToToken(token, 'permissions', this.getSessionRoleState(sess));
        }
      }
    }
    this.notifyStatusChanged();
    return true;
  }

  /**
   * Update an individual connected device's permissions live without affecting other friends.
   */
  setDevicePermissions(deviceId, permissionsPatch) {
    if (!deviceId || !permissionsPatch || typeof permissionsPatch !== 'object') return false;
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.id !== deviceId) continue;
      if (sess.role !== 'guest') return false;
      const base = sess.permissions || { ...this.guestPermissions };
      const next = { ...base };
      for (const key of Object.keys(DEFAULT_GUEST_PERMISSIONS)) {
        if (typeof permissionsPatch[key] === 'boolean') {
          next[key] = permissionsPatch[key];
        }
      }
      sess.permissions = next;
      sess.hasCustomPermissions = true;
      if (!sess.tempLocked) {
        this.sendSseToToken(token, 'permissions', this.getSessionRoleState(sess));
      }
      this.recordActivity({
        type: 'permission',
        actor: this.getActorFromSession(sess),
        action: 'Updated permissions',
        detail: sess.label,
      });
      this.notifyStatusChanged();
      return true;
    }
    return false;
  }

  setPin(newPin) {
    const clean = String(newPin || '').replace(/\D/g, '').slice(0, 6);
    if (clean.length < 4) return false;
    if (clean !== this.pin) {
      this.pin = clean;
      this.disconnectAllClients('PIN changed on desktop');
      this.notifyStatusChanged();
    }
    return true;
  }

  setGuestPin(newPin) {
    const clean = String(newPin || '').replace(/\D/g, '').slice(0, 6);
    if (clean.length < 4 || clean === this.pin) return false;
    if (clean !== this.guestPin) {
      this.guestPin = clean;
      this.disconnectGuests('Friend PIN changed on desktop');
      this.notifyStatusChanged();
    }
    return true;
  }

  /**
   * Start or restart the HTTP server according to settings.
   */
  async applySettings(settings) {
    const enabled = settings?.remoteControlEnabled !== false;
    const port = Number(settings?.remoteControlPort) || 3940;
    const pin = settings?.remoteControlPin ? String(settings.remoteControlPin) : this.pin || RemoteServer.generatePin();
    const guestEnabled = settings?.remoteGuestEnabled !== false;
    let guestPin = settings?.remoteGuestPin ? String(settings.remoteGuestPin) : this.guestPin || RemoteServer.generatePin();
    if (guestPin === pin) {
      guestPin = String((parseInt(pin, 10) + 1379) % 9000 + 1000);
    }
    const nextGuestPerms = {
      ...DEFAULT_GUEST_PERMISSIONS,
      ...(settings?.remoteGuestPermissions || {}),
    };
    const rawCooldown = Number(settings?.remoteGuestCooldownSeconds);
    const nextGuestCooldown = Number.isFinite(rawCooldown) && rawCooldown >= 0
      ? Math.min(60, Math.round(rawCooldown * 10) / 10)
      : 1;

    this.state.settings = { ...this.state.settings, ...(settings || {}) };

    const pinChanged = this.pin && this.pin !== pin;
    const guestPinChanged = this.guestPin && this.guestPin !== guestPin;
    const guestDisabled = this.guestEnabled && !guestEnabled;
    const permsChanged = JSON.stringify(this.guestPermissions) !== JSON.stringify(nextGuestPerms);
    const cooldownChanged = this.guestCooldownSeconds !== nextGuestCooldown;
    const portChanged = this.port !== port;

    this.pin = pin;
    this.guestEnabled = guestEnabled;
    this.guestPin = guestPin;
    this.guestPermissions = nextGuestPerms;
    this.guestCooldownSeconds = nextGuestCooldown;
    this.enabled = enabled;

    if (!enabled) {
      this.stop();
      this.notifyStatusChanged();
      return;
    }

    if (pinChanged && this.isRunning) {
      this.disconnectAllClients('PIN updated on desktop');
    } else if ((guestPinChanged || guestDisabled) && this.isRunning) {
      this.disconnectGuests(guestDisabled ? 'Friend access disabled on desktop' : 'Friend PIN updated on desktop');
    }

    if (!this.isRunning || portChanged) {
      await this.start(port);
    } else {
      this.broadcastSse('settings', this.sanitizeSettings(this.state.settings));
      if (permsChanged || cooldownChanged) {
        this.setGuestDefaultPermissions(nextGuestPerms);
      } else {
        this.notifyStatusChanged();
      }
    }
  }

  async start(requestedPort = 3940) {
    this.stop();
    this.port = requestedPort;
    this.lastError = '';
    this.qrCache = { url: '', dataUrl: '' };

    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[RemoteServer] Unhandled request error:', err);
          if (!res.headersSent) {
            this.sendJson(res, 500, { error: 'Internal server error' });
          }
        });
      });

      server.on('error', (err) => {
        this.isRunning = false;
        this.lastError = err && err.code === 'EADDRINUSE'
          ? `Port ${requestedPort} is already in use by another app.`
          : (err && err.message) || 'Failed to start remote server.';
        console.error('[RemoteServer] Server error:', this.lastError);
        this.notifyStatusChanged();
        resolve(false);
      });

      server.listen(requestedPort, '0.0.0.0', () => {
        this.server = server;
        this.isRunning = true;
        this.lastError = '';
        this.startHeartbeat();
        const urls = this.getLanUrls(requestedPort);
        console.log(`[RemoteServer] Listening on 0.0.0.0:${requestedPort} (LAN: ${urls.join(', ')})`);
        this.notifyStatusChanged();
        resolve(true);
      });
    });
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.checkExpiredTimeouts();
      const now = Date.now();
      let pruned = false;

      // Lock out abandoned sessions (left website: no open SSE and no status poll for >30s)
      for (const [token, sess] of [...this.sessions.entries()]) {
        const hasSse = (this.sseClients.get(token)?.size || 0) > 0;
        if (hasSse) continue;
        const staleMs = now - (sess.lastSeen || sess.createdAt || now);
        if (staleMs > 30000) {
          if (sess.disconnectTimer) {
            clearTimeout(sess.disconnectTimer);
            sess.disconnectTimer = null;
          }
          const actor = this.getActorFromSession(sess);
          this.sessions.delete(token);
          this.recordActivity({
            type: 'leave',
            actor,
            action: 'Left website',
          });
          pruned = true;
        }
      }

      for (const clientSet of this.sseClients.values()) {
        for (const res of clientSet) {
          try {
            res.write(': ping\n\n');
            if (typeof res.flush === 'function') res.flush();
          } catch (_) {}
        }
      }

      if (pruned) {
        this.notifyStatusChanged();
      }
    }, 10000);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.timeoutExpiryTimer) {
      clearTimeout(this.timeoutExpiryTimer);
      this.timeoutExpiryTimer = null;
    }
    this.disconnectAllClients('Server stopped');
    if (this.server) {
      try {
        this.server.close();
      } catch (_) {}
      this.server = null;
    }
    this.isRunning = false;
  }

  // ==========================================
  // HTTP Utilities & Request Routing
  // ==========================================

  sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }

  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let total = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_JSON_BODY_BYTES) {
          req.destroy();
          reject(new Error('Payload too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve(text ? JSON.parse(text) : {});
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  extractToken(req, parsedUrl) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }
    const qToken = parsedUrl.searchParams.get('token');
    return qToken ? qToken.trim() : '';
  }

  requirePermission(res, auth, permKey) {
    if (auth.session.role === 'owner') {
      return true;
    }
    const perms = auth.session.permissions || this.guestPermissions;
    if (perms && perms[permKey]) {
      return true;
    }
    this.sendJson(res, 403, { error: 'Not allowed in Friend mode', permission: permKey });
    return false;
  }

  requireAuth(req, res, parsedUrl, allowWhenTempLocked = false) {
    this.checkExpiredTimeouts();
    const token = this.extractToken(req, parsedUrl);
    if (!token || !this.sessions.has(token)) {
      this.sendJson(res, 401, { error: 'PIN authentication required' });
      return null;
    }
    const sess = this.sessions.get(token);
    sess.lastSeen = Date.now();
    if (sess.disconnectTimer) {
      clearTimeout(sess.disconnectTimer);
      sess.disconnectTimer = null;
    }
    if (!allowWhenTempLocked && sess.tempLocked) {
      this.sendJson(res, 423, {
        error: 'Timed out from PC',
        tempLocked: true,
        tempLockedUntil: sess.tempLockedUntil || null,
      });
      return null;
    }
    return { token, session: sess };
  }

  async handleRequest(req, res) {
    // Allow CORS cleanly when needed on local network
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API Routes
    if (pathname.startsWith('/api/')) {
      return this.handleApi(req, res, parsedUrl, pathname);
    }

    // Static / Dev UI Routes (Public shell; actual data/controls gated behind PIN in browser + API)
    return this.handleStaticOrDev(req, res, pathname);
  }

  async handleApi(req, res, parsedUrl, pathname) {
    const method = (req.method || 'GET').toUpperCase();

    // Public endpoints: health & PIN verification
    if (method === 'GET' && pathname === '/api/health') {
      const pinLengths = Array.from(
        new Set([
          String(this.pin || '').length || 4,
          ...(this.guestEnabled && this.guestPin ? [String(this.guestPin).length] : []),
        ])
      ).sort((a, b) => a - b);
      return this.sendJson(res, 200, {
        ok: true,
        hostName: os.hostname(),
        appVersion: this.state.appVersion,
        pinRequired: true,
        pinLengths,
      });
    }

    if (method === 'POST' && pathname === '/api/auth/verify') {
      const clientIp = this.extractClientIp(req);
      const now = Date.now();
      const rate = this.failedAttempts.get(clientIp);
      if (rate && rate.resetAt > now && rate.count >= 8) {
        const retrySec = Math.ceil((rate.resetAt - now) / 1000);
        return this.sendJson(res, 429, { error: `Too many wrong PIN attempts. Try again in ${retrySec}s.` });
      }

      const body = await this.readJsonBody(req).catch(() => ({}));
      const entered = String(body.pin || '').trim();
      let role = null;
      if (entered && entered === this.pin) {
        role = 'owner';
      } else if (entered && this.guestEnabled && this.guestPin && entered === this.guestPin) {
        role = 'guest';
      }

      if (!role) {
        const next = !rate || rate.resetAt <= now ? { count: 1, resetAt: now + 60000 } : { count: rate.count + 1, resetAt: rate.resetAt };
        this.failedAttempts.set(clientIp, next);
        return this.sendJson(res, 401, { error: 'Incorrect PIN' });
      }

      this.failedAttempts.delete(clientIp);
      const token = crypto.randomBytes(32).toString('hex');
      const ua = String(req.headers['user-agent'] || 'Phone');
      const baseDevice = this.formatDeviceLabel(ua);
      const submittedName = role === 'guest' && body.name ? String(body.name).trim().slice(0, 36) : '';
      const assignedColor =
        role === 'owner' ? this.state.settings?.accentColor || '#38bdf8' : this.pickFriendColor();
      const assignedInitials =
        role === 'owner' ? 'HP' : this.computeInitials(submittedName || baseDevice, 'FR');
      const sess = {
        id: crypto.randomBytes(6).toString('hex'),
        role,
        friendName: submittedName,
        baseLabel: baseDevice,
        color: assignedColor,
        initials: assignedInitials,
        createdAt: now,
        lastSeen: now,
        userAgent: ua,
        label: submittedName ? `${submittedName} (${baseDevice})` : baseDevice,
        ip: clientIp,
        tempLocked: false,
        permissions: role === 'guest' ? { ...this.guestPermissions } : undefined,
        hasCustomPermissions: false,
      };
      this.sessions.set(token, sess);
      this.recordActivity({
        type: 'join',
        actor: this.getActorFromSession(sess),
        action: role === 'guest' ? 'Joined as Friend' : 'Connected as Owner',
        detail: `${sess.label} (${clientIp})`,
      });
      this.notifyStatusChanged();

      return this.sendJson(res, 200, {
        token,
        state: this.getPublicStateSnapshot(sess),
      });
    }

    if (method === 'POST' && pathname === '/api/auth/name') {
      const auth = this.requireAuth(req, res, parsedUrl, false);
      if (!auth) return;
      const body = await this.readJsonBody(req).catch(() => ({}));
      const cleanName = String(body.name || '').trim().slice(0, 36);
      if (!cleanName) {
        return this.sendJson(res, 400, { error: 'Please enter your name' });
      }
      auth.session.friendName = cleanName;
      auth.session.initials = this.computeInitials(cleanName, 'FR');
      const base = auth.session.baseLabel || this.formatDeviceLabel(auth.session.userAgent);
      auth.session.label = `${cleanName} (${base})`;
      const roleState = this.getSessionRoleState(auth.session);
      this.sendSseToToken(auth.token, 'permissions', roleState);
      this.recordActivity({
        type: 'join',
        actor: this.getActorFromSession(auth.session),
        action: 'Set display name',
        detail: cleanName,
      });
      this.notifyStatusChanged();
      return this.sendJson(res, 200, { ok: true, session: roleState });
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      const token = this.extractToken(req, parsedUrl);
      if (token) {
        const sess = this.sessions.get(token);
        if (sess?.disconnectTimer) {
          clearTimeout(sess.disconnectTimer);
          sess.disconnectTimer = null;
        }
        const actor = sess ? this.getActorFromSession(sess) : null;
        const clientSet = this.sseClients.get(token);
        if (clientSet) {
          for (const clientRes of clientSet) {
            try {
              clientRes.end();
            } catch (_) {}
          }
          this.sseClients.delete(token);
        }
        this.sessions.delete(token);
        if (actor) {
          this.recordActivity({
            type: 'leave',
            actor,
            action: 'Left website',
          });
        }
        this.notifyStatusChanged();
      }
      return this.sendJson(res, 200, { ok: true });
    }

    // Session status poll (works even during Timeout so clients never get stuck if SSE drops)
    if (method === 'GET' && pathname === '/api/session/status') {
      const statusAuth = this.requireAuth(req, res, parsedUrl, true);
      if (!statusAuth) return;
      return this.sendJson(res, 200, {
        tempLocked: !!statusAuth.session.tempLocked,
        tempLockedUntil: statusAuth.session.tempLockedUntil || null,
        session: this.getSessionRoleState(statusAuth.session),
        activeSoundIds: this.state.activeSoundIds || [],
        pausedSoundIds: this.state.pausedSoundIds || [],
        progressMap: this.state.progressMap || {},
        activePlaybacks: this.state.activePlaybacks || [],
        recentActivity: this.activityLog.slice(0, 20),
      });
    }

    // Live SSE stream (remains open during Timeout so ending Timeout pushes automatically with no PIN)
    if (method === 'GET' && pathname === '/api/events') {
      const sseAuth = this.requireAuth(req, res, parsedUrl, true);
      if (!sseAuth) return;

      const sseIp = this.extractClientIp(req);
      if (sseIp && sseIp !== 'unknown') {
        sseAuth.session.ip = sseIp;
      }

      if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true);
      }

      // Omit HTTP/1.1 hop-by-hop "Connection" header so HTTP/2 proxies (Cloudflare Tunnel) stream SSE cleanly
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'identity',
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      // Padding comment flushes proxy read buffers immediately
      res.write(`: ${' '.repeat(2048)}\n\n`);

      if (!this.sseClients.has(sseAuth.token)) {
        this.sseClients.set(sseAuth.token, new Set());
      }
      this.sseClients.get(sseAuth.token).add(res);
      this.notifyStatusChanged();

      if (sseAuth.session.tempLocked) {
        res.write(`event: temp_locked\ndata: ${JSON.stringify({ locked: true, reason: 'Timed out from PC' })}\n\n`);
      } else {
        res.write(`event: temp_locked\ndata: ${JSON.stringify({ locked: false })}\n\n`);
        res.write(`event: state\ndata: ${JSON.stringify(this.getPublicStateSnapshot(sseAuth.session))}\n\n`);
      }

      req.on('close', () => {
        const set = this.sseClients.get(sseAuth.token);
        if (set) {
          set.delete(res);
          if (set.size === 0) {
            this.sseClients.delete(sseAuth.token);
            // Grace window allows brief network/tunnel hiccups & app switches without falsely kicking active users
            const activeSess = this.sessions.get(sseAuth.token);
            if (activeSess && !activeSess.disconnectTimer) {
              activeSess.disconnectTimer = setTimeout(() => {
                activeSess.disconnectTimer = null;
                const currentSess = this.sessions.get(sseAuth.token);
                if (!currentSess) return;
                const hasSse = (this.sseClients.get(sseAuth.token)?.size || 0) > 0;
                const recentlyPolled = Date.now() - (currentSess.lastSeen || 0) < 20000;
                if (!hasSse && !recentlyPolled) {
                  const actor = this.getActorFromSession(currentSess);
                  this.sessions.delete(sseAuth.token);
                  this.recordActivity({
                    type: 'leave',
                    actor,
                    action: 'Left website',
                  });
                  this.notifyStatusChanged();
                }
              }, 25000);
            }
          }
        }
        this.notifyStatusChanged();
      });
      return;
    }

    // Authenticated Endpoints (blocked with 423 while tempLocked)
    const auth = this.requireAuth(req, res, parsedUrl, false);
    if (!auth) return;

    if (method === 'GET' && pathname === '/api/state') {
      return this.sendJson(res, 200, this.getPublicStateSnapshot(auth.session));
    }

    // Trigger playback / Stop / Replay clips
    const triggerMatch = pathname.match(/^\/api\/sounds\/([^/]+)\/trigger$/);
    if (method === 'POST' && triggerMatch) {
      const soundId = decodeURIComponent(triggerMatch[1]);
      if (auth.session.role === 'guest' && this.guestCooldownSeconds > 0) {
        const cooldownMs = Math.round(this.guestCooldownSeconds * 1000);
        const now = Date.now();
        const elapsed = now - (auth.session.lastTriggerAt || 0);
        if (elapsed < cooldownMs) {
          const remainingMs = cooldownMs - elapsed;
          const waitSec = remainingMs >= 1000 ? (remainingMs / 1000).toFixed(1) : (remainingMs / 1000).toFixed(2);
          return this.sendJson(res, 429, {
            error: `Cooldown: wait ${waitSec}s`,
            cooldownRemainingMs: remainingMs,
            cooldownSeconds: this.guestCooldownSeconds,
          });
        }
      }
      const actor = this.getActorFromSession(auth.session);
      const targetSound = (this.state.sounds || []).find((s) => s.id === soundId);
      const ok = await this.handlers.triggerSound?.(soundId, actor);
      if (!ok) return this.sendJson(res, 404, { error: 'Sound not found or main window unavailable' });
      auth.session.lastTriggerAt = Date.now();
      this.recordActivity({
        type: 'play',
        actor,
        action: 'Played sound',
        detail: targetSound?.title || soundId,
        soundId,
      });
      return this.sendJson(res, 200, { ok: true, soundId, actor });
    }

    if (method === 'POST' && pathname === '/api/stop-all') {
      if (!this.requirePermission(res, auth, 'canStopAll')) return;
      const actor = this.getActorFromSession(auth.session);
      await this.handlers.stopAll?.(actor);
      this.recordActivity({
        type: 'stop',
        actor,
        action: 'Stopped all sounds',
      });
      return this.sendJson(res, 200, { ok: true });
    }

    const pauseMatch = pathname.match(/^\/api\/playback\/([^/]+)\/pause$/);
    if (method === 'POST' && pauseMatch) {
      if (!this.requirePermission(res, auth, 'canStopAll')) return;
      const soundId = decodeURIComponent(pauseMatch[1]);
      const targetSound = (this.state.sounds || []).find((s) => s.id === soundId);
      await this.handlers.togglePauseSound?.(soundId);
      this.recordActivity({
        type: 'stop',
        actor: this.getActorFromSession(auth.session),
        action: 'Toggled pause',
        detail: targetSound?.title || soundId,
        soundId,
      });
      return this.sendJson(res, 200, { ok: true });
    }

    const seekMatch = pathname.match(/^\/api\/playback\/([^/]+)\/seek$/);
    if (method === 'POST' && seekMatch) {
      if (!this.requirePermission(res, auth, 'canStopAll')) return;
      const soundId = decodeURIComponent(seekMatch[1]);
      const body = await this.readJsonBody(req);
      await this.handlers.seekSound?.(soundId, Number(body.progress) || 0);
      return this.sendJson(res, 200, { ok: true });
    }

    const skipMatch = pathname.match(/^\/api\/playback\/([^/]+)\/skip$/);
    if (method === 'POST' && skipMatch) {
      if (!this.requirePermission(res, auth, 'canStopAll')) return;
      const soundId = decodeURIComponent(skipMatch[1]);
      const body = await this.readJsonBody(req);
      await this.handlers.skipSound?.(soundId, Number(body.deltaSeconds) || 0);
      return this.sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/clip/audio') {
      if (!this.requirePermission(res, auth, 'canAudioClip')) return;
      const body = await this.readJsonBody(req).catch(() => ({}));
      await this.handlers.triggerAudioClip?.(body.duration ? Number(body.duration) : undefined);
      this.recordActivity({
        type: 'clip',
        actor: this.getActorFromSession(auth.session),
        action: 'Captured audio clip',
        detail: body.duration ? `${body.duration}s` : undefined,
      });
      return this.sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/clip/video') {
      if (!this.requirePermission(res, auth, 'canVideoClip')) return;
      const body = await this.readJsonBody(req).catch(() => ({}));
      await this.handlers.triggerVideoClip?.(body.duration ? Number(body.duration) : undefined);
      this.recordActivity({
        type: 'clip',
        actor: this.getActorFromSession(auth.session),
        action: 'Captured video clip',
        detail: body.duration ? `${body.duration}s` : undefined,
      });
      return this.sendJson(res, 200, { ok: true });
    }

    // Sound property modifications & deletion
    const soundMatch = pathname.match(/^\/api\/sounds\/([^/]+)$/);
    if (soundMatch) {
      const soundId = decodeURIComponent(soundMatch[1]);
      if (method === 'PATCH') {
        if (!this.requirePermission(res, auth, 'canEditSounds')) return;
        const patch = await this.readJsonBody(req);
        const updated = await this.handlers.updateSound?.(soundId, patch);
        if (!updated) return this.sendJson(res, 404, { error: 'Sound not found' });
        this.recordActivity({
          type: 'edit',
          actor: this.getActorFromSession(auth.session),
          action: 'Edited sound',
          detail: updated.title,
          soundId,
        });
        return this.sendJson(res, 200, { sound: this.sanitizeSound(updated) });
      }
      if (method === 'DELETE') {
        if (!this.requirePermission(res, auth, 'canDeleteSounds')) return;
        const target = (this.state.sounds || []).find((s) => s.id === soundId);
        const deleted = await this.handlers.deleteSound?.(soundId);
        if (!deleted) return this.sendJson(res, 404, { error: 'Sound not found' });
        this.recordActivity({
          type: 'delete',
          actor: this.getActorFromSession(auth.session),
          action: 'Deleted sound',
          detail: target?.title || soundId,
          soundId,
        });
        return this.sendJson(res, 200, { ok: true });
      }
    }

    // Stream sound audio file (for optional mobile preview)
    const soundAudioMatch = pathname.match(/^\/api\/sounds\/([^/]+)\/audio$/);
    if (method === 'GET' && soundAudioMatch) {
      if (!this.requirePermission(res, auth, 'canEditSounds')) return;
      const soundId = decodeURIComponent(soundAudioMatch[1]);
      const target = (this.state.sounds || []).find((s) => s.id === soundId);
      if (!target) return this.sendJson(res, 404, { error: 'Sound not found' });
      if (target.audioPath && fs.existsSync(target.audioPath)) {
        return this.streamMediaFile(req, res, target.audioPath);
      }
      if (target.audioData && target.audioData.startsWith('data:')) {
        const match = target.audioData.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const buf = Buffer.from(match[2], 'base64');
          res.writeHead(200, { 'Content-Type': match[1], 'Content-Length': buf.length });
          return res.end(buf);
        }
      }
      return this.sendJson(res, 404, { error: 'Audio source unavailable' });
    }

    // Upload audio file directly from phone
    if (method === 'POST' && pathname === '/api/sounds/upload') {
      if (!this.requirePermission(res, auth, 'canAddSounds')) return;
      const body = await this.readJsonBody(req);
      if (!body.base64 || !body.fileName) {
        return this.sendJson(res, 400, { error: 'Missing fileName or base64 payload' });
      }
      const created = await this.handlers.uploadSound?.(body);
      this.recordActivity({
        type: 'add',
        actor: this.getActorFromSession(auth.session),
        action: 'Uploaded sound',
        detail: created?.title || body.fileName,
        soundId: created?.id || '',
      });
      return this.sendJson(res, 201, { sound: this.sanitizeSound(created) });
    }

    // YouTube Search, Trending, Download
    if (method === 'GET' && pathname === '/api/youtube/trending') {
      if (!this.requirePermission(res, auth, 'canAddSounds')) return;
      const items = (await this.handlers.getTrendingYouTube?.()) || [];
      return this.sendJson(res, 200, { results: items });
    }

    if (method === 'GET' && pathname === '/api/youtube/search') {
      if (!this.requirePermission(res, auth, 'canAddSounds')) return;
      const q = parsedUrl.searchParams.get('q') || '';
      const items = (await this.handlers.searchYouTube?.(q)) || [];
      return this.sendJson(res, 200, { results: items });
    }

    if (method === 'POST' && pathname === '/api/youtube/download') {
      if (!this.requirePermission(res, auth, 'canAddSounds')) return;
      const body = await this.readJsonBody(req);
      if (!body.url) return this.sendJson(res, 400, { error: 'Missing YouTube URL' });
      const created = await this.handlers.downloadYouTubeSound?.(body);
      this.recordActivity({
        type: 'add',
        actor: this.getActorFromSession(auth.session),
        action: 'Added YouTube sound',
        detail: created?.title || body.title || 'YouTube audio',
        soundId: created?.id || '',
      });
      return this.sendJson(res, 201, { sound: this.sanitizeSound(created) });
    }

    // Remote soundboard volume (Owner or permitted Friend) / clip duration settings (Owner only); host mic/voice volume stripped
    if (method === 'PATCH' && pathname === '/api/settings') {
      const isOwner = auth.session.role === 'owner';
      if (!isOwner && !this.requirePermission(res, auth, 'canControlVolume')) return;
      const rawPatch = await this.readJsonBody(req);
      const safePatch = {};
      if (typeof rawPatch.masterSpeakerVolume === 'number') safePatch.masterSpeakerVolume = rawPatch.masterSpeakerVolume;
      if (isOwner) {
        if (typeof rawPatch.recordDuration === 'number') safePatch.recordDuration = rawPatch.recordDuration;
        if (typeof rawPatch.videoClipDuration === 'number') safePatch.videoClipDuration = rawPatch.videoClipDuration;
      }
      const updated = await this.handlers.updateSettings?.(safePatch);
      return this.sendJson(res, 200, { settings: this.sanitizeSettings(updated) });
    }

    // Video clips management + streaming
    const clipVideoMatch = pathname.match(/^\/api\/clips\/([^/]+)\/video$/);
    if (method === 'GET' && clipVideoMatch) {
      if (!this.requirePermission(res, auth, 'canVideoClip')) return;
      const clipId = decodeURIComponent(clipVideoMatch[1]);
      const clip = (this.state.videoClips || []).find((c) => c.id === clipId);
      if (!clip || !clip.filePath || !fs.existsSync(clip.filePath)) {
        return this.sendJson(res, 404, { error: 'Video clip not found' });
      }
      return this.streamMediaFile(req, res, clip.filePath);
    }

    const clipMatch = pathname.match(/^\/api\/clips\/([^/]+)$/);
    if (clipMatch) {
      const clipId = decodeURIComponent(clipMatch[1]);
      if (method === 'PATCH') {
        if (!this.requirePermission(res, auth, 'canEditSounds')) return;
        const patch = await this.readJsonBody(req);
        const updated = await this.handlers.updateVideoClip?.(clipId, patch);
        if (!updated) return this.sendJson(res, 404, { error: 'Video clip not found' });
        return this.sendJson(res, 200, { clip: this.sanitizeClip(updated) });
      }
      if (method === 'DELETE') {
        if (!this.requirePermission(res, auth, 'canDeleteSounds')) return;
        const ok = await this.handlers.deleteVideoClip?.(clipId);
        if (!ok) return this.sendJson(res, 404, { error: 'Video clip not found' });
        return this.sendJson(res, 200, { ok: true });
      }
    }

    return this.sendJson(res, 404, { error: 'Unknown API endpoint' });
  }

  streamMediaFile(req, res, filePath) {
    try {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      this.sendJson(res, 500, { error: 'Failed to stream media file' });
    }
  }

  async handleStaticOrDev(req, res, pathname) {
    // Serve built dist/ if devServerUrl isn't running, or proxy to Vite dev server
    if (this.devServerUrl) {
      // Never serve Vite's auto-reloading HMR client script to phones; WS drops over LAN/tunnel trigger infinite reloads
      if (pathname === '/@vite/client') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(`
export function createHotContext() {
  const noop = () => {};
  return { data: {}, accept: noop, acceptExports: noop, dispose: noop, prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop };
}
export function updateStyle(id, css) {
  let el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (el) el.remove();
}
export const injectQuery = (url) => url;
export default {};
`);
        return;
      }

      const targetPath = pathname === '/' || pathname === '/mobile' ? '/mobile.html' : req.url || '/mobile.html';
      const devUrl = new URL(targetPath, this.devServerUrl);
      const proxyReq = http.request(
        {
          hostname: devUrl.hostname === 'localhost' ? '127.0.0.1' : devUrl.hostname,
          port: devUrl.port || 5173,
          path: devUrl.pathname + devUrl.search,
          method: req.method,
          headers: { ...req.headers, host: devUrl.host },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', () => {
        this.serveDistFile(res, pathname);
      });
      req.pipe(proxyReq);
      return;
    }

    return this.serveDistFile(res, pathname);
  }

  serveDistFile(res, pathname) {
    if (!this.distDir || !fs.existsSync(this.distDir)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Prism Remote Deck bundle not built yet.');
      return;
    }

    let relPath = pathname === '/' || pathname === '/mobile' || pathname === '/mobile/' ? 'mobile.html' : pathname.replace(/^\/+/, '');
    let filePath = path.resolve(this.distDir, relPath);

    // Prevent directory traversal outside distDir
    const resolvedRoot = path.resolve(this.distDir);
    if (!filePath.startsWith(resolvedRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // Fallback to mobile.html for unknown routes
      filePath = path.join(resolvedRoot, 'mobile.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = { RemoteServer };
