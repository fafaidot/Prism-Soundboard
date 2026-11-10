# Prism Soundboard: Complete System Architecture & Tauri + Rust Migration Specification

> **Target Audience:** Autonomous AI coding agents, systems software engineers, and audio developers rebuilding this soundboard application in **Tauri v2 + Rust** (backend) + **React / Vite / TypeScript** (frontend).
>
> **Document Purpose:** This document provides an exhaustive, line-by-line and system-by-system architectural breakdown of the Prism Soundboard. It details every single data model, audio graph connection, low-level Win32 hook, background buffer, file persistence mechanism, IPC protocol, and UI interaction — along with exact Rust crate mappings and architectural blueprints.

---

## Table of Contents
1. [Executive Summary & Migration Blueprint](#1-executive-summary--migration-blueprint)
2. [Complete Data Schemas & State Persistence](#2-complete-data-schemas--state-persistence)
3. [Backup & Restore Engine (.prism Package Format)](#3-backup--restore-engine-prism-package-format)
4. [Audio Engine & Dual-Sink Voice Mixer](#4-audio-engine--dual-sink-voice-mixer)
5. [Instant Replay Buffer & Screen Audio Recording](#5-instant-replay-buffer--screen-audio-recording)
6. [Low-Level Global Keyboard Hook & Gaming Anti-Repeat](#6-low-level-global-keyboard-hook--gaming-anti-repeat)
7. [YouTube Downloader, Search & Live Stream Scraper](#7-youtube-downloader-search--live-stream-scraper)
8. [Multi-Window In-Game Overlay (HUD)](#8-multi-window-in-game-overlay-hud)
9. [Audio Trimmer & Waveform Engine](#9-audio-trimmer--waveform-engine)
10. [Hardware Driver & Windows CoreAudio System Helpers](#10-hardware-driver--windows-coreaudio-system-helpers)
11. [Recommended Rust Crate Stack & Tauri v2 Architecture](#11-recommended-rust-crate-stack--tauri-v2-architecture)
12. [Step-by-Step AI Agent Migration Checklist](#12-step-by-step-ai-agent-migration-checklist)

---

## 1. Executive Summary & Migration Blueprint

### 1.1 Existing Stack (Electron + Node.js + C# Subprocess + Web Audio API)
* **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React icons.
* **Backend:** Electron Main Process (`main.cjs`), Preload Bridge (`preload.cjs`).
* **Audio Routing:** Web Audio API running inside Chromium's audio renderer process (`AudioContext`, `MediaStreamAudioSourceNode`, `AudioWorkletNode`).
* **Hardware Hooks:** Standalone compiled C# CLI (`GlobalKeyHook.exe`) spawned as a background child process communicating over stdin/stdout.
* **YouTube/Scraping:** Bundled `yt-dlp.exe` spawned via child process with JSON stdout streams.
* **Weaknesses:** High memory footprint (300MB - 500MB), Chromium-level loopback audio capture requires screen capture permission hooks, process overhead between Node.js and C#.

### 1.2 Target Stack (Tauri v2 + Rust + React / TypeScript)
* **Frontend:** React 18 / 19, TypeScript, Tailwind CSS (can reuse the existing UI components with minimal changes to IPC calls).
* **Backend:** Native Rust binary utilizing Tauri v2 framework.
* **Audio Core:** Native Windows WASAPI / CoreAudio via `cpal`, `symphonia` (audio decoding), and `hound` (WAV generation).
* **Hotkeys:** Native Win32 Low-Level Keyboard Hook (`SetWindowsHookExW`) running on a dedicated OS thread.
* **Screen Audio Replay:** Direct WASAPI Loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK`) with zero GPU overhead, zero screen recording prompts, and true lossless capture.
* **Benefits:** 15MB - 35MB RAM footprint (10x reduction), microsecond hotkey response time, zero external C# executable dependencies, rock-solid audio stability even during heavy 3D gaming.

---

## 2. Complete Data Schemas & State Persistence

### 2.1 File Storage Locations (Windows)
The soundboard stores all persistent user data in the Windows AppData directory:
* Path: `%APPDATA%\Prism Soundboard\` (e.g. `C:\Users\<User>\AppData\Roaming\Prism Soundboard\`)
* Core Files:
  1. `soundboard_sounds.json` — The master list of all active sound items.
  2. `deleted_sounds.json` — Soft-deleted sounds archive (Recycle Bin / Restore capability).
  3. `soundboard_settings.json` — Audio routing device IDs, volumes, hotkeys, theme preferences.
  4. `audio_library/` — Directory containing all local audio binaries (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`).
  5. `deleted/` — Directory holding the audio files of soft-deleted sounds.

### 2.2 Data Models (`src/types.ts`)

#### `SoundItem` Schema
```typescript
export type ReproductionMode = 'overlap' | 'pause' | 'stop' | 'restart' | 'push_loop';

export interface ReproductionOptions {
  stopOtherSounds: boolean;  // Immediately stop all other playing sounds
  muteOtherSounds: boolean;  // Duck / mute background sounds
  muteVoice: boolean;        // Mute physical microphone into Discord while sound is playing
  loop: boolean;             // Loop sound indefinitely until stopped
}

export interface SoundItem {
  id: string;                        // Unique ID, e.g. "sound_1730000000000" or "yt_1730000000000"
  title: string;                     // Sound card display name
  author: string;                    // Source / Creator / Artist (e.g. "YouTube", "HyperX Mic", "User")
  audioPath: string;                 // Local absolute file path (e.g. "C:\\...\\audio_library\\sound.mp3")
  audioData?: string;                // Base64 data URI (fallback / immediate memory cache)
  thumbnail: string;                 // Base64 image data or URL (e.g. "data:image/jpeg;base64,...")
  duration: number;                  // Duration in seconds (e.g. 14.52)
  hotkey: string;                    // Assigned global hotkey string (e.g. "Ctrl+Shift+1", "Num5", "F4")
  volume: number;                    // Per-sound gain: 0 to 200 (100 = unity 100%, 200 = 2x boost)
  reproductionMode: ReproductionMode;// Playback behavior
  reproductionOptions: ReproductionOptions;
  playCount: number;                 // Total times played (incremented on each play)
  isFavorite: boolean;               // Pinned to favorites filter
  category?: string;                 // Optional category tag
  source?: 'youtube' | 'local' | 'clip';
  deletedAt?: number;                // Timestamp when moved to recycle bin
  trimStart?: number;                // Start offset in seconds (e.g. 1.25)
  trimEnd?: number;                  // End cutoff in seconds (e.g. 5.60)
  pitch?: number;                    // Pitch shift multiplier (1.0 = normal)
  speed?: number;                    // Playback speed multiplier: 0.25 to 2.0 (1.0 = normal)
  dateAdded: number;                 // Unix timestamp in milliseconds
}
```

#### `AudioSettings` Schema
```typescript
export interface AudioSettings {
  inputDeviceId: string;         // Hardware ID of real physical mic (e.g. HyperX QuadCast)
  primaryDeviceId: string;       // Hardware ID of headphones/speakers (personal monitor)
  secondaryDeviceId: string;     // Hardware ID of Virtual CABLE Input or Voicemod
  isSecondaryEnabled: boolean;   // Enable output to Virtual CABLE
  isMicPassThroughEnabled: boolean; // Route live mic into Virtual CABLE for Discord
  hearMyself: boolean;           // Route live mic into headphones for sidetone monitoring
  masterSpeakerVolume: number;   // 0 - 100: Master volume for your own headphones
  masterMicVolume: number;       // 0 - 100: Master volume for soundboard sounds sent to Discord
  micInputVolume: number;        // 0 - 200: Digital preamp gain for your physical voice
  isNoiseGateEnabled?: boolean;  // Enable real-time background noise gating
  noiseGateThreshold?: number;   // Noise gate threshold in dB (e.g. -39 dB)
  panicHotkey: string;           // Panic stop hotkey (Default: "Escape")
  repeatLastHotkey?: string;     // Replay last sound hotkey (Default: "F7")
  overlayHotkey?: string;        // Toggle In-Game HUD overlay hotkey (Default: "F8")
  recordHotkey?: string;         // Quick Instant Replay clip hotkey (Default: "F9")
  recordDuration?: number;       // Buffer duration to clip in seconds: 3, 5, 10, 15, or 30
  recordSource?: 'all' | 'screen' | 'mic'; // 'all' = game+voice, 'screen' = game only, 'mic' = voice only
  theme: string;                 // 'cyber-violet' | 'neon-emerald' | 'electric-cyan' | 'crimson-noir' | 'solar-gold' | 'titanium-slate' | 'dark'
  accentColor: string;           // Hex color (e.g. "#00a4ef", "#8b5cf6")
  minimizeToTray: boolean;       // Hide to system tray instead of closing on 'X'
  startOnBoot?: boolean;         // Windows registry run key for startup
  startInTray?: boolean;         // Start hidden in tray on boot
  sortBy?: 'custom' | 'newest' | 'oldest' | 'alphabetical' | 'most_played' | 'duration';
  activeFilter?: 'all' | 'clips' | 'youtube' | 'favorites';
}
```

### 2.3 Soft Delete & Recycle Bin Lifecycle
1. **Move to Deleted (`move-to-deleted`):**
   - Moves the physical audio file from `audio_library/` to `deleted/`.
   - Stamps `deletedAt = Date.now()` on the `SoundItem`.
   - Removes item from `soundboard_sounds.json` and prepends to `deleted_sounds.json`.
2. **Restore Deleted Sound (`restore-deleted-sound`):**
   - Locates item in `deleted_sounds.json`.
   - Moves the audio file back from `deleted/` to `audio_library/`.
   - Removes `deletedAt` property.
   - Saves item back into `soundboard_sounds.json` and removes from `deleted_sounds.json`.
3. **Permanently Delete (`permanently-delete-sound`):**
   - Unlinks / deletes the physical audio file from disk (`deleted/`).
   - Removes entry permanently from `deleted_sounds.json`.

---

## 3. Backup & Restore Engine (.prism Package Format)

Prism uses a self-contained archive format with the extension `.prism`. It is a standard PKZip archive containing:
```
my-soundboard-backup.prism (ZIP Archive)
│
├── manifest.json
└── audio/
    ├── clip_1730001000.wav
    ├── yt_1730002000.mp3
    └── custom_sound.wav
```

### 3.1 `manifest.json` Structure
```json
{
  "prismVersion": "1.3.7",
  "exportedAt": "2026-11-09T22:00:00.000Z",
  "sounds": [
    {
      "id": "sound_1",
      "title": "Airhorn",
      "author": "Local",
      "audioPath": "audio/airhorn.mp3",
      "thumbnail": "data:image/png;base64,...",
      "duration": 2.4,
      "hotkey": "Num1",
      "volume": 100,
      "reproductionMode": "stop",
      "reproductionOptions": {
        "stopOtherSounds": true,
        "muteOtherSounds": false,
        "muteVoice": false,
        "loop": false
      },
      "playCount": 12,
      "isFavorite": true,
      "dateAdded": 1730000000000
    }
  ],
  "settings": { ...AudioSettings... }
}
```

### 3.2 Backup Import Logic
1. User selects `.prism` file via native dialog.
2. The engine parses `manifest.json` from the ZIP.
3. It iterates over all entries inside the `audio/` directory of the archive and extracts them into the local `%APPDATA%\Prism Soundboard\audio_library\` folder.
4. It resolves all relative `audio/<filename>` paths in `sounds` to absolute paths on the user's local filesystem:
   `audioPath = Path.Combine(AUDIO_DIR, Path.GetFileName(item.audioPath))`.
5. Atomic disk writes update `soundboard_sounds.json` and `soundboard_settings.json`.
6. Backward compatibility: If the user selects a legacy `.json` file, it reads the JSON directly without extracting audio files.

---

## 4. Audio Engine & Dual-Sink Voice Mixer

The audio engine (`src/services/audioEngine.ts`) is the heartbeat of Prism. It handles simultaneous dual-device output, real-time noise gating, microphone passthrough, and zero-latency audio playback.

```
                                      ┌────────────────────────────────────────────────────────┐
                                      │ PHYSICAL MICROPHONE (HyperX, USB, Headset)             │
                                      └──────────────────────────┬─────────────────────────────┘
                                                                 │
                                                                 ▼
                                                  ┌─────────────────────────────┐
                                                  │ Real-Time Noise Gate Gain   │ <── AnalyserNode (-39 dB threshold)
                                                  └──────────────┬──────────────┘
                                                                 │
                                                                 ▼
                                                  ┌─────────────────────────────┐
                                                  │ Mic Master Gain & Preamp    │ (0% - 200%)
                                                  └──────┬───────────────┬──────┘
                                                         │               │
                                     [hearMyself: true]  │               │ [isMicPassThroughEnabled: true]
                                                         ▼               ▼
                                              ┌──────────────────┐  ┌───────────────────────────┐
                                              │ Headphones Gain  │  │ Voice-To-Cable Gain       │
                                              └─────────┬────────┘  └─────────────┬─────────────┘
                                                        │                         │
┌─────────────────────────────┐                         │                         │
│ SOUNDBOARD CLIP (MP3 / WAV) │                         │                         │
└──────────────┬──────────────┘                         │                         │
               │                                        │                         │
               ▼                                        │                         │
┌─────────────────────────────┐                         │                         │
│ Individual Sound Gain       │ (0% - 200%)             │                         │
└──────────────┬──────────────┘                         │                         │
               │                                        │                         │
       ┌───────┴────────────────┐                       │                         │
       ▼                        ▼                       │                         │
┌──────────────┐         ┌──────────────┐               │                         │
│ Headphones   │         │ Cable Gain   │               │                         │
│ Gain (0-100%)│         │ (0 - 100%)   │               │                         │
└──────┬───────┘         └──────┬───────┘               │                         │
       │                        │                       │                         │
       ▼                        ▼                       │                         │
┌───────────────────────────────────────┐               │                         │
│ DESTINATION 1: PERSONAL HEADPHONES    │ ◄─────────────┘                         │
│ (Realtek, HyperX, USB DAC)            │                                         │
└───────────────────────────────────────┘                                         │
                                                                                  │
┌─────────────────────────────────────────────────────────────────────────────────┴─────┐
│ DESTINATION 2: VIRTUAL CABLE / VIRTUAL MIC                                            │
│ (VB-Audio CABLE Input / Voicemod Virtual Audio) ──► DISCORD, TEAMSPEAK, CS2, VALORANT │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Dual Hardware Routing Architecture
* **Sink 1 (Personal Monitor):** ctx destination locked to your physical headphones device ID. Plays soundboard clips and (if `hearMyself` is checked) your own voice.
* **Sink 2 (Virtual Cable):** Dedicated audio destination locked to `CABLE Input (VB-Audio Virtual Cable)`. Discord and games use `CABLE Output` as their microphone input. Both your physical voice and soundboard audio mix into this sink.
* **Anti-Headphone Leak Protection:** Virtual Cable streams are never routed to `default` audio endpoint. If the sink ID does not match the CABLE Input device ID, the stream is suspended immediately to prevent sounds echoing back into your ears.

### 4.2 Real-Time Noise Gate
* Measures raw physical microphone root-mean-square (RMS) level continuously:
  $$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} x[i]^2}$$
  $$\text{dB} = 20 \log_{10}(\text{RMS})$$
* **Threshold:** Configurable, defaults to `-39 dB`.
* **State Envelope:**
  * **Gate Open (signal $\ge$ threshold):** Fast attack time constant = $15\text{ ms}$.
  * **Gate Closed (signal $<$ threshold):** Smooth natural decay time constant = $180\text{ ms}$ (prevents words clipping at sentence ends).
* **Dual Analyser Setup:**
  * `rawMicAnalyserNode`: Measures raw physical microphone input for threshold comparison and noise calibration.
  * `postGateAnalyserNode`: Measures post-gate signal so UI VU meters and oscilloscopes drop to zero when the noise gate is closed.

### 4.3 Reproduction Modes (`reproductionMode`)
1. `overlap`: Every press spawns an independent playback instance. Multiple copies play simultaneously (useful for machine gun sounds, applause).
2. `pause`: Toggles between pause and resume.
3. `stop`: If playing, immediately stops and resets to `trimStart`. If stopped, starts playback.
4. `restart`: If playing, immediately seeks back to `trimStart` without creating new instances.
5. `push_loop`: Loops audio continuously while active; stops immediately upon toggle or key release.

### 4.4 Voice Mute on Sound Playback (`muteVoice`)
When a sound card has `reproductionOptions.muteVoice = true`:
* While that sound is actively playing, `voiceToCableGain` is ramped to `0.0`.
* Your microphone is muted in Discord / game voice chat so only the soundboard audio plays cleanly.
* When all such sounds end or are stopped, `voiceToCableGain` automatically restores to unity gain.

---

## 5. Instant Replay Buffer & Screen Audio Recording

Prism includes a built-in "Instant Replay" audio clipping engine (analogous to Nvidia ShadowPlay, but for audio). It keeps a rolling ring buffer of the last 3 to 30 seconds of audio in memory.

### 5.1 The Rolling Circular Buffer
* **Buffer Size:** Interleaved stereo Float32 array:
  $$\text{Length} = \text{SampleRate (48000)} \times \text{MaxSeconds (15)} \times 2 \text{ channels} = 1,440,000 \text{ floats}$$
* **Continuous AudioWorklet:** Runs on the real-time audio thread. With every incoming buffer frame (128 samples), it writes stereo samples into the circular buffer and advances `writeIndex`.
* **Audio Sources:**
  1. `screen`: Captures Windows system / game audio via WASAPI loopback.
  2. `mic`: Captures physical microphone.
  3. `all`: Mixes game loopback + physical microphone (with $0.85$ gain each to prevent clipping).

### 5.2 Slicing & WAV Normalization
When the user presses the clip hotkey (`F9`) or clicks "Clip Replay":
1. The engine requests the last $N$ seconds from the buffer.
2. It unwraps the circular buffer into a contiguous linear `Float32Array`.
3. **Peak Normalization:**
   - Scans for maximum peak: $M = \max(|x[i]|)$.
   - Calculates boost factor: $G = \min(3.5, \frac{0.96}{M})$ targeting $-0.3\text{ dB}$.
   - Scales samples by $G$ and soft-clamps to $[-1.0, 1.0]$.
4. **WAV Encoding:** Generates standard 16-bit PCM Stereo WAV binary header (44 bytes RIFF chunk + data chunk).
5. **Persistence:** Saves to `%APPDATA%\Prism Soundboard\audio_library\clip_<timestamp>.wav` and automatically inserts a new `SoundItem` with title `"Clipped Replay HH:MM"`.

---

## 6. Low-Level Global Keyboard Hook & Gaming Anti-Repeat

To intercept keystrokes inside fullscreen exclusive games (Valorant, CS2, Apex Legends, Call of Duty), standard window event listeners do not work. Prism uses a Win32 Low-Level Keyboard Hook (`WH_KEYBOARD_LL`).

### 6.1 C# Hook Architecture (`scripts/GlobalKeyHook.cs`)
* Uses Win32 API `SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(...), 0)`.
* Listens for `WM_KEYDOWN`, `WM_KEYUP`, `WM_SYSKEYDOWN`, `WM_SYSKEYUP`.
* Distinguishes modifiers via `GetKeyState(VK_CONTROL)`, `GetKeyState(VK_MENU)` (Alt), and `GetKeyState(VK_SHIFT)`.
* Emits two clean messages over stdout:
  * `KEY_DOWN:<NormalizedKey>`
  * `KEY_UP:<NormalizedKey>`
* Key normalization maps:
  * Letters (`A`-`Z`), Numbers (`0`-`9`), Function keys (`F1`-`F24`).
  * Numpad (`Num0`-`Num9`, `NumAdd`, `NumSub`, `NumMult`, `NumDiv`, `NumDec`).
  * Punctuation (`;`, `=`, `,`, `-`, `.`, `/`, `` ` ``, `[`, `\`, `]`, `'`).
  * Navigation (`Space`, `Enter`, `Escape`, `Backspace`, `Tab`, `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, `Left`, `Up`, `Right`, `Down`).

### 6.2 Gaming Anti-Repeat Debounce Logic
* **Problem:** Holding down a key in Windows causes the OS keyboard driver to fire repetitive `WM_KEYDOWN` events at 30Hz. If a sound is set to `restart` or `overlap`, holding the key produces stuttering or audio crashing.
* **Solution:**
  * When `KEY_DOWN` arrives, check `currentlyHeldKeys.has(key)`.
  * If the key is already in the set, **discard the event immediately**.
  * If not, add to `currentlyHeldKeys` and trigger the sound.
  * When `KEY_UP` arrives, remove key from `currentlyHeldKeys`.
  * **Result:** Holding down a key plays the sound once smoothly. Tapping the key rapidly (spamming) fires on every tap without delay.

### 6.3 Dedicated Reserved System Hotkeys
* **Panic Hotkey (Default `Escape`):** Immediately cuts all active sounds.
* **Repeat Last Hotkey (Default `F7`):** Replays the most recently played sound item.
* **Overlay HUD Hotkey (Default `F8`):** Toggles the transparent always-on-top in-game mini overlay.
* **Quick Clip Hotkey (Default `F9`):** Grabs the last $N$ seconds of system/mic audio.

---

## 7. YouTube Downloader, Search & Live Stream Scraper

Prism allows users to search YouTube directly inside the app, preview songs with zero delay, and download audio into the soundboard library.

### 7.1 Search & Metadata Scraping
* Command: `yt-dlp.exe ytsearch10:<query> --flat-playlist --dump-json --no-playlist --ignore-errors`
* Parses line-delimited JSON objects extracting:
  * `id`: YouTube video ID.
  * `title`: Video title.
  * `channel`: Channel / uploader name.
  * `duration`: Formatted mm:ss and duration in seconds.
  * `thumbnail`: Best available thumbnail URL.
  * `url`: Direct video URL (`https://www.youtube.com/watch?v=<id>`).

### 7.2 Trending Music Hits
* Scrapes YouTube's official Top Songs chart playlist:
  `https://www.youtube.com/playlist?list=PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU`
* Limits extraction to top 15 tracks.
* Fallback query: `ytsearch12:top music hits official audio`.

### 7.3 Instant Audio Preview
* Command: `yt-dlp.exe -g -f ba/b --no-playlist <url>`
* Returns the raw Google Video HTTPS audio stream URL.
* The frontend streams this URL instantly in an `<audio>` tag without downloading any files to disk.

### 7.4 Downloading Audio
* Command:
  `yt-dlp.exe -f ba/b --no-playlist -o "%APPDATA%\Prism Soundboard\audio_library\yt_<timestamp>.%(ext)s" --no-simulate --print-json <url>`
* Downloads best audio stream (usually Opus in WebM or AAC in M4A).
* Emits completion JSON with exact file path, duration, and thumbnail.
* Backend reads the binary file, creates a base64 data URI cache, and persists a new `SoundItem`.

---

## 8. Multi-Window In-Game Overlay (HUD)

Prism features a sleek, transparent, always-on-top HUD (`src/components/InGameOverlayModal.tsx`) designed for access during gaming sessions without Alt-Tabbing.

### 8.1 Overlay Window Specifications
* **Size:** 1480x700 px, frameless, transparent background (`#00000000`).
* **Z-Order Level:** `screen-saver` (highest possible Win32 always-on-top level, sits above borderless games).
* **Taskbar:** `skipTaskbar: true`.
* **Zero-Latency Pre-Warming:** Created at app launch in hidden state (`show: false`). When toggled with `F8`, it appears instantly with zero render stutter.
* **Dismissal Behavior:**
  * Hides on window `blur` (clicking back into the game).
  * Hides when clicking outside the HUD pods (`onClick={onClose}`).
  * Hides when pressing `F8` again or the close button.

### 8.2 Inter-Window Synchronization Protocol
The audio hardware context lives exclusively in the main window. The overlay communicates with the main window using IPC:
* `sync-trigger-sound` (Overlay $\to$ Main): Triggers sound playback on hardware sinks.
* `sync-stop-all` (Overlay $\to$ Main): Panic stop.
* `sync-trigger-clip` (Overlay $\to$ Main): Triggers instant replay buffer save.
* `sync-active-sounds` (Main $\to$ Overlay): Synchronizes array of actively playing sound IDs (lights up card borders).
* `sync-paused-sounds` (Main $\to$ Overlay): Synchronizes paused states.
* `sync-progress-map` (Main $\to$ Overlay): Throttled 15fps map of `{ [soundId]: progressFloat }` for circular progress rings and scrubber bars.
* `sync-sound-volume-live` (Overlay $\leftrightarrow$ Main): Real-time volume slider updates while playing.
* `sync-sound-speed-live` (Overlay $\leftrightarrow$ Main): Real-time playback speed updates.

---

## 9. Audio Trimmer & Waveform Engine

The trimmer modal (`src/components/AudioTrimmerModal.tsx`) allows precision trimming of sound clips.

### 9.1 Peak Extraction Algorithm
1. Fetches audio binary into an `ArrayBuffer`.
2. Decodes via `AudioContext.decodeAudioData()`.
3. Splits channel 0 samples into 200 uniform blocks:
   $$\text{blockSize} = \lfloor \frac{\text{totalSamples}}{200} \rfloor$$
4. Computes peak absolute amplitude in each block:
   $$\text{peak}_i = \max_{j \in \text{block}_i} (|x[j]|)$$
5. Renders 200 SVG / Canvas waveform bars with active accent color for trimmed region and dimmed color for excluded regions.

### 9.2 Controls & Interactions
* Left draggable handle: Sets `trimStart`.
* Right draggable handle: Sets `trimEnd`.
* Center window drag: Shifts the entire trim region across the timeline without altering duration.
* Zoom in / out: Multiplies timeline scale (1x, 2x, 4x, 8x) with horizontal panning.
* Live preview: Audio plays strictly between `trimStart` and `trimEnd`, automatically looping or stopping at `trimEnd`.

---

## 10. Hardware Driver & Windows CoreAudio System Helpers

### 10.1 Silent VB-CABLE Driver Installer
* Prism bundles the official VB-Audio Virtual Cable installer in `driver/vbcable/VBCABLE_Setup_x64.exe`.
* Executed via elevated PowerShell:
  `Start-Process -FilePath "<path>\VBCABLE_Setup_x64.exe" -Verb RunAs`

### 10.2 Renaming Virtual Endpoint
To make device selection clear to users, Prism includes a PowerShell helper that sets the friendly registry name of the Virtual Cable capture endpoint to `"Prism Virtual Microphone"`:
* Path: `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture`
* Key: `{b3f8fa53-0004-438e-9002-0d4e698b45ab},6` = `"Prism Virtual Microphone"`

### 10.3 Default Physical Speaker Protection
When virtual audio drivers install, Windows often hijacks the default playback device to "CABLE Input", silencing user speakers. Prism automatically checks the registry and restores the default playback endpoint to the physical headset/speakers using COM interface `IPolicyConfig::SetDefaultEndpoint`.

---

## 11. Recommended Rust Crate Stack & Tauri v2 Architecture

When building this in Tauri + Rust, replace the Electron / Node / C# dependencies with the following battle-tested Rust crates:

| Subsystem | Existing Tech | Recommended Rust Crate | Purpose & Advantages |
| :--- | :--- | :--- | :--- |
| **Framework** | Electron 33 | `tauri` (v2.x) | Ultra-lightweight Webview container, cross-platform window management. |
| **Audio Core** | Web Audio API / Chromium | `cpal` + `windows` crate | Direct WASAPI low-latency hardware stream management (Stereo, 48kHz, shared or exclusive mode). |
| **Audio Decoding** | Web Audio `decodeAudioData` | `symphonia` | Pure Rust audio decoder supporting MP3, WAV, OGG/Vorbis, FLAC, and AAC/M4A. |
| **Audio Resampling** | HTMLAudioElement speed | `rubato` | Studio-grade real-time audio resampling for playback speed and pitch control. |
| **WAV Generation** | JS DataView manual RIFF | `hound` | Fast, zero-allocation WAV file encoding for instant replay clips. |
| **Ring Buffer** | AudioWorklet JS | `ringbuf` or `rtrb` | Lock-free, real-time-safe circular ring buffer for loopback replay recording. |
| **Global Hotkeys** | C# `GlobalKeyHook.exe` | `windows` (Win32 Hook) or `rdev` | Low-level hook thread (`SetWindowsHookExW`) running natively in Rust. |
| **Backup Zip** | `adm-zip` (Node.js) | `zip` | High-performance ZIP archive creation and extraction. |
| **Serialization** | `JSON.stringify` | `serde` + `serde_json` | Type-safe JSON serialization and deserialization. |
| **YouTube Downloader**| `yt-dlp.exe` child process | `rusty_ytdl` or Tauri Sidecar | Direct YouTube audio extraction or managed sidecar executable. |

### 11.1 Proposed Rust Backend Directory Structure (`src-tauri/`)
```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── main.rs                    # Application entry point, window setup, single-instance lock
    ├── audio/
    │   ├── mod.rs                 # Audio manager & state
    │   ├── mixer.rs               # Dual-sink mixer thread (Headphones + Virtual Cable)
    │   ├── decoder.rs             # Symphonia file decoder (MP3, WAV, FLAC, M4A)
    │   ├── noise_gate.rs          # Real-time RMS evaluation & fast attack / slow release envelope
    │   ├── replay_buffer.rs       # Lock-free ring buffer for screen audio replay
    │   └── wasapi_loopback.rs     # Direct Windows WASAPI loopback audio capturer
    ├── hotkeys/
    │   ├── mod.rs
    │   └── win32_hook.rs          # SetWindowsHookExW low-level keyboard listener & anti-repeat
    ├── persistence/
    │   ├── mod.rs
    │   ├── storage.rs             # JSON load/save for sounds, settings, deleted
    │   └── backup.rs              # .prism ZIP export and import engine
    ├── youtube/
    │   ├── mod.rs
    │   └── client.rs              # Search, trending playlists, and stream URL extraction
    └── commands.rs                # Tauri IPC #[tauri::command] handlers
```

---

## 12. Step-by-Step AI Agent Migration Checklist

Follow this precise execution sequence when instructing an AI agent to build the soundboard in the new Tauri workspace:

### Phase 1: Tauri Project Initialization & Core Data Types
- [ ] Initialize Tauri v2 project: `cargo create-tauri-app` (select React + TypeScript + Tailwind).
- [ ] Define Rust structs in `src-tauri/src/models.rs` matching `SoundItem`, `AudioSettings`, `ReproductionOptions`, and `ReproductionMode` with `#[derive(Serialize, Deserialize, Clone)]`.
- [ ] Implement file persistence: create `%APPDATA%\Prism Soundboard\` with `soundboard_sounds.json` and `soundboard_settings.json`.
- [ ] Implement soft-delete and restore handlers (`move_to_deleted`, `restore_sound`, `permanent_delete`).

### Phase 2: Native Win32 Hotkey Hook
- [ ] Create a dedicated OS thread in `src-tauri/src/hotkeys/win32_hook.rs`.
- [ ] Implement `SetWindowsHookExW(WH_KEYBOARD_LL, ...)`.
- [ ] Build key string formatter (`Ctrl+Shift+<Key>`, `Num<N>`).
- [ ] Implement `currently_held_keys: HashSet<String>` debounce logic to reject auto-repeat holding while allowing rapid spamming.
- [ ] Wire hotkeys to emit Tauri events to frontend or directly trigger the mixer.

### Phase 3: Dual-Sink Audio Mixer & Playback
- [ ] Enumerate hardware output devices using `cpal::traits::HostTrait::output_devices`.
- [ ] Open two simultaneous output audio streams:
  - Stream A: Primary physical monitor (Headphones).
  - Stream B: Secondary virtual device (VB-Audio CABLE Input).
- [ ] Build `Mixer`: maintains a list of `ActiveSound` cursors. On each audio buffer callback (48kHz stereo), sum sound samples into Stream A and Stream B scaled by master and individual volumes.
- [ ] Implement playback modes: `overlap`, `pause`, `stop`, `restart`, `push_loop`.
- [ ] Implement trimming offsets: seek start at `trim_start`, stop at `trim_end`.

### Phase 4: Microphone Passthrough & Noise Gate
- [ ] Open `cpal` input stream for physical hardware microphone.
- [ ] Build real-time Noise Gate: compute RMS power on incoming mic chunks. If below threshold (e.g. -39 dB), smooth gain to 0.0; otherwise ramp to 1.0.
- [ ] Route mic audio:
  - If `is_mic_passthrough_enabled`: pipe into Stream B (Virtual Cable).
  - If `hear_myself`: pipe into Stream A (Headphones).
  - If any active sound has `mute_voice = true`: temporarily zero out mic feed to Stream B.

### Phase 5: WASAPI Screen Audio Loopback & Instant Replay Buffer
- [ ] Initialize WASAPI Loopback on the default audio render device using `AUDCLNT_STREAMFLAGS_LOOPBACK`.
- [ ] Pipe loopback audio into a lock-free `ringbuf` storing 15 seconds of stereo Float32 samples at 48kHz.
- [ ] On `clip_replay` command: slice the last $N$ seconds, run peak normalization, encode 16-bit PCM WAV using `hound`, and save to `audio_library/clip_<timestamp>.wav`.

### Phase 6: YouTube Integration & Backup Package
- [ ] Implement YouTube search and stream resolver using `rusty_ytdl` or bundled `yt-dlp` sidecar.
- [ ] Implement `.prism` ZIP backup export and import using the `zip` crate.

### Phase 7: Multi-Window In-Game Overlay
- [ ] Configure `overlay` window in `tauri.conf.json`: transparent, frameless, `always_on_top: true`, `skip_taskbar: true`.
- [ ] Implement pre-warming: overlay starts hidden and toggles visibility via `overlayHotkey` (`F8`).
- [ ] Add blur listener to auto-hide overlay when user clicks back into their game.
- [ ] Wire up real-time playback progress sync via Tauri window events (`app_handle.emit_to("overlay", ...)`).
