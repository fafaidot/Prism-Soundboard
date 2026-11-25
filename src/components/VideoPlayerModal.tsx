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

  const [isTrimming, setIsTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(clip.duration || 15);
  const [isSavingTrim, setIsSavingTrim] = useState(false);

  const accent = accentColor || 'var(--accent-color)';

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
      className={`fixed inset-0 z-[100] flex items-center justify-center select-none ${
        isFullscreen ? 'p-0 bg-black' : 'p-6 frosted-backdrop bg-black/40 animate-in fade-in duration-150'
      }`}
    >
      <div
        ref={containerRef}
        onMouseMove={handlePointerActivity}
        className={`relative w-full flex flex-col shadow-2xl transition-all duration-150 ${
          isFullscreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none border-none p-0 m-0 bg-black'
            : 'max-w-5xl frosted-modal bg-[#0e1219]/45 backdrop-blur-2xl border border-white/[0.14] rounded-3xl overflow-hidden max-h-[92vh] shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)]'
        }`}
      >
        {/* Top Header Bar */}
        <div
          className={`transition-opacity duration-200 z-30 flex items-center justify-between text-white ${
            isFullscreen
              ? `absolute top-0 left-0 right-0 h-14 px-6 bg-gradient-to-b from-black/90 to-transparent ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : 'h-16 px-6 frosted-modal-chrome border-b border-white/[0.08] relative z-20'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[13.5px] text-white truncate max-w-md tracking-tight">
              {clip.title}
            </span>
            <span className="text-[11.5px] font-mono text-slate-400 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onExtractToSoundboard}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white text-[11px] font-medium border border-white/[0.08] transition-colors cursor-pointer"
            >
              <Music size={12} className="text-accent" />
              <span>Extract audio</span>
            </button>

            <button
              type="button"
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white text-[11px] font-medium border border-white/[0.08] transition-colors cursor-pointer"
            >
              <FolderOpen size={12} className="text-accent" />
              <span>Open folder</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsTrimming(!isTrimming);
                if (!isTrimming) {
                  setTrimStart(0);
                  setTrimEnd(duration);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                isTrimming
                  ? 'bg-accent/20 border-accent/60 text-accent'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border-white/[0.08]'
              }`}
            >
              <Scissors size={12} />
              <span>Trim</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer ml-1"
            >
              <X size={14} />
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

          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-white shadow-2xl">
                <Play size={22} className="ml-1 fill-white" />
              </div>
            </div>
          )}
        </div>

        {/* Trimming Bar */}
        {isTrimming && (
          <div className="p-3.5 frosted-modal-chrome bg-white/[0.03] border-t border-white/[0.08] space-y-2 z-30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white font-medium flex items-center gap-1.5">
                <Scissors size={13} className="text-accent" />
                <span>Video trimming range</span>
              </span>
              <span className="text-accent font-mono font-medium tabular-nums">
                {formatTime(trimStart)} – {formatTime(trimEnd)} ({(trimEnd - trimStart).toFixed(1)}s)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <div className="grid grid-cols-2 gap-2">
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white font-medium text-[11px] border border-white/[0.08] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Overwrite
                </button>
                <button
                  type="button"
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(true)}
                  className="px-3 py-1.5 rounded-lg font-medium text-[11px] text-slate-950 bg-accent hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  Save as new
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Scrubber & Playback Controls Bar */}
        <div
          className={`transition-opacity duration-200 z-30 flex flex-col gap-2 ${
            isFullscreen
              ? `absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/95 to-transparent ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : 'p-3.5 frosted-modal-chrome bg-white/[0.025] border-t border-white/[0.08]'
          }`}
        >
          {/* Progress Slider */}
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={handleSeek}
              style={{ accentColor: accent }}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            {/* Left Controls: Play, Time, Volume */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlayPause}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5 fill-current" />}
              </button>

              <div className="flex items-center gap-1 font-mono text-[11px] font-medium text-white tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 pl-3 border-l border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    if (videoRef.current) videoRef.current.muted = newMuted;
                  }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
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
                  className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Right Controls: Fit/Fill Toggle & Fullscreen */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFillMode(!isFillMode)}
                title={isFillMode ? 'Switch to fit' : 'Switch to fill'}
                className={`px-2 h-7 rounded-md border flex items-center justify-center text-[10.5px] font-medium transition-colors cursor-pointer ${
                  isFillMode
                    ? 'bg-accent/20 border-accent/60 text-accent'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
              >
                <span>{isFillMode ? 'Fill' : 'Fit'}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                className="w-7 h-7 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
