const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

process.on('uncaughtException', (err) => {
  try {
    fs.writeFileSync(path.join(__dirname, '../error.log'), err.stack || String(err));
  } catch (e) {}
});

const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Tray, Menu, nativeImage, session, desktopCapturer } = require('electron');
const { spawn, execFile } = require('child_process');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// High performance GPU flags for zero-latency transparent overlays during gaming
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Prevent Windows from sleeping / de-prioritizing the event loop and GPU swapchain when in a game
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let hookProcess = null;
const registeredHotkeys = new Map(); // normalizedKey -> soundId
const lastHotkeyTriggerTime = new Map(); // normalizedKey -> timestamp (for debounce)
let panicHotkey = 'Escape';
let repeatLastHotkey = 'F7';
let overlayHotkey = 'F8';
let recordHotkey = 'F9';

function normalizeKey(k) {
  if (!k) return '';
  return k.trim().toLowerCase().replace(/numpad\s*(\d)/g, 'num$1').replace(/\s+/g, '');
}

const currentlyHeldKeys = new Set();

function startGlobalKeyHook() {
  const localHook = path.join(__dirname, '../bin/GlobalKeyHook.exe');
  const resHook = path.join(process.resourcesPath || '', 'bin/GlobalKeyHook.exe');
  const hookExe = fs.existsSync(localHook) ? localHook : fs.existsSync(resHook) ? resHook : null;
  if (!hookExe) {
    console.warn('[GlobalKeyHook] Not found at local or resources path');
    return;
  }

  try {
    hookProcess = spawn(hookExe, [], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let buffer = '';
    hookProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (let rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('KEY_DOWN:')) {
          const rawKey = line.substring(9).trim();
          handleHookKeyDown(rawKey);
        } else if (line.startsWith('KEY_UP:')) {
          const rawKey = line.substring(7).trim();
          handleHookKeyUp(rawKey);
        } else if (line.startsWith('KEY:')) {
          // Backward compatibility fallback
          const rawKey = line.substring(4).trim();
          handleHookKeyDown(rawKey);
        }
      }
    });

    hookProcess.on('exit', () => {
      hookProcess = null;
    });
    console.log('[GlobalKeyHook] Low-level keyboard hook active (typing pass-through enabled).');
  } catch (err) {
    console.warn('[GlobalKeyHook] Error starting hook:', err);
  }
}

function handleHookKeyUp(rawKey) {
  const norm = normalizeKey(rawKey);
  if (norm) {
    currentlyHeldKeys.delete(norm);
  }
}

let isOverlayOpen = false;
let lastOverlayToggleTime = 0;

function hideOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  isOverlayOpen = false;
  try {
    overlayWindow.setOpacity(0);
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch (e) {}
}

function showOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  isOverlayOpen = true;
  try {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setOpacity(1);
    if (!overlayWindow.isVisible()) {
      overlayWindow.show();
    }
    overlayWindow.focus();
    overlayWindow.moveTop();
  } catch (e) {}

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-overlay-sync');
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  overlayWindow = new BrowserWindow({
    width: 1480,
    height: 700,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true);

  const isDev = process.env.NODE_ENV === 'development';
  const hasDevServer = process.env.VITE_DEV_SERVER_URL;

  if (isDev && hasDevServer) {
    overlayWindow.loadURL(`${hasDevServer}?overlay=true`);
  } else if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'true' } });
  } else {
    overlayWindow.loadURL('http://localhost:5173?overlay=true');
  }

  // Pre-warm the DirectX DWM surface immediately so in-game launch is instant with zero stutter!
  overlayWindow.once('ready-to-show', () => {
    try {
      overlayWindow.showInactive();
      hideOverlayWindow();
    } catch (e) {}
  });

  // Hide on blur (e.g. clicking into game, alt-tab, clicking off)
  overlayWindow.on('blur', () => {
    if (isOverlayOpen) {
      hideOverlayWindow();
    }
  });
}

function toggleOverlayWindow() {
  const now = Date.now();
  if (now - lastOverlayToggleTime < 250) {
    return;
  }
  lastOverlayToggleTime = now;

  if (isOverlayOpen) {
    hideOverlayWindow();
  } else {
    showOverlayWindow();
  }
}

function handleHookKeyDown(rawKey) {
  const norm = normalizeKey(rawKey);
  if (!norm) return;

  // Block holding down repeat: If the key is already held down continuously, ignore the auto-repeat!
  // But if released and pressed again rapidly (manual spamming), it triggers immediately!
  if (currentlyHeldKeys.has(norm)) {
    return;
  }
  currentlyHeldKeys.add(norm);

  // Check panic hotkey
  if (panicHotkey && norm === normalizeKey(panicHotkey)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panic-hotkey-triggered');
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('panic-hotkey-triggered');
    }
    return;
  }

  // Check repeat last sound hotkey
  if (repeatLastHotkey && norm === normalizeKey(repeatLastHotkey)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('repeat-last-hotkey-triggered');
    }
    return;
  }

  // Check overlay hotkey (Toggle in-game soundboard overlay)
  if (overlayHotkey && norm === normalizeKey(overlayHotkey)) {
    toggleOverlayWindow();
    return;
  }

  // Check record mic / quick clip hotkey
  if (recordHotkey && norm === normalizeKey(recordHotkey)) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('record-hotkey-triggered');
    }
    return;
  }

  // Check sound hotkey
  const soundId = registeredHotkeys.get(norm);
  if (soundId) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-triggered', soundId);
    }
  }
}

const APP_ICON_PATH = fs.existsSync(path.join(__dirname, '../icon.ico'))
  ? path.join(__dirname, '../icon.ico')
  : fs.existsSync(path.join(process.resourcesPath || '', 'app.asar/icon.ico'))
  ? path.join(process.resourcesPath || '', 'app.asar/icon.ico')
  : path.join(__dirname, 'icon.ico');

// Ensure consistent app name and Windows taskbar grouping
app.setName('Prism Soundboard');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.prism.soundboard');
}

// Storage directories: Always use "Prism Soundboard" folder for unified storage across dev and prod
const APP_DATA_ROOT = app.getPath('appData');
const USER_DATA_DIR = path.join(APP_DATA_ROOT, 'Prism Soundboard');
const SOUNDS_FILE = path.join(USER_DATA_DIR, 'soundboard_sounds.json');
const DELETED_SOUNDS_FILE = path.join(USER_DATA_DIR, 'deleted_sounds.json');
const SETTINGS_FILE = path.join(USER_DATA_DIR, 'soundboard_settings.json');
const AUDIO_DIR = path.join(USER_DATA_DIR, 'audio_library');
const DELETED_DIR = path.join(USER_DATA_DIR, 'deleted');

// Read saved panicHotkey on startup
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (s.panicHotkey) {
      panicHotkey = s.panicHotkey;
    }
    if (s.repeatLastHotkey) {
      repeatLastHotkey = s.repeatLastHotkey;
    }
    if (s.overlayHotkey) {
      overlayHotkey = s.overlayHotkey;
    }
    if (s.recordHotkey) {
      recordHotkey = s.recordHotkey;
    }
  }
} catch (e) {}

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}
if (!fs.existsSync(DELETED_DIR)) {
  fs.mkdirSync(DELETED_DIR, { recursive: true });
}

// Migrate sounds from legacy folder if needed
try {
  const legacyDir = path.join(app.getPath('appData'), 'fluent-soundboard');
  const legacySounds = path.join(legacyDir, 'soundboard_sounds.json');
  if (!fs.existsSync(SOUNDS_FILE) && fs.existsSync(legacySounds)) {
    fs.copyFileSync(legacySounds, SOUNDS_FILE);
  }
} catch (e) {}

// Locate yt-dlp binary
function getYtDlpPath() {
  const localBin = path.join(__dirname, '../bin/yt-dlp.exe');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  const appBin = path.join(process.resourcesPath || '', 'bin/yt-dlp.exe');
  if (fs.existsSync(appBin)) {
    return appBin;
  }
  return 'yt-dlp';
}

function normalizeAccelerator(key) {
  if (!key) return null;
  let str = key.trim();

  // Common replacements
  str = str.replace(/Control/gi, 'CommandOrControl');
  str = str.replace(/Ctrl/gi, 'CommandOrControl');
  
  // Numpad handling
  str = str.replace(/Numpad\s*(\d)/gi, 'num$1');
  str = str.replace(/Num\s*(\d)/gi, 'num$1');
  str = str.replace(/NumpadAdd/gi, 'numadd');
  str = str.replace(/NumpadSubtract/gi, 'numsub');
  str = str.replace(/NumpadMultiply/gi, 'nummult');
  str = str.replace(/NumpadDivide/gi, 'numdiv');
  str = str.replace(/NumpadDecimal/gi, 'numdec');

  return str;
}

function createTray() {
  // Create an elegant 16x16 tray icon programmatically if file doesn't exist
  const trayIcon = fs.existsSync(APP_ICON_PATH)
    ? nativeImage.createFromPath(APP_ICON_PATH).resize({ width: 16, height: 16 })
    : nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42mNkYPj/n4EAYCJGEwfV0cMwdgMhGg9gGE11cANgGrAZhA0wo7l3NMyGMwK/GbgkGEg1kN5OIEQDAAB20CHv8Z0T8AAAAABJRU5ErkJggg==',
          'base64'
        )
      );

  tray = new Tray(trayIcon);
  tray.setToolTip('Prism Soundboard');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Prism Soundboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Stop All Sounds',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('panic-hotkey-triggered');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  const showOrRestoreWindow = () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  };

  tray.setContextMenu(contextMenu);

  // Single-click on the tray icon immediately opens and focuses the main window
  tray.on('click', () => {
    showOrRestoreWindow();
  });

  tray.on('double-click', () => {
    showOrRestoreWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#181818',
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
      webSecurity: false, // Allows playing local audio smoothly
      backgroundThrottling: false, // Prevents background sleeping / input freeze when gaming
    },
  });

  // Instantly invalidate and repaint when alt-tabbing or focusing from a game
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.invalidate();
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  const hasDevServer = process.env.VITE_DEV_SERVER_URL;

  if (isDev && hasDevServer) {
    mainWindow.loadURL(hasDevServer);
  } else if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Renderer]', message);
  });

  mainWindow.once('ready-to-show', () => {
    let shouldStartInTray = false;
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        if (s.startInTray) {
          shouldStartInTray = true;
        }
      }
    } catch (err) {}

    // Check if app was launched with --hidden flag (common for boot auto-start)
    if (process.argv.includes('--hidden') || shouldStartInTray) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }

    // Automatic Startup Update Check (checks 3.5s after window shows)
    setTimeout(async () => {
      try {
        const update = await fetchLatestGitHubRelease();
        if (update && update.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('startup-update-available', update);
        }
      } catch (e) {}
    }, 3500);
  });

  mainWindow.on('close', (e) => {
    // If minimizeToTray is configured, hide instead of quitting
    let shouldTray = true;
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        if (s.minimizeToTray === false) {
          shouldTray = false;
        }
      }
    } catch (err) {}

    if (!app.isQuitting && shouldTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

function ensurePhysicalDefaultSpeakers() {
  const psScript = `
    $script = @"
using System;
using System.Runtime.InteropServices;
public class CoreAudioHelper {
    [ComImport]
    [Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    private class _PolicyConfigClient {}

    [ComImport]
    [Guid("f8679f50-850a-41cf-9c72-430f290290c8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig {
        void Unused1(); void Unused2(); void Unused3(); void Unused4(); void Unused5();
        void Unused6(); void Unused7(); void Unused8(); void Unused9(); void Unused10();
        [PreserveSig]
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string devId, int role);
    }

    public static int SetDefault(string devId) {
        try {
            IPolicyConfig policy = (IPolicyConfig)new _PolicyConfigClient();
            policy.SetDefaultEndpoint(devId, 0);
            policy.SetDefaultEndpoint(devId, 1);
            policy.SetDefaultEndpoint(devId, 2);
            return 0;
        } catch { return -1; }
    }
}
"@
    Add-Type -TypeDefinition $script -ErrorAction SilentlyContinue
    $render = Get-ChildItem "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render" | ForEach-Object {
        $p = Get-ItemProperty "$($_.PSPath)\\Properties" -ErrorAction SilentlyContinue
        if ($p) { [PSCustomObject]@{ Id = $_.PSChildName; Desc = $p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2' } }
    }
    $target = $render | Where-Object { ($_.Desc -like "*Headset Earphone*" -or $_.Desc -like "*HyperX*" -or $_.Desc -like "*Realtek*") -and ($_.Desc -notlike "*CABLE*") } | Select-Object -First 1
    if ($target) {
        [CoreAudioHelper]::SetDefault($target.Id)
    }
  `.replace(/\r?\n\s*/g, ' ');

  try {
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { windowsHide: true });
  } catch (e) {}
}

  app.whenReady().then(() => {
    ensurePhysicalDefaultSpeakers();

    // Configure system audio loopback capture via session.setDisplayMediaRequestHandler
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'media' || permission === 'display-capture') return true;
        return true;
      });
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
      });

      // Intercept navigator.mediaDevices.getDisplayMedia to provide screen video + system audio loopback
      session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 0, height: 0 },
            fetchWindowIcons: false,
          });
          const primaryScreen = sources[0];
          if (primaryScreen) {
            callback({
              video: primaryScreen,
              audio: 'loopback', // Captures Windows system audio loopback directly via WASAPI
            });
            return;
          }
        } catch (err) {
          console.warn('[setDisplayMediaRequestHandler] Error:', err);
        }
        callback({});
      });
    }

    createWindow();
    createOverlayWindow(); // Pre-warm transparent overlay immediately so in-game launch is instant with zero stutter!
    createTray();
    startGlobalKeyHook();
  });

  app.on('will-quit', () => {
    if (hookProcess) {
      try {
        hookProcess.kill();
      } catch (e) {}
      hookProcess = null;
    }
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// ================= IPC HANDLERS =================

// Window controls
ipcMain.handle('close-overlay', () => {
  hideOverlayWindow();
  return true;
});

ipcMain.handle('show-main-window', () => {
  hideOverlayWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  return true;
});

ipcMain.on('sync-open-add-sound', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('open-add-sound-modal');
  }
});

ipcMain.on('request-sync-from-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-overlay-sync');
  }
});

// Inter-window synchronizers (Main App <-> Mini Overlay HUD)
ipcMain.on('sync-trigger-sound', (_event, soundId) => {
  // If overlay requested play, trigger on main window (where the audio engine owns the hardware audioContext)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hotkey-triggered', soundId);
  }
});

ipcMain.on('sync-stop-all', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('panic-hotkey-triggered');
  }
});

ipcMain.on('sync-trigger-clip', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('trigger-record-clip');
  }
});

ipcMain.on('sync-active-sounds', (_event, activeIds) => {
  // Broadcast active playing sounds to overlay window so card badges light up
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('active-sounds-updated', activeIds);
  }
});

ipcMain.on('sync-progress-map', (_event, progressMap) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('progress-map-updated', progressMap);
  }
});

ipcMain.on('sync-paused-sounds', (_event, pausedIds) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('paused-sounds-updated', pausedIds);
  }
});

ipcMain.on('sync-sounds-updated', (_event, sounds) => {
  // Save updated sounds to disk directly from main process to ensure persistence
  try {
    fs.writeFileSync(SOUNDS_FILE, JSON.stringify(sounds, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Persistence] Error saving sounds:', err);
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('sounds-updated', sounds);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sounds-updated', sounds);
  }
});

ipcMain.on('sync-sound-volume-live', (_event, { soundId, volume }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-sound-volume-updated', { soundId, volume });
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('live-sound-volume-updated', { soundId, volume });
  }
});

ipcMain.on('sync-sound-speed-live', (_event, { soundId, speed }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-sound-speed-updated', { soundId, speed });
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('live-sound-speed-updated', { soundId, speed });
  }
});

ipcMain.on('sync-seek-sound', (_event, { soundId, progress }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-seek-sound', { soundId, progress });
  }
});

ipcMain.on('sync-skip-sound', (_event, { soundId, deltaSeconds }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-skip-sound', { soundId, deltaSeconds });
  }
});

ipcMain.on('sync-toggle-pause-sound', (_event, soundId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-toggle-pause-sound', soundId);
  }
});

ipcMain.on('sync-settings-changed', (_event, newSettings) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-sync', newSettings);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings-sync', newSettings);
  }
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url);
});

// Provide Desktop Audio Loopback source ID for system audio capture (Zero thumbnail memory allocation)
ipcMain.handle('get-desktop-audio-source', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    if (sources && sources.length > 0) {
      return sources[0].id;
    }
  } catch (err) {
    console.warn('[desktopCapturer] Failed to get screen sources for audio loopback:', err);
  }
  return null;
});

// Storage handlers
ipcMain.handle('load-sounds', async () => {
  try {
    let sounds = [];
    if (fs.existsSync(SOUNDS_FILE)) {
      const data = fs.readFileSync(SOUNDS_FILE, 'utf-8');
      sounds = JSON.parse(data);
    }

    // Fallback: If SOUNDS_FILE is empty or has very few items, inspect AppData/Electron/soundboard_sounds.json or sounds.json
    const electronSoundsFile = path.join(APP_DATA_ROOT, 'Electron', 'soundboard_sounds.json');
    if ((!sounds || sounds.length <= 1) && fs.existsSync(electronSoundsFile)) {
      try {
        const fallbackData = JSON.parse(fs.readFileSync(electronSoundsFile, 'utf-8'));
        if (Array.isArray(fallbackData) && fallbackData.length > sounds.length) {
          sounds = fallbackData;
          fs.writeFileSync(SOUNDS_FILE, JSON.stringify(sounds, null, 2), 'utf-8');
        }
      } catch (e) {}
    }

    return sounds;
  } catch (err) {
    console.error('Failed to load sounds:', err);
  }
  return [];
});

ipcMain.handle('save-sounds', async (_event, sounds) => {
  try {
    fs.writeFileSync(SOUNDS_FILE, JSON.stringify(sounds, null, 2), 'utf-8');
    // Mirror to Electron directory to keep dev and prod in sync
    const electronSoundsFile = path.join(APP_DATA_ROOT, 'Electron', 'soundboard_sounds.json');
    try {
      if (fs.existsSync(path.dirname(electronSoundsFile))) {
        fs.writeFileSync(electronSoundsFile, JSON.stringify(sounds, null, 2), 'utf-8');
      }
    } catch (e) {}
    return true;
  } catch (err) {
    console.error('Failed to save sounds:', err);
    return false;
  }
});

ipcMain.handle('open-sound-settings', () => {
  shell.openExternal('ms-settings:sound');
});

ipcMain.handle('open-sounds-directory', () => {
  try {
    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }
    shell.openPath(AUDIO_DIR);
    return true;
  } catch (err) {
    console.error('Failed to open sounds directory:', err);
    return false;
  }
});

ipcMain.handle('open-deleted-directory', () => {
  try {
    if (!fs.existsSync(DELETED_DIR)) {
      fs.mkdirSync(DELETED_DIR, { recursive: true });
    }
    shell.openPath(DELETED_DIR);
    return true;
  } catch (err) {
    console.error('Failed to open deleted directory:', err);
    return false;
  }
});

ipcMain.handle('load-deleted-sounds', async () => {
  try {
    if (fs.existsSync(DELETED_SOUNDS_FILE)) {
      const data = fs.readFileSync(DELETED_SOUNDS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load deleted sounds:', err);
  }
  return [];
});

ipcMain.handle('move-to-deleted', async (_event, sound) => {
  try {
    if (!sound || !sound.id) return false;

    // 1. Move physical audio file to DELETED_DIR if it exists
    let updatedSound = { ...sound, deletedAt: Date.now() };
    if (sound.audioPath && fs.existsSync(sound.audioPath)) {
      const fileName = path.basename(sound.audioPath);
      const targetPath = path.join(DELETED_DIR, fileName);
      try {
        fs.renameSync(sound.audioPath, targetPath);
        updatedSound.audioPath = targetPath;
      } catch (e) {
        // Fallback copy & delete
        fs.copyFileSync(sound.audioPath, targetPath);
        try { fs.unlinkSync(sound.audioPath); } catch (_) {}
        updatedSound.audioPath = targetPath;
      }
    }

    // 2. Read deleted sounds list, append, and save
    let deletedList = [];
    if (fs.existsSync(DELETED_SOUNDS_FILE)) {
      try {
        deletedList = JSON.parse(fs.readFileSync(DELETED_SOUNDS_FILE, 'utf-8'));
      } catch (e) {
        deletedList = [];
      }
    }
    deletedList = deletedList.filter((s) => s.id !== sound.id);
    deletedList.unshift(updatedSound);
    fs.writeFileSync(DELETED_SOUNDS_FILE, JSON.stringify(deletedList, null, 2), 'utf-8');

    return updatedSound;
  } catch (err) {
    console.error('Failed to move sound to deleted:', err);
    return false;
  }
});

ipcMain.handle('restore-deleted-sound', async (_event, soundId) => {
  try {
    if (!soundId) return null;
    let deletedList = [];
    if (fs.existsSync(DELETED_SOUNDS_FILE)) {
      try {
        deletedList = JSON.parse(fs.readFileSync(DELETED_SOUNDS_FILE, 'utf-8'));
      } catch (e) {
        deletedList = [];
      }
    }

    const soundIndex = deletedList.findIndex((s) => s.id === soundId);
    if (soundIndex === -1) return null;

    const sound = deletedList[soundIndex];
    let restoredSound = { ...sound };
    delete restoredSound.deletedAt;

    // Move file back from DELETED_DIR to AUDIO_DIR
    if (sound.audioPath && fs.existsSync(sound.audioPath)) {
      const fileName = path.basename(sound.audioPath);
      const targetPath = path.join(AUDIO_DIR, fileName);
      try {
        fs.renameSync(sound.audioPath, targetPath);
        restoredSound.audioPath = targetPath;
      } catch (e) {
        fs.copyFileSync(sound.audioPath, targetPath);
        try { fs.unlinkSync(sound.audioPath); } catch (_) {}
        restoredSound.audioPath = targetPath;
      }
    }

    // Remove from deleted list
    deletedList.splice(soundIndex, 1);
    fs.writeFileSync(DELETED_SOUNDS_FILE, JSON.stringify(deletedList, null, 2), 'utf-8');

    // Add back to active sounds
    let activeSounds = [];
    if (fs.existsSync(SOUNDS_FILE)) {
      try {
        activeSounds = JSON.parse(fs.readFileSync(SOUNDS_FILE, 'utf-8'));
      } catch (e) {
        activeSounds = [];
      }
    }
    activeSounds = activeSounds.filter((s) => s.id !== soundId);
    activeSounds.unshift(restoredSound);
    fs.writeFileSync(SOUNDS_FILE, JSON.stringify(activeSounds, null, 2), 'utf-8');

    return restoredSound;
  } catch (err) {
    console.error('Failed to restore deleted sound:', err);
    return null;
  }
});

ipcMain.handle('permanently-delete-sound', async (_event, soundId) => {
  try {
    if (!soundId) return false;
    let deletedList = [];
    if (fs.existsSync(DELETED_SOUNDS_FILE)) {
      try {
        deletedList = JSON.parse(fs.readFileSync(DELETED_SOUNDS_FILE, 'utf-8'));
      } catch (e) {
        deletedList = [];
      }
    }

    const target = deletedList.find((s) => s.id === soundId);
    if (target && target.audioPath && fs.existsSync(target.audioPath)) {
      try {
        fs.unlinkSync(target.audioPath);
      } catch (e) {}
    }

    deletedList = deletedList.filter((s) => s.id !== soundId);
    fs.writeFileSync(DELETED_SOUNDS_FILE, JSON.stringify(deletedList, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to permanently delete sound:', err);
    return false;
  }
});

// Export Backup (Packages all audio files + sounds.json + settings.json into a .prism zip archive)
ipcMain.handle('export-soundboard-backup', async () => {
  try {
    const defaultName = `prism-soundboard-backup-${new Date().toISOString().slice(0, 10)}.prism`;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Soundboard Backup',
      defaultPath: path.join(app.getPath('downloads'), defaultName),
      filters: [{ name: 'Prism Soundboard Backup (*.prism)', extensions: ['prism'] }],
    });

    if (canceled || !filePath) return false;

    const zip = new AdmZip();

    let sounds = [];
    let settings = {};
    if (fs.existsSync(SOUNDS_FILE)) {
      sounds = JSON.parse(fs.readFileSync(SOUNDS_FILE, 'utf-8'));
    }
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }

    // Embed all physical audio files referenced by sounds
    const packagedSounds = sounds.map((sound) => {
      const cloned = { ...sound };
      if (cloned.audioPath && fs.existsSync(cloned.audioPath)) {
        try {
          const fileName = path.basename(cloned.audioPath);
          const zipAudioPath = `audio/${fileName}`;
          zip.addLocalFile(cloned.audioPath, 'audio');
          cloned.audioPath = zipAudioPath; // Relative path inside backup package
        } catch (err) {
          console.warn('Failed to pack audio file:', cloned.audioPath, err);
        }
      }
      return cloned;
    });

    // Also include any other audio files in AUDIO_DIR that might not be in sounds.json
    if (fs.existsSync(AUDIO_DIR)) {
      const files = fs.readdirSync(AUDIO_DIR);
      for (const f of files) {
        const fullPath = path.join(AUDIO_DIR, f);
        if (fs.statSync(fullPath).isFile()) {
          try {
            zip.addLocalFile(fullPath, 'audio');
          } catch (e) {}
        }
      }
    }

    const manifest = {
      prismVersion: '1.0.6',
      exportedAt: new Date().toISOString(),
      sounds: packagedSounds,
      settings,
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    zip.writeZip(filePath);

    return true;
  } catch (err) {
    console.error('Export backup failed:', err);
    return false;
  }
});

// Import Backup (Extracts audio files to AUDIO_DIR and restores sounds & settings from .prism)
ipcMain.handle('import-soundboard-backup', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Soundboard Backup',
      filters: [
        { name: 'Prism Soundboard Backup (*.prism)', extensions: ['prism'] },
        { name: 'Legacy Backup (*.json)', extensions: ['json'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || !filePaths || filePaths.length === 0) return null;

    const selectedFile = filePaths[0];

    // Handle .prism (Zip bundle containing audio/ directory + manifest.json)
    if (selectedFile.endsWith('.prism') || selectedFile.endsWith('.zip')) {
      const zip = new AdmZip(selectedFile);
      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        throw new Error('Invalid .prism file: manifest.json not found in archive');
      }

      const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
      if (!manifest.sounds || !Array.isArray(manifest.sounds)) {
        throw new Error('Invalid backup structure in .prism');
      }

      if (!fs.existsSync(AUDIO_DIR)) {
        fs.mkdirSync(AUDIO_DIR, { recursive: true });
      }

      // Extract all audio entries to AUDIO_DIR
      const entries = zip.getEntries();
      for (const entry of entries) {
        if (!entry.isDirectory && (entry.entryName.startsWith('audio/') || entry.entryName.startsWith('audio\\'))) {
          const fileName = path.basename(entry.entryName);
          const destPath = path.join(AUDIO_DIR, fileName);
          fs.writeFileSync(destPath, entry.getData());
        }
      }

      // Re-point sounds to absolute paths on the local system
      const restoredSounds = manifest.sounds.map((sound) => {
        const item = { ...sound };
        if (item.audioPath) {
          const fileName = path.basename(item.audioPath);
          const localAudioPath = path.join(AUDIO_DIR, fileName);
          if (fs.existsSync(localAudioPath)) {
            item.audioPath = localAudioPath;
          }
        }
        return item;
      });

      fs.writeFileSync(SOUNDS_FILE, JSON.stringify(restoredSounds, null, 2), 'utf-8');
      if (manifest.settings) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(manifest.settings, null, 2), 'utf-8');
      }

      return {
        sounds: restoredSounds,
        settings: manifest.settings || null,
      };
    }

    // Fallback for legacy .json files
    const backupContent = fs.readFileSync(selectedFile, 'utf-8');
    const parsed = JSON.parse(backupContent);

    if (!parsed.sounds || !Array.isArray(parsed.sounds)) {
      throw new Error('Invalid backup file structure: missing sounds array');
    }

    fs.writeFileSync(SOUNDS_FILE, JSON.stringify(parsed.sounds, null, 2), 'utf-8');
    if (parsed.settings) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(parsed.settings, null, 2), 'utf-8');
    }

    return {
      sounds: parsed.sounds,
      settings: parsed.settings || null,
    };
  } catch (err) {
    console.error('Import backup failed:', err);
    return null;
  }
});

ipcMain.handle('install-virtual-driver', async () => {
  const setupPath = path.join(__dirname, '../driver/vbcable/VBCABLE_Setup_x64.exe');
  if (fs.existsSync(setupPath)) {
    const psCommand = `Start-Process -FilePath "${setupPath}" -Verb RunAs`;
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand]);
    return true;
  }
  return false;
});

ipcMain.handle('load-settings', async () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      if (loaded.panicHotkey) {
        panicHotkey = loaded.panicHotkey;
      }
      if (loaded.repeatLastHotkey) {
        repeatLastHotkey = loaded.repeatLastHotkey;
      }
      if (loaded.overlayHotkey) {
        overlayHotkey = loaded.overlayHotkey;
      }
      if (loaded.recordHotkey) {
        recordHotkey = loaded.recordHotkey;
      }
      return loaded;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return {
    inputDeviceId: 'default',
    primaryDeviceId: 'default',
    secondaryDeviceId: '',
    isSecondaryEnabled: true,
    isMicPassThroughEnabled: true,
    hearMyself: false,
    masterSpeakerVolume: 100,
    masterMicVolume: 100,
    micInputVolume: 100,
    isNoiseGateEnabled: false,
    noiseGateThreshold: -39,
    panicHotkey: 'Escape',
    overlayHotkey: 'F8',
    theme: 'dark',
    accentColor: '#00a4ef',
    minimizeToTray: true,
  };
});

ipcMain.handle('save-settings', async (_event, settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    ensurePhysicalDefaultSpeakers();
    if (settings.panicHotkey) {
      panicHotkey = settings.panicHotkey;
    }
    if (settings.repeatLastHotkey) {
      repeatLastHotkey = settings.repeatLastHotkey;
    }
    if (settings.overlayHotkey) {
      overlayHotkey = settings.overlayHotkey;
    }
    if (settings.recordHotkey) {
      recordHotkey = settings.recordHotkey;
    }

    // Configure Windows login auto-start (Start on Boot)
    try {
      if (typeof settings.startOnBoot === 'boolean') {
        const appFolder = path.dirname(process.execPath);
        const updateExe = path.resolve(appFolder, '..', 'Update.exe');
        const exeName = path.basename(process.execPath);

        app.setLoginItemSettings({
          openAtLogin: settings.startOnBoot,
          path: updateExe.includes('Update.exe') && fs.existsSync(updateExe) ? updateExe : process.execPath,
          args: [
            ...(updateExe.includes('Update.exe') && fs.existsSync(updateExe) ? ['--processStart', `"${exeName}"`] : []),
            ...(settings.startInTray ? ['--hidden'] : []),
          ],
        });
      }
    } catch (bootErr) {
      console.warn('Failed to set login item settings:', bootErr);
    }

    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
});

// YouTube In-App Search
ipcMain.handle('search-youtube', async (_event, query) => {
  return new Promise((resolve) => {
    if (!query || !query.trim()) {
      return resolve([]);
    }

    const ytDlp = getYtDlpPath();
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const searchTarget = isUrl ? query : `ytsearch10:${query}`;

    const args = [
      searchTarget,
      '--flat-playlist',
      '--dump-json',
      '--no-playlist',
      '--ignore-errors',
    ];

    const child = spawn(ytDlp, args);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      const results = [];
      const lines = output.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const sec = item.duration || 0;
          const mins = Math.floor(sec / 60);
          const secs = Math.floor(sec % 60);
          const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

          let thumb = '';
          if (item.thumbnails && item.thumbnails.length > 0) {
            thumb = item.thumbnails[item.thumbnails.length - 1].url;
          } else if (item.id) {
            thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
          }

          results.push({
            id: item.id || `yt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            title: item.title || 'Unknown Title',
            channel: item.channel || item.uploader || 'YouTube',
            duration: item.duration_string || durationStr,
            durationSec: sec,
            thumbnail: thumb,
            url: item.url || item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : query),
          });
        } catch (err) {}
      }
      resolve(results);
    });

    child.on('error', (err) => {
      console.error('yt-dlp search error:', err);
      resolve([]);
    });
  });
});

// YouTube Trending Music Fetcher (Pulls real trending music from YouTube's Top Songs chart)
ipcMain.handle('get-trending-music', async () => {
  return new Promise((resolve) => {
    const ytDlp = getYtDlpPath();
    // YouTube Top Songs & Music Hits chart playlist
    const trendingSource = 'https://www.youtube.com/playlist?list=PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU';

    const args = [
      trendingSource,
      '--flat-playlist',
      '--dump-json',
      '--playlist-end',
      '15',
      '--ignore-errors',
    ];

    const child = spawn(ytDlp, args);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      const results = [];
      const lines = output.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const sec = item.duration || 0;
          const mins = Math.floor(sec / 60);
          const secs = Math.floor(sec % 60);
          const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

          let thumb = '';
          if (item.thumbnails && item.thumbnails.length > 0) {
            thumb = item.thumbnails[item.thumbnails.length - 1].url;
          } else if (item.id) {
            thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
          }

          results.push({
            id: item.id || `yt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            title: item.title || 'Unknown Title',
            channel: item.channel || item.uploader || 'YouTube Music',
            duration: item.duration_string || durationStr,
            durationSec: sec,
            thumbnail: thumb,
            url: item.url || item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : ''),
          });
        } catch (err) {}
      }

      // If playlist returned items, resolve them
      if (results.length > 0) {
        return resolve(results);
      }

      // Fallback query if playlist was unavailable
      const fallbackTarget = 'ytsearch12:top music hits official audio';
      execFile(ytDlp, [fallbackTarget, '--flat-playlist', '--dump-json', '--no-playlist', '--ignore-errors'], (_err, fallbackOut) => {
        if (!fallbackOut) return resolve([]);
        const fbResults = [];
        for (const l of fallbackOut.split('\n')) {
          if (!l.trim()) continue;
          try {
            const it = JSON.parse(l);
            const sec = it.duration || 0;
            const mins = Math.floor(sec / 60);
            const secs = Math.floor(sec % 60);
            const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            let thumb = '';
            if (it.thumbnails && it.thumbnails.length > 0) {
              thumb = it.thumbnails[it.thumbnails.length - 1].url;
            } else if (it.id) {
              thumb = `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`;
            }

            fbResults.push({
              id: it.id || `yt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              title: it.title || 'Unknown Title',
              channel: it.channel || it.uploader || 'YouTube',
              duration: it.duration_string || durationStr,
              durationSec: sec,
              thumbnail: thumb,
              url: it.url || it.webpage_url || (it.id ? `https://www.youtube.com/watch?v=${it.id}` : ''),
            });
          } catch (e) {}
        }
        resolve(fbResults);
      });
    });

    child.on('error', (err) => {
      console.error('yt-dlp trending error:', err);
      resolve([]);
    });
  });
});

// YouTube Audio Preview (instant stream URL)
ipcMain.handle('get-youtube-preview-url', async (_event, url) => {
  return new Promise((resolve) => {
    const ytDlp = getYtDlpPath();
    const args = ['-g', '-f', 'ba/b', '--no-playlist', url];

    execFile(ytDlp, args, (error, stdout) => {
      if (error || !stdout) {
        return resolve(null);
      }
      const streamUrl = stdout.trim().split('\n')[0];
      resolve(streamUrl || null);
    });
  });
});

// YouTube Audio Download
ipcMain.handle('download-youtube-audio', async (_event, { url, title: customTitle }) => {
  return new Promise((resolve, reject) => {
    const ytDlp = getYtDlpPath();
    const fileId = `yt_${Date.now()}`;
    const outputTemplate = path.join(AUDIO_DIR, `${fileId}.%(ext)s`);

    const args = [
      '-f', 'ba/b',
      '--no-playlist',
      '-o', outputTemplate,
      '--no-simulate',
      '--print-json',
      url,
    ];

    const child = spawn(ytDlp, args);
    let jsonOutput = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      jsonOutput += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        console.error('yt-dlp download failed:', stderr);
        return reject(new Error('Failed to download audio from YouTube.'));
      }

      try {
        let meta = {};
        const lines = jsonOutput.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              meta = JSON.parse(line);
              break;
            } catch (e) {}
          }
        }

        // Find the saved audio file
        const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.startsWith(fileId));
        if (files.length === 0) {
          return reject(new Error('Audio file not found after download.'));
        }

        const audioFilePath = path.join(AUDIO_DIR, files[0]);
        const audioBuffer = fs.readFileSync(audioFilePath);
        const ext = path.extname(audioFilePath).toLowerCase().replace('.', '');
        let mime = ext;
        if (ext === 'm4a') mime = 'mp4';
        else if (ext === 'webm') mime = 'webm';
        else if (ext === 'mp3') mime = 'mpeg';
        else if (ext === 'ogg') mime = 'ogg';
        const audioData = `data:audio/${mime};base64,${audioBuffer.toString('base64')}`;

        // Get thumbnail base64 if available
        let thumbUrl = meta.thumbnail || (meta.thumbnails && meta.thumbnails.length ? meta.thumbnails[meta.thumbnails.length - 1].url : '');
        let thumbBase64 = thumbUrl;

        resolve({
          filePath: audioFilePath,
          audioData,
          thumbnail: thumbBase64,
          duration: meta.duration || 0,
          title: customTitle || meta.title || 'Downloaded Sound',
          author: meta.channel || meta.uploader || 'YouTube',
        });
      } catch (err) {
        console.error('Error processing downloaded audio:', err);
        reject(err);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
});

// Process dropped or selected audio file paths into SoundItem imported format
ipcMain.handle('import-audio-filepaths', async (_event, filePaths) => {
  if (!Array.isArray(filePaths) || !filePaths.length) return [];
  const validExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
  const imported = [];

  for (const srcPath of filePaths) {
    try {
      if (!fs.existsSync(srcPath)) continue;
      const ext = path.extname(srcPath).toLowerCase();
      if (!validExts.includes(ext)) continue;

      const fileName = path.basename(srcPath);
      const baseName = path.basename(srcPath, ext);
      const destPath = path.join(AUDIO_DIR, `${Date.now()}_${fileName}`);
      fs.copyFileSync(srcPath, destPath);

      const buffer = fs.readFileSync(destPath);
      const cleanExt = ext.replace('.', '');
      let mime = cleanExt;
      if (cleanExt === 'm4a') mime = 'mp4';
      else if (cleanExt === 'mp3') mime = 'mpeg';
      const audioData = `data:audio/${mime};base64,${buffer.toString('base64')}`;

      imported.push({
        name: baseName,
        filePath: destPath,
        audioData,
        duration: 0,
      });
    } catch (err) {
      console.error('Error importing dropped audio file:', err);
    }
  }

  return imported;
});

// Save in-app recorded audio clip directly to soundboard library
ipcMain.handle('save-recorded-audio', async (_event, { base64, duration, title }) => {
  try {
    // Detect MIME type and extension from data URL header
    const match = base64.match(/^data:audio\/([a-zA-Z0-9_-]+);base64,/);
    let ext = 'wav';
    let mime = 'audio/wav';
    if (match && match[1]) {
      const type = match[1].toLowerCase();
      if (type.includes('webm')) {
        ext = 'webm';
        mime = 'audio/webm';
      } else if (type.includes('wav')) {
        ext = 'wav';
        mime = 'audio/wav';
      }
    }

    const fileName = `clip_${Date.now()}.${ext}`;
    const destPath = path.join(AUDIO_DIR, fileName);

    // Strip base64 data header if present
    const cleanBase64 = base64.replace(/^data:audio\/[a-zA-Z0-9_-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(destPath, buffer);

    const audioData = `data:${mime};base64,${buffer.toString('base64')}`;
    return {
      filePath: destPath,
      audioData,
      duration: duration || 0,
      title: title || `Recorded Clip ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    };
  } catch (err) {
    console.error('Error saving recorded audio:', err);
    throw err;
  }
});

// Local file selection
ipcMain.handle('select-audio-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Sound Files',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled || !result.filePaths.length) {
    return [];
  }

  const imported = [];
  for (const srcPath of result.filePaths) {
    try {
      const fileName = path.basename(srcPath);
      const ext = path.extname(srcPath);
      const baseName = path.basename(srcPath, ext);
      const destPath = path.join(AUDIO_DIR, `${Date.now()}_${fileName}`);
      fs.copyFileSync(srcPath, destPath);

      const buffer = fs.readFileSync(destPath);
      const cleanExt = ext.replace('.', '').toLowerCase();
      const mime = cleanExt === 'm4a' ? 'mp4' : cleanExt;
      const audioData = `data:audio/${mime};base64,${buffer.toString('base64')}`;

      imported.push({
        name: baseName,
        filePath: destPath,
        audioData,
        duration: 0,
      });
    } catch (err) {
      console.error('Error importing audio file:', err);
    }
  }

  return imported;
});

// Local image selection
ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Artwork Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  try {
    const srcPath = result.filePaths[0];
    const buffer = fs.readFileSync(srcPath);
    const ext = path.extname(srcPath).replace('.', '').toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error('Error reading artwork image:', err);
    return null;
  }
});

// Read audio file buffer
ipcMain.handle('read-audio-buffer', async (_event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).replace('.', '').toLowerCase();
      const mime = ext === 'm4a' ? 'mp4' : ext;
      return `data:audio/${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Failed to read audio buffer:', err);
  }
  return '';
});

// Hotkey Registration (Managed via Low-Level Keyboard Hook so regular typing is NEVER blocked)
ipcMain.handle('register-hotkey', async (_event, { hotkey, soundId }) => {
  if (!hotkey) return false;
  const norm = normalizeKey(hotkey);
  if (!norm) return false;

  registeredHotkeys.set(norm, soundId);
  return true;
});

ipcMain.handle('unregister-hotkey', async (_event, hotkey) => {
  if (!hotkey) return false;
  const norm = normalizeKey(hotkey);
  if (!norm) return false;

  registeredHotkeys.delete(norm);
  return true;
});

ipcMain.handle('unregister-all-hotkeys', async () => {
  try {
    registeredHotkeys.clear();
    return true;
  } catch (err) {
    console.error('Failed to unregister all hotkeys:', err);
    return false;
  }
});

// Rename Virtual Mic to "Prism Virtual Microphone" via elevated PowerShell
ipcMain.handle('rename-virtual-mic', async () => {
  return new Promise((resolve) => {
    try {
      const psCommand = `
        $cap = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Capture' | ForEach-Object {
          $p = Get-ItemProperty "$($_.PSPath)\\Properties" -ErrorAction SilentlyContinue
          if ($p -and ($p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2' -like '*CABLE*')) { $_ }
        }
        if ($cap) {
          New-ItemProperty -Path "$($cap.PSPath)\\Properties" -Name '{b3f8fa53-0004-438e-9002-0d4e698b45ab},6' -Value 'Prism Virtual Microphone' -PropertyType String -Force
        }
      `.replace(/\r?\n\s*/g, ' ');

      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', `Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -Command \\"${psCommand}\\""`
      ], { windowsHide: true });

      child.on('close', () => resolve(true));
      child.on('error', () => resolve(false));
    } catch (e) {
      resolve(false);
    }
  });
});

// GitHub Release Update Checker helper
function fetchLatestGitHubRelease() {
  return new Promise((resolve) => {
    let currentVersion = '1.4.1';
    try {
      const pkgPath = path.join(__dirname, '../package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) currentVersion = pkg.version;
      }
    } catch (e) {}

    const owner = 'fafaidot';
    const repo = 'Prism-Soundboard';

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/latest`,
      headers: {
        'User-Agent': 'Prism-Soundboard-App',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            return resolve({
              hasUpdate: false,
              currentVersion,
              message: `No public releases found yet for ${owner}/${repo}.`,
              owner,
              repo,
            });
          }

          if (res.statusCode !== 200) {
            return resolve({
              hasUpdate: false,
              currentVersion,
              error: `GitHub API returned HTTP ${res.statusCode}`,
              owner,
              repo,
            });
          }

          const release = JSON.parse(data);
          const latestTag = (release.tag_name || release.name || '').replace(/^v/i, '').trim();
          const cleanCurrent = currentVersion.replace(/^v/i, '').trim();

          const isNewer = compareSemver(latestTag, cleanCurrent) > 0;

          // Prefer the Setup/Installer asset first so it updates installed shortcuts and files; fallback to any .exe
          let downloadUrl = release.html_url;
          if (Array.isArray(release.assets)) {
            const setupAsset = release.assets.find(
              (a) => a.name && a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe')
            );
            const anyExeAsset = release.assets.find(
              (a) => a.name && (a.name.endsWith('.exe') || a.name.endsWith('.msi'))
            );
            const targetAsset = setupAsset || anyExeAsset;
            if (targetAsset && targetAsset.browser_download_url) {
              downloadUrl = targetAsset.browser_download_url;
            }
          }

          resolve({
            hasUpdate: isNewer,
            currentVersion,
            latestVersion: latestTag || release.tag_name,
            releaseName: release.name || release.tag_name,
            releaseNotes: release.body || '',
            publishedAt: release.published_at,
            releaseUrl: release.html_url,
            downloadUrl,
            owner,
            repo,
          });
        } catch (parseErr) {
          resolve({
            hasUpdate: false,
            currentVersion,
            error: 'Failed to parse release information.',
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        hasUpdate: false,
        currentVersion,
        error: err.message || 'Network error while checking updates.',
      });
    });

    req.setTimeout(6000, () => {
      req.destroy();
      resolve({
        hasUpdate: false,
        currentVersion,
        error: 'Update check timed out.',
      });
    });
  });
}

// GitHub Release Update Checker IPC
ipcMain.handle('check-app-updates', async () => {
  return fetchLatestGitHubRelease();
});

// Direct in-app update downloader and installer (No browser needed)
ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
  if (!downloadUrl) {
    return { success: false, error: 'No download URL provided.' };
  }

  const senderWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;

  return new Promise((resolve) => {
    try {
      const tempDir = app.getPath('temp');
      const installerFileName = `Prism_Soundboard_Setup_Update_${Date.now()}.exe`;
      const installerPath = path.join(tempDir, installerFileName);
      const fileStream = fs.createWriteStream(installerPath);

      function downloadStream(url, redirectCount = 0) {
        if (redirectCount > 10) {
          fileStream.close();
          try { fs.unlinkSync(installerPath); } catch (e) {}
          return resolve({ success: false, error: 'Too many download redirects.' });
        }

        const client = url.startsWith('https') ? https : http;
        const options = {
          headers: {
            'User-Agent': 'Prism-Soundboard-Updater',
            Accept: 'application/octet-stream, */*',
          },
        };

        const req = client.get(url, options, (res) => {
          // Follow HTTP redirects (GitHub asset releases redirect to AWS S3 CDN)
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            return downloadStream(res.headers.location, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            fileStream.close();
            try { fs.unlinkSync(installerPath); } catch (e) {}
            return resolve({
              success: false,
              error: `Server responded with HTTP status ${res.statusCode}`,
            });
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferredBytes = 0;
          let lastReportPercent = -1;

          res.on('data', (chunk) => {
            transferredBytes += chunk.length;
            fileStream.write(chunk);

            if (totalBytes > 0 && senderWindow && !senderWindow.isDestroyed()) {
              const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
              if (percent !== lastReportPercent) {
                lastReportPercent = percent;
                senderWindow.webContents.send('update-download-progress', {
                  percent,
                  transferred: transferredBytes,
                  total: totalBytes,
                });
              }
            }
          });

          res.on('end', () => {
            fileStream.end(() => {
              if (senderWindow && !senderWindow.isDestroyed()) {
                senderWindow.webContents.send('update-download-progress', {
                  percent: 100,
                  transferred: transferredBytes,
                  total: totalBytes || transferredBytes,
                });
              }

              // Give Windows filesystem a brief moment to release handles, then launch installer
              setTimeout(() => {
                try {
                  console.log('[Updater] Launching downloaded installer:', installerPath);
                  const child = spawn(installerPath, [], {
                    detached: true,
                    stdio: 'ignore',
                  });
                  child.unref();

                  // Safely quit running instance so the NSIS installer can update files smoothly
                  setTimeout(() => {
                    app.quit();
                  }, 600);

                  resolve({ success: true });
                } catch (spawnErr) {
                  console.error('[Updater] Failed to execute installer:', spawnErr);
                  resolve({
                    success: false,
                    error: `Failed to launch installer: ${spawnErr.message}`,
                  });
                }
              }, 400);
            });
          });

          res.on('error', (err) => {
            fileStream.close();
            try { fs.unlinkSync(installerPath); } catch (e) {}
            resolve({ success: false, error: err.message || 'Stream error during download.' });
          });
        });

        req.on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(installerPath); } catch (e) {}
          resolve({ success: false, error: err.message || 'Network error while connecting.' });
        });
      }

      downloadStream(downloadUrl);
    } catch (err) {
      resolve({ success: false, error: err.message || 'Unknown updater error.' });
    }
  });
});

function compareSemver(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = v1.split('.').map((n) => parseInt(n) || 0);
  const p2 = v2.split('.').map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
