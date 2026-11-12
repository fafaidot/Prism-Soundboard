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
  RotateCcw,
  Check,
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

  // Trimming Mode
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(clip.duration || 15);
  const [isSavingTrim, setIsSavingTrim] = useState(false);

  const accent = accentColor || 'var(--accent-color, #38bdf8)';

  // Format mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-150 p-6 select-none">
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl bg-[#0e1017] border border-[#232738] rounded-[20px] overflow-hidden flex flex-col shadow-[0_25px_70px_rgba(0,0,0,0.9)] max-h-[92vh]"
      >
        {/* Top Header Bar */}
        <div className="h-12 px-5 bg-[#12141d] border-b border-[#1f2333] flex items-center justify-between text-white z-20">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-[14px] text-white truncate max-w-md">
              {clip.title}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-[#9da5b7]">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExtractToSoundboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/5 hover:bg-white/10 text-white text-[12px] font-semibold border border-white/10 hover:border-white/30 transition-all cursor-pointer"
            >
              <Music size={13} style={{ color: accent }} />
              <span>Extract to Soundboard</span>
            </button>

            <button
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/5 hover:bg-white/10 text-white text-[12px] font-semibold border border-white/10 hover:border-white/30 transition-all cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/5 hover:bg-white/10 text-white text-[12px] font-semibold border border-white/10 transition-all cursor-pointer"
            >
              <Scissors size={13} />
              <span>Trim</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#8e95a5] hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video Canvas Element */}
        <div
          onClick={togglePlayPause}
          className="relative flex-1 bg-black flex items-center justify-center cursor-pointer min-h-[360px]"
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
            className="w-full max-h-[64vh] object-contain"
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
          <div className="p-4 bg-[#11131a] border-t border-[#1e2231] space-y-3 animate-in fade-in duration-100">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-white font-bold flex items-center gap-1.5">
                <Scissors size={14} style={{ color: accent }} />
                <span>Video Trimming Range</span>
              </span>
              <span className="text-[#38bdf8] font-mono font-bold">
                {formatTime(trimStart)} - {formatTime(trimEnd)} (Length: {(trimEnd - trimStart).toFixed(1)}s)
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[11px] text-[#7e8697]">
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
                    className="w-full accent-[#38bdf8] cursor-pointer"
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
                    className="w-full accent-[#38bdf8] cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(false)}
                  className="px-3.5 py-2 rounded-[8px] bg-white/10 hover:bg-white/20 text-white font-bold text-[11.5px] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save (Overwrite)
                </button>
                <button
                  disabled={isSavingTrim}
                  onClick={() => handleSaveTrim(true)}
                  style={{ backgroundColor: accent, color: '#000000' }}
                  className="px-4 py-2 rounded-[8px] font-bold text-[11.5px] hover:brightness-110 active:scale-98 transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  Save as New Clip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Scrubber & Playback Controls Bar */}
        <div className="p-4 bg-[#13151f] border-t border-[#1f2333] flex flex-col gap-2.5">
          {/* Progress Slider */}
          <div className="relative flex items-center group">
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.05"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-[#252a3b] rounded-full appearance-none cursor-pointer accent-[#38bdf8] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            {/* Left Controls: Play, Time, Volume */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlayPause}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-white" />}
              </button>

              <div className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-white">
                <span>{formatTime(currentTime)}</span>
                <span className="text-[#656d81]">/</span>
                <span className="text-[#8e97aa]">{formatTime(duration)}</span>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                <button
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    if (videoRef.current) videoRef.current.muted = newMuted;
                  }}
                  className="text-[#8e95a5] hover:text-white transition-colors cursor-pointer"
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
                  className="w-20 h-1 bg-[#252a3b] rounded-full appearance-none accent-[#38bdf8] cursor-pointer"
                />
              </div>
            </div>

            {/* Right Controls: Fullscreen */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white transition-colors cursor-pointer"
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
