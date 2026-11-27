// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, execFile } = require('child_process');
const QRCode = require('qrcode');

const CLOUDFLARED_DOWNLOAD_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

class TunnelManager {
  constructor() {
    this.proc = null;
    this.status = 'stopped'; // 'stopped' | 'downloading' | 'starting' | 'online' | 'error'
    this.url = '';
    this.qrDataUrl = '';
    this.downloadProgress = 0;
    this.error = '';
    this.userDataBinDir = '';
    this.resourcesPath = '';
    this.onStatusChange = null;
    this.localPort = 3940;
    this.startPromise = null;
    this.qrCacheUrl = '';
  }

  configure({ userDataBinDir, resourcesPath, onStatusChange }) {
    this.userDataBinDir = userDataBinDir;
    this.resourcesPath = resourcesPath || '';
    this.onStatusChange = onStatusChange || null;
  }

  getBinaryPath() {
    const localBin = path.join(__dirname, '../bin/cloudflared.exe');
    if (fs.existsSync(localBin)) return localBin;

    if (this.resourcesPath) {
      const resBin = path.join(this.resourcesPath, 'bin/cloudflared.exe');
      if (fs.existsSync(resBin)) return resBin;
    }

    if (this.userDataBinDir) {
      return path.join(this.userDataBinDir, 'cloudflared.exe');
    }
    return path.join(__dirname, '../bin/cloudflared.exe');
  }

  emitStatus() {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(this.getStatus());
    }
  }

  getStatus() {
    return {
      active: this.status === 'online' || this.status === 'starting' || this.status === 'downloading',
      status: this.status,
      url: this.url,
      qrDataUrl: this.qrDataUrl,
      downloadProgress: this.status === 'downloading' ? this.downloadProgress : undefined,
      error: this.error || undefined,
    };
  }

  async ensureBinary() {
    const targetPath = this.getBinaryPath();
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 5_000_000) {
      return targetPath;
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${targetPath}.tmp`;
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }

    this.status = 'downloading';
    this.downloadProgress = 0;
    this.error = '';
    this.emitStatus();

    await new Promise((resolve, reject) => {
      const downloadWithRedirects = (url, redirectsLeft = 6) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Prism-Soundboard' } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              return reject(new Error('Too many redirects while downloading cloudflared.'));
            }
            const nextUrl = new URL(res.headers.location, url).toString();
            return downloadWithRedirects(nextUrl, redirectsLeft - 1);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Failed to download cloudflared (HTTP ${res.statusCode}).`));
          }

          const total = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const file = fs.createWriteStream(tempPath);

          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (total > 0) {
              const pct = Math.min(99, Math.round((downloaded / total) * 100));
              if (pct !== this.downloadProgress) {
                this.downloadProgress = pct;
                this.emitStatus();
              }
            }
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              try {
                if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
                fs.renameSync(tempPath, targetPath);
                this.downloadProgress = 100;
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          });

          file.on('error', (err) => {
            file.close();
            try { fs.unlinkSync(tempPath); } catch (_) {}
            reject(err);
          });
        });

        req.on('error', (err) => {
          try { fs.unlinkSync(tempPath); } catch (_) {}
          reject(err);
        });
      };

      downloadWithRedirects(CLOUDFLARED_DOWNLOAD_URL);
    });

    return targetPath;
  }

  async start(port = 3940) {
    if (this.startPromise) {
      return this.startPromise;
    }

    this.localPort = port;
    this.startPromise = (async () => {
      try {
        this.stopProcessOnly();
        const binPath = await this.ensureBinary();

        this.status = 'starting';
        this.url = '';
        this.qrDataUrl = '';
        this.error = '';
        this.emitStatus();

        await new Promise((resolve) => {
          const child = spawn(
            binPath,
            ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
          );
          this.proc = child;

          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          const startupTimeout = setTimeout(() => {
            if (!this.url && this.proc === child) {
              this.status = 'error';
              this.error = 'Timed out waiting for Cloudflare Quick Tunnel URL.';
              this.stopProcessOnly();
              this.emitStatus();
              finish();
            }
          }, 28000);

          const handleChunk = async (chunk) => {
            const text = chunk.toString('utf-8');
            if (!this.url) {
              const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
              if (match && match[0]) {
                const discovered = match[0];
                this.url = discovered;
                if (this.qrCacheUrl !== discovered) {
                  try {
                    this.qrDataUrl = await QRCode.toDataURL(discovered, {
                      width: 240,
                      margin: 2,
                      color: { dark: '#f8fafc', light: '#00000000' },
                    });
                    this.qrCacheUrl = discovered;
                  } catch (_) {}
                }
                this.status = 'online';
                this.error = '';
                clearTimeout(startupTimeout);
                this.emitStatus();
                finish();
              }
            }
          };

          child.stdout.on('data', handleChunk);
          child.stderr.on('data', handleChunk);

          child.on('error', (err) => {
            clearTimeout(startupTimeout);
            if (this.proc === child) {
              this.proc = null;
              this.status = 'error';
              this.error = err.message || 'Failed to launch cloudflared tunnel.';
              this.emitStatus();
            }
            finish();
          });

          child.on('close', (code) => {
            clearTimeout(startupTimeout);
            if (this.proc === child) {
              this.proc = null;
              if (this.status !== 'stopped') {
                this.status = this.url ? 'stopped' : 'error';
                if (!this.url && !this.error) {
                  this.error = `Tunnel exited unexpectedly (code ${code ?? 'unknown'}).`;
                }
                this.url = '';
                this.qrDataUrl = '';
                this.emitStatus();
              }
            }
            finish();
          });
        });
      } catch (err) {
        this.status = 'error';
        this.error = (err && err.message) || 'Could not start public tunnel.';
        this.url = '';
        this.qrDataUrl = '';
        this.emitStatus();
      } finally {
        this.startPromise = null;
      }

      return this.getStatus();
    })();

    return this.startPromise;
  }

  stopProcessOnly() {
    const child = this.proc;
    this.proc = null;
    if (child) {
      const pid = child.pid;
      try {
        child.kill();
      } catch (_) {}
      if (process.platform === 'win32' && pid) {
        try {
          execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
        } catch (_) {}
      }
    }
  }

  stop() {
    this.status = 'stopped';
    this.url = '';
    this.qrDataUrl = '';
    this.error = '';
    this.downloadProgress = 0;
    this.stopProcessOnly();
    this.emitStatus();
  }
}

module.exports = { TunnelManager };
