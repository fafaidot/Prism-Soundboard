import React, { useRef, useState, useEffect } from 'react';
import { VideoClipItem } from '../types';
import {
  X,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Scissors,
  Music,
  FolderOpen,
} from 'lucide-react';

interface VideoPlayerModalProps {
  clip: VideoClipItem;
  accentColor: string;
  onClose: () => void;
  onExtractToSoundboard: () => void;
  onOpenFolder: () => void;
  onSaveTrimmedClip?: (startSec: number, endSec: number, saveAsNew: boolean) => Promise<void>;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  clip,
  accentColor,
  onClose,
  onExtractToSoundboard,
  onOpenFolder,
  onSaveTrimmedClip,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip.duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFillMode, setIsFillMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<any>(null);

  // Trimming Mode
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(clip.duration || 15);
  const [isSavingTrim, setIsSavingTrim] = useState(false);

  const accent = accentColor || 'var(--accent-color)';

  // Format mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePointerActivity = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFullscreen && isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        setShowControls(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isPlaying]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // If trimming, loop inside the trim boundaries
    if (isTrimming && cur >= trimEnd) {
      videoRef.current.currentTime = trimStart;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSaveTrim = async (saveAsNew: boolean) => {
    if (!onSaveTrimmedClip) return;
    setIsSavingTrim(true);
    try {
      await onSaveTrimmedClip(trimStart, trimEnd, saveAsNew);
      setIsTrimming(false);
    } catch (e) {
      console.error('Trim error:', e);
    } finally {
      setIsSavingTrim(false);
    }
  };

  return (
    <div
      onMouseMove={handlePointerActivity}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/95 select-none ${
        isFullscreen ? 'p-0' : 'p-6 backdrop-blur-xl animate-in fade-in duration-150'
      }`}
    >
      <div
        ref={containerRef}
        onMouseMove={handlePointerActivity}
        className={`relative w-full flex flex-col shadow-2xl transition-all duration-150 ${
          isFullscreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none border-none p-0 m-0 bg-black'
            : 'max-w-5xl bg-theme-surface border border-theme rounded-2xl overflow-hidden max-h-[92vh]'
        }`}
      >
        {/* Top Header Bar */}
        <div
          className={`transition-opacity duration-200 z-30 flex items-center justify-between text-white ${
            isFullscreen
              ? `absolute top-0 left-0 right-0 h-16 px-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : 'h-14 px-6 bg-theme-header border-b border-theme relative z-20'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-bold text-[14px] text-theme-primary truncate max-w-md tracking-wide">
              {clip.title}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-accent-soft border border-accent/30 font-mono font-bold text-accent">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExtractToSoundboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-theme-card hover:bg-theme-card-hover text-theme-primary text-[12px] font-bold border border-theme hover:border-accent/40 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Music size={13} style={{ color: accent }} />
              <span>Extract to Soundboard</span>
            </button>

            <button
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-theme-card hover:bg-theme-card-hover text-theme-primary text-[12px] font-bold border border-theme hover:border-accent/40 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <FolderOpen size={13} style={{ color: accent }} />
              <span>Open in Folder</span>
            </button>

            <button
              onClick={() => {
                setIsTrimming(!isTrimming);
                if (!isTrimming) {
                  setTrimStart(0);
                  setTrimEnd(duration);
                }
              }}
              style={isTrimming ? { backgroundColor: `${accent}25`, borderColor: accent, color: accent } : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-theme-card hover:bg-theme-card-hover text-theme-primary text-[12px] font-bold border border-theme hover:border-accent/40 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Scissors size={13} />
              <span>Trim</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-theme-muted hover:text-theme-primary hover:bg-white/5 transition-colors cursor-pointer ml-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video Canvas Element */}
        <div
          onClick={togglePlayPause}
          onDoubleClick={toggleFullscreen}
          className={`relative bg-black flex items-center justify-center cursor-pointer overflow-hidden ${
            isFullscreen ? 'absolute inset-0 w-full h-full z-10' : 'flex-1 min-h-[360px]'
          }`}
        >
          <video
            ref={videoRef}
            src={`file:///${clip.filePath.replace(/\\/g, '/')}`}
            autoPlay
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                setTrimEnd(videoRef.current.duration);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className={`transition-all duration-150 ${
              isFullscreen
                ? `w-full h-full max-h-none max-w-none ${isFillMode ? 'object-cover' : 'object-contain'}`
                : `w-full max-h-[64vh] ${isFillMode ? 'object-cover' : 'object-contain'}`
            }`}
          />

          {/* Central Play/Pause Flash Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl">
                <Play size={26} className="ml-1 fill-white" />
              </div>
            </div>
          )}
        </div>

        {/* Trimming Controls Pod (When Active) */}
        {isTrimming && (
          <div className="p-4 bg-theme-surface border-t border-theme space-y-3 animate-in fade-in duration-100 z-30">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-theme-primary font-bold flex items-center gap-1.5">
                <Scissors size={14} style={{ color: accent }} />
                <span>Video Trimming Range</span>
              </span>
              <span className="text-accent font-mono font-bold">
                {formatTime(trimStart)} - {formatTime(trimEnd)} (Length: {(trimEnd - trimStart).toFixed(1)}s)
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[11px] text-theme-muted">
                  <span>Start: {formatTime(trimStart)}</span>
                  <span>End: {formatTime(trimEnd)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={trimStart}
                    onChange={(e) => {
                      const v = Math.min(parseFloat(e.target.value), trimEnd - 0.5);
                      setTrimStart(v);
                      if (videoRef.current) videoRef.current.currentTime = v;
                    }}
                    style={{ accentColor: accent }}
                    className="w-full cursor-pointer"
                  />
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={trimEnd}
                    onChange={(e) => {
                      const v = Math.max(parseFloat(e.target.value), trimStart + 0.5);
                      setTrimEnd(v);
                      if (videoRef.current) videoRef.current.currentTime = v;
                    }}
                    style={{ accentColor: accent }}
                    className="w-full cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(false)}
                  className="px-3.5 py-2 rounded-xl bg-theme-card hover:bg-theme-card-hover text-theme-primary font-bold text-[11.5px] border border-theme transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save (Overwrite)
                </button>
                <button
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(true)}
                  style={{ backgroundColor: accent }}
                  className="px-4 py-2 rounded-xl font-bold text-[11.5px] text-black hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  Save as New Clip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Scrubber & Playback Controls Bar */}
        <div
          className={`transition-opacity duration-200 z-30 flex flex-col gap-2.5 ${
            isFullscreen
              ? `absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : 'p-4 bg-theme-header border-t border-theme'
          }`}
        >
          {/* Progress Slider */}
          <div className="relative flex items-center group">
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={handleSeek}
              style={{ accentColor: accent }}
              className="w-full h-1.5 bg-theme-card rounded-full appearance-none cursor-pointer focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            {/* Left Controls: Play, Time, Volume */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlayPause}
                className="w-9 h-9 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme flex items-center justify-center text-theme-primary transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-current" />}
              </button>

              <div className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-theme-primary">
                <span>{formatTime(currentTime)}</span>
                <span className="text-theme-muted">/</span>
                <span className="text-theme-muted">{formatTime(duration)}</span>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 pl-3 border-l border-theme">
                <button
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    if (videoRef.current) videoRef.current.muted = newMuted;
                  }}
                  className="text-theme-muted hover:text-theme-primary transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    setIsMuted(false);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = false;
                    }
                  }}
                  style={{ accentColor: accent }}
                  className="w-20 h-1 bg-theme-card rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Right Controls: Fit/Fill Toggle & Fullscreen */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFillMode(!isFillMode)}
                title={isFillMode ? 'Switch to Fit (Letterbox to keep aspect ratio)' : 'Switch to Fill (Edge-to-edge fill without black bars)'}
                className={`px-2.5 h-9 rounded-xl border flex items-center justify-center gap-1 transition-all cursor-pointer text-[11px] font-bold ${
                  isFillMode
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'bg-theme-card hover:bg-theme-card-hover border-theme text-theme-secondary hover:text-theme-primary'
                }`}
              >
                <span>{isFillMode ? 'Fill' : 'Fit'}</span>
              </button>

              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (Esc / F)' : 'Fullscreen (F)'}
                className="w-9 h-9 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme flex items-center justify-center text-theme-primary transition-colors cursor-pointer"
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
