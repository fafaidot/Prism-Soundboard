# Prism Soundboard 🎵

A flagship Windows 11 Fluent Design & Microsoft Store-inspired soundboard application featuring **live microphone pass-through**, **global game hotkeys**, **in-app YouTube search & instant downloading**, and an **advanced reproduction control panel** matching professional desktop soundboard standards.

Built with **Electron**, **React 19**, **Tailwind CSS v4**, **TypeScript**, and native Windows APIs following the specifications in [`DESIGN.md`](../Project2/DESIGN.md).

---

## 🎙️ How the Microphone Engine Works

```
[Real Physical Microphone] ──► [Mic Gain / Voice Mute] ──┐
                                                        ├──► [Prism Virtual Mic / Cable] ──► Discord / Games
[Triggered Soundboard Sound] ──► [Sound Gain] ───────────┘
         │
         └───────────────────────────────────────────────► [Headphones / Speakers] (Personal Monitor)
```

1. **Live Mic Pass-Through**: The app captures your real physical microphone and streams your talking voice into your virtual microphone in real-time.
2. **Audio Mixing**: When you trigger a soundboard clip, the sound is mixed seamlessly with your voice into the virtual microphone so friends and teammates in Discord and games hear both your voice and your sound clips!
3. **Mute Voice Option**: When a sound has `Mute Voice` enabled in Reproduction Options, your talking voice is temporarily muted for the duration of that sound to prevent echo or voice bleed!
4. **Hear Myself Toggle**: Optionally listen to your own voice through your headphones.
5. **Live Mic Activity Meter**: Real-time visual audio level bar in Settings to confirm your microphone is picking up sound.

---

## ✨ Key Features

### 1. In-App YouTube Search & Downloader
* **Zero Browser Needed**: Search YouTube songs, sound effects, and memes directly within the application.
* **Instant Audio Preview**: Listen to streams in real-time inside the search modal before downloading.
* **1-Click Quick Download**: Extracts audio at high speed using the embedded standalone `yt-dlp` engine.
* **Offline Resilience**: Automatically saves audio files locally in `%APPDATA%/Prism Soundboard/audio_library` and caches artwork thumbnails as Base64 strings.
* **Visual Waveform Trimmer**: Built-in editor to crop custom start and end timestamps, adjust gain, and set fades.

### 2. Dedicated Reproduction Control Panel (Matches Inspector Design)
* **5 Reproduction Modes**:
  1. **Play and Overlap**: Triggers multiple sound instances simultaneously without cutting off prior audio.
  2. **Play and Pause**: Clicking or pressing hotkey toggles between pause and resume.
  3. **Play and Stop**: Clicking or pressing hotkey stops the audio immediately.
  4. **Play and Restart**: Re-triggering resets the playback cursor to the beginning (or trim start).
  5. **Push to Loop**: Continuous loop playback mode.
* **4 Reproduction Options**:
  * `[x] Stop Other Sounds`: Automatically halts any active sound before starting the current sound.
  * `[ ] Mute Other Sounds`: Silences other playing sounds while the selected clip is active.
  * `[ ] Mute Voice`: Mutes your physical mic while soundboard plays to prevent microphone feedback or echo.
  * `[ ] Loop`: Automatically replays the sound upon reaching the end.
* **Creative Playback Controls**: Real-time playback speed adjustments from `0.5x` (slow motion) to `2.0x` (speed up).

### 3. Global Hotkeys & Gaming Ergonomics
* **Full-Screen Game Support**: Hotkeys work globally in the background even when running full-screen games.
* **Interactive Hotkey Recorder**: Click any sound tile's hotkey button and press any combination (Numpad `0`-`9`, `F1`-`F24`, `Ctrl`, `Alt`, `Shift`, `Space`, etc.) to bind instantly.
* **Global Panic Key**: A customizable instant emergency stop key (default `Escape`) to kill all audio instantly.
* **System Tray Integration**: Minimizes cleanly to the Windows System Tray with a right-click tray context menu (`Open`, `Stop All Sounds`, `Exit`).

### 4. Windows 11 Fluent Design Architecture
* **Frameless Mica / Acrylic Shell**: 32px custom draggable title bar with native Windows minimize, maximize, and close controls.
* **1:1 Square Ambient Glow Tiles**: Responsive auto-filling grid with enlarged, blurred ambient color backdrops derived from artwork thumbnails.
* **6 Dynamic Windows 11 Accent Colors**: Choose between Electric Cyan, Windows Blue, Xbox Green, Neon Purple, Sunset Amber, and Crimson Red in Settings.
* **Destructive Action Safety**: Confirmation modal prior to removing sounds from the soundboard, explicitly clarifying that disk audio files are never deleted.

---

## 🚀 Getting Started

### Development Mode
```powershell
npm run dev
```

### Production Mode
```powershell
npm run build
npm start
```

---

## 🎧 Setup Guide for Discord & Games (Virtual Microphone)

1. Open **Prism Soundboard** and click the **Settings (Gear icon)** in the top right.
2. In **Microphone & Audio Routing**:
   * **1. Physical Microphone**: Select your real mic (e.g. `Headset Microphone`). Confirm the live green **Mic Meter** moves when you speak!
   * **2. Virtual Microphone Device**: Select `CABLE Input` (or `Prism Virtual Microphone`). The app will auto-detect and select it for you!
   * **3. Headphones / Speakers**: Select your headphones for monitoring.
3. Open **Discord** (or in-game settings):
   * Go to **Settings → Voice & Video**.
   * Set **Input Device** to: **Microphone (CABLE Output / Prism Virtual Microphone)**.
   * Set **Output Device** to: Your headphones.
4. Now you can speak normally, and whenever you trigger soundboard sounds or hotkeys, both your voice and your sound effects will be broadcast to Discord and games!
