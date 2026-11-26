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

class RemoteServer {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.enabled = true;
    this.port = 3940;
    this.pin = '';
    this.lastError = '';
    this.distDir = '';
    this.devServerUrl = '';
    this.qrCache = { url: '', dataUrl: '' };

    // Authenticated sessions (in-memory only -> PIN required on every fresh phone connection)
    /** @type {Map<string, { id: string, createdAt: number, lastSeen: number, userAgent: string, label: string, ip: string, tempLocked: boolean }>} */
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
      settings: {},
      isRecordingClip: false,
      appVersion: '1.5.7',
    };

    // Callbacks supplied by electron/main.cjs
    this.handlers = {};
    this.heartbeatTimer = null;
    this.lastProgressBroadcastAt = 0;
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
      micInputVolume: typeof s.micInputVolume === 'number' ? s.micInputVolume : 100,
      hearMyself: !!s.hearMyself,
      isMicPassThroughEnabled: s.isMicPassThroughEnabled !== false,
      recordDuration: s.recordDuration || 5,
      videoClipDuration: s.videoClipDuration || 30,
      recordSource: s.recordSource || 'all',
    };
  }

  getPublicStateSnapshot() {
    return {
      sounds: this.sanitizeSounds(this.state.sounds),
      videoClips: (this.state.videoClips || []).map((c) => this.sanitizeClip(c)),
      activeSoundIds: this.state.activeSoundIds || [],
      pausedSoundIds: this.state.pausedSoundIds || [],
      progressMap: this.state.progressMap || {},
      settings: this.sanitizeSettings(this.state.settings),
      isRecordingClip: !!this.state.isRecordingClip,
      hostName: os.hostname(),
      appVersion: this.state.appVersion,
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
    return String(ip).replace(/^::ffff:/, '');
  }

  getConnectedDevices() {
    const devices = [];
    for (const [token, sess] of this.sessions.entries()) {
      const online = (this.sseClients.get(token)?.size || 0) > 0;
      devices.push({
        id: sess.id,
        label: sess.label || this.formatDeviceLabel(sess.userAgent),
        ip: sess.ip,
        connectedAt: sess.createdAt,
        lastSeen: sess.lastSeen,
        online,
        tempLocked: !!sess.tempLocked,
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
      urls,
      primaryUrl,
      qrDataUrl,
      connectedClients: this.getConnectedClientCount(),
      devices,
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
   * Temporarily lock or unlock selected device sessions without requiring a PIN to resume.
   * @param {string[] | 'all'} deviceIds
   * @param {boolean} locked
   */
  setTempLockForDevices(deviceIds, locked) {
    const isAll = deviceIds === 'all';
    const targetIds = Array.isArray(deviceIds) ? new Set(deviceIds) : null;
    if (!isAll && (!targetIds || targetIds.size === 0)) return false;

    const nextLocked = !!locked;
    let changed = false;

    for (const [token, sess] of this.sessions.entries()) {
      if (!isAll && !targetIds.has(sess.id)) continue;
      if (!!sess.tempLocked === nextLocked) continue;

      sess.tempLocked = nextLocked;
      changed = true;

      if (nextLocked) {
        this.sendSseToToken(token, 'temp_locked', {
          locked: true,
          reason: 'Temporarily locked from PC',
        });
      } else {
        this.sendSseToToken(token, 'temp_locked', { locked: false });
        this.sendSseToToken(token, 'state', this.getPublicStateSnapshot());
      }
    }

    if (changed) {
      this.notifyStatusChanged();
    }
    return changed;
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

  /**
   * Start or restart the HTTP server according to settings.
   */
  async applySettings(settings) {
    const enabled = settings?.remoteControlEnabled !== false;
    const port = Number(settings?.remoteControlPort) || 3940;
    const pin = settings?.remoteControlPin ? String(settings.remoteControlPin) : this.pin || RemoteServer.generatePin();

    this.state.settings = { ...this.state.settings, ...(settings || {}) };

    const pinChanged = this.pin && this.pin !== pin;
    const portChanged = this.port !== port;
    this.pin = pin;
    this.enabled = enabled;

    if (!enabled) {
      this.stop();
      this.notifyStatusChanged();
      return;
    }

    if (pinChanged && this.isRunning) {
      this.disconnectAllClients('PIN updated on desktop');
    }

    if (!this.isRunning || portChanged) {
      await this.start(port);
    } else {
      this.broadcastSse('settings', this.sanitizeSettings(this.state.settings));
      this.notifyStatusChanged();
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
      for (const clientSet of this.sseClients.values()) {
        for (const res of clientSet) {
          try {
            res.write(': ping\n\n');
          } catch (_) {}
        }
      }
    }, 15000);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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

  requireAuth(req, res, parsedUrl, allowWhenTempLocked = false) {
    const token = this.extractToken(req, parsedUrl);
    if (!token || !this.sessions.has(token)) {
      this.sendJson(res, 401, { error: 'PIN authentication required' });
      return null;
    }
    const sess = this.sessions.get(token);
    sess.lastSeen = Date.now();
    if (!allowWhenTempLocked && sess.tempLocked) {
      this.sendJson(res, 423, { error: 'Device is temporarily locked from PC', tempLocked: true });
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
      return this.sendJson(res, 200, {
        ok: true,
        hostName: os.hostname(),
        appVersion: this.state.appVersion,
        pinRequired: true,
      });
    }

    if (method === 'POST' && pathname === '/api/auth/verify') {
      const clientIp = req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const rate = this.failedAttempts.get(clientIp);
      if (rate && rate.resetAt > now && rate.count >= 8) {
        const retrySec = Math.ceil((rate.resetAt - now) / 1000);
        return this.sendJson(res, 429, { error: `Too many wrong PIN attempts. Try again in ${retrySec}s.` });
      }

      const body = await this.readJsonBody(req).catch(() => ({}));
      const entered = String(body.pin || '').trim();
      if (!entered || entered !== this.pin) {
        const next = !rate || rate.resetAt <= now ? { count: 1, resetAt: now + 60000 } : { count: rate.count + 1, resetAt: rate.resetAt };
        this.failedAttempts.set(clientIp, next);
        return this.sendJson(res, 401, { error: 'Incorrect PIN' });
      }

      this.failedAttempts.delete(clientIp);
      const token = crypto.randomBytes(32).toString('hex');
      const ua = String(req.headers['user-agent'] || 'Phone');
      this.sessions.set(token, {
        id: crypto.randomBytes(6).toString('hex'),
        createdAt: now,
        lastSeen: now,
        userAgent: ua,
        label: this.formatDeviceLabel(ua),
        ip: this.cleanIp(clientIp),
        tempLocked: false,
      });
      this.notifyStatusChanged();

      return this.sendJson(res, 200, {
        token,
        state: this.getPublicStateSnapshot(),
      });
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      const token = this.extractToken(req, parsedUrl);
      if (token) {
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
        this.notifyStatusChanged();
      }
      return this.sendJson(res, 200, { ok: true });
    }

    // Live SSE stream (remains open while temporarily locked so unlock pushes automatically with no PIN)
    if (method === 'GET' && pathname === '/api/events') {
      const sseAuth = this.requireAuth(req, res, parsedUrl, true);
      if (!sseAuth) return;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      if (!this.sseClients.has(sseAuth.token)) {
        this.sseClients.set(sseAuth.token, new Set());
      }
      this.sseClients.get(sseAuth.token).add(res);
      this.notifyStatusChanged();

      if (sseAuth.session.tempLocked) {
        res.write(`event: temp_locked\ndata: ${JSON.stringify({ locked: true, reason: 'Temporarily locked from PC' })}\n\n`);
      } else {
        res.write(`event: temp_locked\ndata: ${JSON.stringify({ locked: false })}\n\n`);
        res.write(`event: state\ndata: ${JSON.stringify(this.getPublicStateSnapshot())}\n\n`);
      }

      req.on('close', () => {
        const set = this.sseClients.get(sseAuth.token);
        if (set) {
          set.delete(res);
          if (set.size === 0) {
            this.sseClients.delete(sseAuth.token);
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
      return this.sendJson(res, 200, this.getPublicStateSnapshot());
    }

    // Trigger playback / Stop / Replay clips
    const triggerMatch = pathname.match(/^\/api\/sounds\/([^/]+)\/trigger$/);
    if (method === 'POST' && triggerMatch) {
      const soundId = decodeURIComponent(triggerMatch[1]);
      const ok = await this.handlers.triggerSound?.(soundId);
      if (!ok) return this.sendJson(res, 404, { error: 'Sound not found or main window unavailable' });
      return this.sendJson(res, 200, { ok: true, soundId });
    }

    if (method === 'POST' && pathname === '/api/stop-all') {
      await this.handlers.stopAll?.();
      return this.sendJson(res, 200, { ok: true });
    }

    const pauseMatch = pathname.match(/^\/api\/playback\/([^/]+)\/pause$/);
    if (method === 'POST' && pauseMatch) {
      const soundId = decodeURIComponent(pauseMatch[1]);
      await this.handlers.togglePauseSound?.(soundId);
      return this.sendJson(res, 200, { ok: true });
    }

    const seekMatch = pathname.match(/^\/api\/playback\/([^/]+)\/seek$/);
    if (method === 'POST' && seekMatch) {
      const soundId = decodeURIComponent(seekMatch[1]);
      const body = await this.readJsonBody(req);
      await this.handlers.seekSound?.(soundId, Number(body.progress) || 0);
      return this.sendJson(res, 200, { ok: true });
    }

    const skipMatch = pathname.match(/^\/api\/playback\/([^/]+)\/skip$/);
    if (method === 'POST' && skipMatch) {
      const soundId = decodeURIComponent(skipMatch[1]);
      const body = await this.readJsonBody(req);
      await this.handlers.skipSound?.(soundId, Number(body.deltaSeconds) || 0);
      return this.sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/clip/audio') {
      const body = await this.readJsonBody(req).catch(() => ({}));
      await this.handlers.triggerAudioClip?.(body.duration ? Number(body.duration) : undefined);
      return this.sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/clip/video') {
      const body = await this.readJsonBody(req).catch(() => ({}));
      await this.handlers.triggerVideoClip?.(body.duration ? Number(body.duration) : undefined);
      return this.sendJson(res, 200, { ok: true });
    }

    // Sound property modifications & deletion
    const soundMatch = pathname.match(/^\/api\/sounds\/([^/]+)$/);
    if (soundMatch) {
      const soundId = decodeURIComponent(soundMatch[1]);
      if (method === 'PATCH') {
        const patch = await this.readJsonBody(req);
        const updated = await this.handlers.updateSound?.(soundId, patch);
        if (!updated) return this.sendJson(res, 404, { error: 'Sound not found' });
        return this.sendJson(res, 200, { sound: this.sanitizeSound(updated) });
      }
      if (method === 'DELETE') {
        const deleted = await this.handlers.deleteSound?.(soundId);
        if (!deleted) return this.sendJson(res, 404, { error: 'Sound not found' });
        return this.sendJson(res, 200, { ok: true });
      }
    }

    // Stream sound audio file (for optional mobile preview)
    const soundAudioMatch = pathname.match(/^\/api\/sounds\/([^/]+)\/audio$/);
    if (method === 'GET' && soundAudioMatch) {
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
      const body = await this.readJsonBody(req);
      if (!body.base64 || !body.fileName) {
        return this.sendJson(res, 400, { error: 'Missing fileName or base64 payload' });
      }
      const created = await this.handlers.uploadSound?.(body);
      return this.sendJson(res, 201, { sound: this.sanitizeSound(created) });
    }

    // YouTube Search, Trending, Download
    if (method === 'GET' && pathname === '/api/youtube/trending') {
      const items = (await this.handlers.getTrendingYouTube?.()) || [];
      return this.sendJson(res, 200, { results: items });
    }

    if (method === 'GET' && pathname === '/api/youtube/search') {
      const q = parsedUrl.searchParams.get('q') || '';
      const items = (await this.handlers.searchYouTube?.(q)) || [];
      return this.sendJson(res, 200, { results: items });
    }

    if (method === 'POST' && pathname === '/api/youtube/download') {
      const body = await this.readJsonBody(req);
      if (!body.url) return this.sendJson(res, 400, { error: 'Missing YouTube URL' });
      const created = await this.handlers.downloadYouTubeSound?.(body);
      return this.sendJson(res, 201, { sound: this.sanitizeSound(created) });
    }

    // Remote mixer / recorder settings
    if (method === 'PATCH' && pathname === '/api/settings') {
      const patch = await this.readJsonBody(req);
      const updated = await this.handlers.updateSettings?.(patch);
      return this.sendJson(res, 200, { settings: this.sanitizeSettings(updated) });
    }

    // Video clips management + streaming
    const clipVideoMatch = pathname.match(/^\/api\/clips\/([^/]+)\/video$/);
    if (method === 'GET' && clipVideoMatch) {
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
        const patch = await this.readJsonBody(req);
        const updated = await this.handlers.updateVideoClip?.(clipId, patch);
        if (!updated) return this.sendJson(res, 404, { error: 'Video clip not found' });
        return this.sendJson(res, 200, { clip: this.sanitizeClip(updated) });
      }
      if (method === 'DELETE') {
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
