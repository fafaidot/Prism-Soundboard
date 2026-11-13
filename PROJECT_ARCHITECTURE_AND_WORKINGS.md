# Prism Soundboard - Complete Project Architecture, Workings, and Code Reference

## 1. Executive Summary & Tech Stack

**Prism Soundboard** is a high-performance Windows desktop soundboard and gaming clip capture application engineered with Electron, React, TypeScript, and the Web Audio API. It provides virtual microphone piping (direct into Discord/Steam games via VB-CABLE), instantaneous global hotkeys via a native C# Win32 low-level keyboard hook, an always-on-top transparent in-game overlay HUD, real-time audio trimming, instant replay video clipping (Medal/ShadowPlay style), and an atomic, snapshot-backed persistence engine.

### Technology Stack
- **Desktop Shell**: Electron 45 (`electron/main.cjs`, `electron/preload.cjs`, `electron/starter.cjs`)
- **Frontend Framework**: React 19 (`react`, `react-dom`) + TypeScript 6 (`tsc -b`)
- **Build System**: Vite 8 (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`) + Tailwind CSS 4
- **Native Input Hook**: Win32 Low-Level Keyboard Hook compiled in C# (`bin/GlobalKeyHook.exe`, `scripts/GlobalKeyHook.cs`)
- **Audio DSP & Routing**: Web Audio API (`AudioContext`, `GainNode`, `AnalyserNode`, `AudioWorkletNode`, `MediaStreamAudioDestinationNode`)
- **Video Capture Engine**: Dual-staggered `MediaRecorder` + `fix-webm-duration` + Windows Desktop Capturer
- **Audio & Media Tooling**: Embedded `yt-dlp.exe` for YouTube search and audio extraction
- **Persistence Engine**: Custom atomic writer (`storageManager.cjs`) with `fsync`, rolling snapshots, and ZIP backup bundling (`adm-zip`)

---

## 2. Directory Layout & File Responsibilities

```
Soundboard/
├── bin/
│   ├── GlobalKeyHook.exe          # Compiled Win32 low-level keyboard hook
│   └── yt-dlp.exe                 # YouTube audio search & extraction CLI
├── driver/
│   └── vbcable/                   # Bundled VB-CABLE driver setup installer & INF files
├── electron/
│   ├── main.cjs                   # Main Electron process, window management, IPC handlers
│   ├── preload.cjs                # ContextBridge security barrier exposing soundboardAPI
│   ├── starter.cjs                # Electron dev/prod runner
│   └── storageManager.cjs         # Atomic file persistence, self-healing snapshots, backup/restore
├── public/
│   ├── favicon.ico
│   └── Prism.png
├── scripts/
│   ├── GlobalKeyHook.cs           # C# source code for Win32 WH_KEYBOARD_LL hook
│   ├── bump-version.js            # Release version incrementer
│   └── github-release.js          # Automated GitHub release & asset publisher
├── src/
│   ├── main.tsx                   # React root mount
│   ├── App.tsx                    # Core app container, state coordinator, keyboard router
│   ├── index.css                  # Tailwind styles and custom scrollbar rules
│   ├── themes.ts                  # Preset themes and dynamic CSS variable injector
│   ├── types.ts                   # Core TypeScript domain models and IPC interface types
│   ├── services/
│   │   ├── audioEngine.ts         # Dual-context audio routing, noise gate, VU metering
│   │   └── videoClipper.ts        # Dual-staggered replay ring buffer, screen+audio muxer
│   └── components/
│       ├── AudioTrimmerModal.tsx   # Waveform visualizer & start/end timestamp trimmer
│       ├── BottomToolbar.tsx       # Quick volume sliders, active sound status, stop button
│       ├── ClearAllSoundsModal.tsx # Confirmation modal with backup-before-clear prompt
│       ├── ClipCard.tsx            # Video replay clip card tile
│       ├── CommandBar.tsx          # Search bar, filter pills, and sorting dropdown
│       ├── ControlPanel.tsx        # Selected sound details, volume, speed, 5 playback modes
│       ├── DeleteConfirmationModal.tsx # Soft delete confirmation dialog
│       ├── EditSoundModal.tsx      # Title, author, and custom artwork changer
│       ├── HotkeyRecorderModal.tsx # Dedicated keypress capture dialog
│       ├── InGameOverlayModal.tsx  # DirectX DWM transparent gaming HUD overlay
│       ├── RestoreDeletedModal.tsx # Recycle bin viewer with instant restore & purge
│       ├── SettingsModal.tsx       # Audio devices, voice gate, hotkey rebinding, backups
│       ├── Slider.tsx              # Custom styled range slider
│       ├── SoundCard.tsx           # Sound tile with artwork, hotkey badge, play progress
│       ├── TitleBar.tsx            # Custom frameless window drag bar & window controls
│       ├── Tooltip.tsx             # Popover tooltip helper
│       ├── VBCableSetupModal.tsx   # One-click VB-CABLE driver installation guide
│       ├── VideoPlayerModal.tsx    # Full-screen clip playback, trimming & sound export
│       └── YouTubeSearchModal.tsx  # In-app YouTube search, preview, and downloader
├── package.json                   # Dependencies, scripts, and electron-builder config
└── vite.config.ts                 # Vite bundler configuration
```

---

## 3. Subsystem Deep-Dive & Code Workings

### 3.1 Audio Architecture & Dual-Context Routing (`src/services/audioEngine.ts`)

The audio pipeline solves the fundamental challenge of gaming soundboards: **how to play sounds both into your personal headphones AND into a virtual microphone (Discord/games) without your headphones leaking back into the mic or echoing.**

```
                                [ Physical Microphone ]
                                           │
                                  [ Noise Gate Gain ]
                                           │
                                  [ Mic Master Gain ]
                                   /               \
                       (Hear Myself: ON/OFF)     (Mic Pass-Through: ON/OFF)
                                 /                   \
                                ▼                     ▼
                       [ ctx.destination ]   [ cableMixDestination ]
                      (Personal Headphones)           │
                                 ▲                    │ (MediaStreamSource)
                                 │                    ▼
                        [ toHeadphonesGain ]   [ toCableGain ]
                                 \                   /
                                  \                 /
                                  [ soundGainNode ]
                                          ▲
                                          │
                                [ MediaElementSource ]
                                          ▲
                                          │
                                 [ HTMLAudioElement ]
```

#### Dual-Context Design
1. **Primary Context (`ctx`)**:
   - Manages personal headphone output (`ctx.destination`) locked to your physical headphones via `(ctx as any).setSinkId(headphonesId)`.
   - Manages physical voice input via `navigator.mediaDevices.getUserMedia`.
   - Runs real-time Noise Gate with fast 15ms attack and 180ms exponential decay.
   - Mixes physical voice + soundboard audio into `cableMixDestination` (`ctx.createMediaStreamDestination()`).
2. **Dedicated Cable Context (`cableCtx`)**:
   - Locked directly to the hardware GUID of **VB-Audio CABLE Input** via `(cableCtx as any).setSinkId(cableId)`.
   - Only runs when `cableCtx.sinkId === cableDeviceId` to strictly prevent any virtual audio from bleeding into physical speakers.

#### 5 Reproduction Modes
- **Play & Overlap (`overlap`)**: Every keypress spawns a concurrent audio instance allowing rapid audio layering.
- **Play & Pause (`pause`)**: Toggles between playing and pausing the sound.
- **Play & Stop (`stop`)**: If playing, stops playback and resets to beginning; if stopped, plays.
- **Play & Restart (`restart`)**: If playing, resets current playback time to 0; if stopped, starts.
- **Play & Loop (`push_loop`)**: Loops playback continuously until pressed again.

---

### 3.2 Native Win32 Low-Level Keyboard Hook (`scripts/GlobalKeyHook.cs` & `electron/main.cjs`)

Unlike Electron's standard `globalShortcut` API (which intercepts and blocks keyboard input from reaching games), Prism uses a low-level Win32 hook (`WH_KEYBOARD_LL = 13`):

```csharp
// scripts/GlobalKeyHook.cs
private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
        bool isDown = (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN);
        bool isUp = (wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP);

        if (isDown || isUp) {
            KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            int vk = hookStruct.vkCode;

            // Ignores standalone modifier presses
            if (vk != 0x10 && vk != 0x11 && vk != 0x12 && vk != 0x5B && vk != 0x5C) {
                string key = GetKeyName(vk);
                if (key != null) {
                    bool ctrl = (GetKeyState(0x11) & 0x8000) != 0;
                    bool alt = (GetKeyState(0x12) & 0x8000) != 0;
                    bool shift = (GetKeyState(0x10) & 0x8000) != 0;

                    StringBuilder sb = new StringBuilder();
                    if (ctrl) sb.Append("Ctrl+");
                    if (alt) sb.Append("Alt+");
                    if (shift) sb.Append("Shift+");
                    sb.Append(key);

                    if (isDown) Console.WriteLine("KEY_DOWN:" + sb.ToString());
                    else if (isUp) Console.WriteLine("KEY_UP:" + sb.ToString());
                }
            }
        }
    }
    // ALWAYS calls CallNextHookEx so gameplay typing is NEVER blocked!
    return CallNextHookEx(_hookId, nCode, wParam, lParam);
}
```

The C# binary runs as a background child process spawned by `electron/main.cjs`. It outputs key events over stdout, where they are parsed and matched against registered sound shortcuts and system hotkeys.

---

### 3.3 Storage, Persistence, and Backup Engine (`electron/storageManager.cjs`)

Prism features a dedicated storage manager implementing desktop-grade reliability:

1. **Atomic File Writes**:
   Writes data to a temporary file (`${filePath}.tmp.${timestamp}_${random}`), calls `fs.fsyncSync(fd)` to guarantee physical disk write, and then performs an atomic rename. This prevents 0-byte file corruption if Windows shuts down abruptly.
2. **Self-Healing Rolling Snapshots**:
   Every save operation automatically updates `snapshots/sounds.snapshot.json` and creates a rotating timestamped snapshot (`sounds_${Date.now()}.bak.json`, retaining up to 3). If `sounds.json` is corrupted, the system auto-recovers from the latest snapshot on launch.
3. **Synchronous Quit Flush**:
   Debounced writes are stored in memory buffers. During `app.on('before-quit')` and `app.on('will-quit')`, `storageManager.flushSync()` synchronously commits all pending changes.
4. **Full `.prism` Backup & Restore**:
   Bundles all audio files, video files, and JSON databases into a standard ZIP archive with manifest v2 and progress callbacks (`onBackupProgress`).

---

### 3.4 Instant Replay Video Clipping (`src/services/videoClipper.ts`)

Prism implements a **dual-staggered MediaRecorder ring buffer** inspired by Medal.tv and Nvidia ShadowPlay:

```
Timeline:    0s             7.5s           15s            22.5s          30s
Slot A:      [═════════════════════════════] (Finalized)
Slot B:                     [═════════════════════════════] (Finalized)
Slot A2:                                   [═════════════════════════════]
```

- Two `MediaRecorder` instances record concurrently, offset by half the buffer duration (e.g. 7.5s for a 15s buffer).
- When a slot reaches the target duration, it finalizes into `lastCompletedBlob` and starts a replacement slot.
- When the user presses the clip hotkey, the buffer selects the slot closest to the target duration, injects EBML duration metadata using `fix-webm-duration`, and saves the video directly to `Videos/`.

---

### 3.5 YouTube Integration & Trending Music (`electron/main.cjs` & `YouTubeSearchModal.tsx`)

- Uses bundled `bin/yt-dlp.exe` with `--flat-playlist --dump-json` to query YouTube and fetch top trending songs without requiring an API key.
- Generates instant audio preview streams via `yt-dlp -g -f ba/b`.
- Downloads high-quality audio files directly to `Sounds/` folder.

---

## 4. Comprehensive Audit: Flaws, Glitches, and Bugs Discovered

During our line-by-line audit of the entire codebase, we identified several bugs, memory leaks, and edge-case glitches:

| # | Severity | Category | Description |
|---|---|---|---|
| **1** | **Critical** | Hotkeys | **Stuck Modifier Bug in Key Hook**: If user presses `Ctrl+1`, then releases `Ctrl` before releasing `1`, `KEY_UP:1` is sent instead of `KEY_UP:Ctrl+1`. `"ctrl+1"` remains stuck in `currentlyHeldKeys` set in `main.cjs`, permanently disabling that hotkey until app restart. |
| **2** | **Critical** | Hotkeys / Settings | **Panic Hotkey Rebinding Failure**: In `SettingsModal.tsx`, pressing `Escape` saves `panicHotkey: 'Esc'`. `GlobalKeyHook.cs` emits `'Escape'`, which normalizes to `'escape'`. Because `'esc' !== 'escape'`, rebinding the panic key breaks panic functionality completely. |
| **3** | **High** | Audio Engine | **Web Audio Node & Event Listener Memory Leak**: In `audioEngine.ts`, `startNewPlayback` creates a `MediaElementAudioSourceNode`, 3 `GainNode`s, and 6 event listeners per sound. When a sound naturally ends (`onEnded`), nodes and listeners are NEVER disconnected. After 100 sound plays, hundreds of orphaned nodes waste CPU on the audio thread. |
| **4** | **High** | Video Clipper | **AudioContext Resource Exhaustion**: In `videoClipper.ts`, `playClipCueSound()` calls `new AudioContext()` on every clip save without calling `close()`. Chromium limits concurrent AudioContexts to 6; saving 6 clips exhausts the limit and crashes subsequent audio cue creation. |
| **5** | **High** | Storage / Memory | **Base64 String Bloat in Sound Persistence**: In `main.cjs` (`download-youtube-audio`, `import-audio-filepaths`, `save-recorded-audio`), entire multi-megabyte audio files are converted into base64 data URLs in `audioData`. When saved, `soundboard_sounds.json` balloons to 100MB-135MB+, causing heavy memory usage and disk write latency. |
| **6** | **Medium** | Hotkeys | **Numpad Special Keys Mismatch**: In `App.tsx` and `HotkeyRecorderModal.tsx`, Numpad operators are saved as `"Num Multiply"`, `"Num Subtract"`, `"Num Decimal"`, `"Num Divide"` (normalizing to `"nummultiply"`, `"numsubtract"`), but `GlobalKeyHook.cs` emits `"NumMult"`, `"NumSub"`, `"NumDec"`, `"NumDiv"`. Consequently, Numpad math operators never trigger sounds. |
| **7** | **Medium** | Media / Storage | **Video Extract Misnamed as .wav & Bypassed storageManager**: In `extract-audio-from-video-clip`, WebM video container bytes are copied into a file named `.wav`, creating a malformed WAV file. It also writes directly using `fs.writeFileSync(SOUNDS_FILE)` instead of `storageManager.saveSounds()`, bypassing atomic writing and snapshot creation. |
| **8** | **Medium** | UI / Windows OS | **yt-dlp Console Window Flash**: `spawn(ytDlp, args)` in `search-youtube`, `get-trending-music`, and `download-youtube-audio` lacks `{ windowsHide: true }`. On Windows, this causes brief black command-prompt window flashes when searching or downloading. |
| **9** | **Medium** | In-Game Overlay | **Multi-Monitor Display Misalignment**: `createOverlayWindow` specifies `width: 1480, height: 700` but does not position the window on the active display where the user's game is running. On multi-monitor setups, the overlay can appear on the wrong monitor. |
| **10** | **Low** | State Sync | **Missing Hotkey Re-Registration on Sound Updates**: In `App.tsx`, receiving `sounds-updated` over IPC (from backup import, recycle bin restore, or overlay additions) updates React state but fails to re-register hotkeys with `registerGlobalHotkey`, requiring an app restart for new shortcuts to work. |

---

## 5. Detailed Remediation Plan

### Phase 1: Critical Hotkey System Fixes (Bugs #1, #2, #6)
1. **Fix Stuck Modifier State in `electron/main.cjs`**:
   - In `handleHookKeyUp(rawKey)`: When a key is released (e.g. `'1'`), purge not only `'1'` but also any combo in `currentlyHeldKeys` that ends with `'+' + norm` (e.g. `'ctrl+1'`, `'shift+1'`, `'ctrl+shift+1'`).
   - Add explicit modifier clearing when modifier keys are released.
2. **Normalize Key Name Aliases in `electron/main.cjs`**:
   - Update `normalizeKey(k)` to map `'esc'` to `'escape'`.
   - Update `normalizeKey(k)` to map `'nummultiply'` / `'nummult'`, `'numsubtract'` / `'numsub'`, `'numdecimal'` / `'numdec'`, and `'numdivide'` / `'numdiv'` to unified tokens.
3. **Harmonize Numpad Code Handling in `src/App.tsx`, `SettingsModal.tsx`, `HotkeyRecorderModal.tsx`**:
   - Align key generation for Numpad keys (`NumpadMultiply` -> `NumMult`, `NumpadSubtract` -> `NumSub`, `NumpadDecimal` -> `NumDec`, `NumpadDivide` -> `NumDiv`, `Numpad0-9` -> `Num0-9`).

### Phase 2: Audio Engine & Video Clipper Lifecycle Fixes (Bugs #3, #4)
1. **Clean Playback Teardown in `src/services/audioEngine.ts`**:
   - In `removePlayback(soundId, audioEl)` and `stopSound(soundId)`:
     - Disconnect `p.sourceNode`, `p.soundGainNode`, `p.toHeadphonesGain`, `p.toCableGain`.
     - Remove all event listeners (`play`, `playing`, `pause`, `ended`, `error`, `timeupdate`).
     - Clear `audioEl.src = ''` and call `audioEl.load()`.
2. **AudioContext Recycling in `src/services/videoClipper.ts`**:
   - In `playClipCueSound()`: Route cue audio through `audioEngine.getAudioContext()` or properly close the temporary `AudioContext` with `setTimeout(() => audioCtx.close(), 300)`.

### Phase 3: Storage Optimization & Base64 Purge (Bugs #5, #7)
1. **Purge Redundant Base64 `audioData` in `electron/storageManager.cjs` & `electron/main.cjs`**:
   - In `storageManager.saveSounds(sounds)`: If `sound.audioPath` exists on disk, strip `sound.audioData` before serializing to disk. This immediately reduces `soundboard_sounds.json` from 135MB to ~20KB.
   - In `audioEngine.ts`: Prioritize `audioPath` over `audioData` so local files stream natively instead of decoding giant data URLs.
2. **Fix Video Audio Extraction in `electron/main.cjs`**:
   - Use `.webm` extension for extracted audio (since it is a WebM audio track), or transcode cleanly.
   - Delegate save to `storageManager.saveSounds(updatedSounds, true)`.

### Phase 4: UX & Multi-Monitor Polish (Bugs #8, #9, #10)
1. **Add `windowsHide: true` to All `yt-dlp` Spawns**:
   - Ensure all `spawn` and `execFile` calls for `yt-dlp` in `electron/main.cjs` have `windowsHide: true`.
2. **Active Monitor Centering for In-Game Overlay in `electron/main.cjs`**:
   - In `showOverlayWindow()`: Query `screen.getDisplayNearestPoint(screen.getCursorScreenPoint())` and center `overlayWindow` on the active display's bounds.
3. **Dynamic Hotkey Re-Registration in `src/App.tsx`**:
   - When `sounds-updated` IPC arrives, iterate over `newSounds` and register any sound hotkeys dynamically.
