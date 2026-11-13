import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Square,
  Scissors,
  RotateCcw,
  Repeat,
  Plus,
  Minus,
  Check,
  CopyPlus,
  Volume2,
} from 'lucide-react';
import { SoundItem } from '../types';

interface AudioTrimmerModalProps {
  sound: SoundItem | null;
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  onSaveTrim: (soundId: string, trimStart: number, trimEnd: number) => void;
  onSaveAsNewTrim?: (soundId: string, trimStart: number, trimEnd: number) => void;
}

const TOTAL_BARS = 120;

export const AudioTrimmerModal: React.FC<AudioTrimmerModalProps> = ({
  sound,
  isOpen,
  onClose,
  accentColor,
  onSaveTrim,
  onSaveAsNewTrim,
}) => {
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPlayingFull, setIsPlayingFull] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState<boolean>(true);
  const [dragMode, setDragMode] = useState<'start' | 'end' | 'window' | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const dragStartRef = useRef<{ clientX: number; initialStart: number; initialEnd: number }>({
    clientX: 0,
    initialStart: 0,
    initialEnd: 0,
  });

  const accent = accentColor || '#31C5F4';

  // Decode audio peaks for the waveform & obtain high-precision duration
  useEffect(() => {
    if (!sound || !isOpen) return;

    let isCancelled = false;
    setIsLoadingWaveform(true);

    let src = sound.audioData || sound.audioPath;
    if (!src) {
      setIsLoadingWaveform(false);
      return;
    }

    if (
      !src.startsWith('data:') &&
      !src.startsWith('http://') &&
      !src.startsWith('https://') &&
      !src.startsWith('file://')
    ) {
      src = 'file:///' + src.replace(/\\/g, '/');
    }

    const decodeWaveform = async () => {
      try {
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        if (isCancelled) return;

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const tempCtx = new AudioCtxClass();
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        if (isCancelled) {
          tempCtx.close().catch(() => {});
          return;
        }

        const exactDur = audioBuffer.duration;
        if (exactDur > 0 && isFinite(exactDur)) {
          setDuration(exactDur);
          const initStart = sound.trimStart && sound.trimStart < exactDur ? sound.trimStart : 0;
          const initEnd = sound.trimEnd && sound.trimEnd > initStart && sound.trimEnd <= exactDur ? sound.trimEnd : exactDur;
          setTrimStart(Math.round(initStart * 100) / 100);
          setTrimEnd(Math.round(initEnd * 100) / 100);
          setCurrentTime(initStart);
        }

        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / TOTAL_BARS);
        const peaks: number[] = [];

        for (let i = 0; i < TOTAL_BARS; i++) {
          const start = i * blockSize;
          const end = Math.min(start + blockSize, rawData.length);
          let peak = 0;
          for (let j = start; j < end; j += 4) {
            const val = Math.abs(rawData[j]);
            if (val > peak) peak = val;
          }
          peaks.push(peak);
        }

        const maxPeak = Math.max(...peaks, 0.05);
        const normalized = peaks.map((p) => Math.max(0.12, Math.min(1.0, p / maxPeak)));

        if (!isCancelled) {
          setWaveformData(normalized);
          setIsLoadingWaveform(false);
        }
        tempCtx.close().catch(() => {});
      } catch (err) {
        if (!isCancelled) {
          const fallback = Array.from({ length: TOTAL_BARS }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i * 0.15)));
          setWaveformData(fallback);
          setIsLoadingWaveform(false);
        }
      }
    };

    decodeWaveform();
    return () => {
      isCancelled = true;
    };
  }, [sound, isOpen]);

  // Audio element setup and playback sync
  useEffect(() => {
    if (!sound || !isOpen) return;

    let src = sound.audioData || sound.audioPath;
    if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('file:')) {
      src = 'file:///' + src.replace(/\\/g, '/');
    }

    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoaded = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration((prev) => (prev > 0 ? prev : audio.duration));
      }
    };

    const onTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);

    audio.onended = () => {
      if (isLooping && !isPlayingFull) {
        audio.currentTime = trimStart;
        audio.play().catch(() => {});
      } else {
        setIsPlaying(false);
        setIsPlayingFull(false);
        setCurrentTime(trimStart);
      }
    };

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audioRef.current = null;
    };
  }, [sound, isOpen, isLooping, isPlayingFull, trimStart]);

  // Precision playhead animation loop
  const checkPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const time = audio.currentTime;
    setCurrentTime(time);

    // If auditing the trimmed range, stop or loop when trimEnd is reached
    if (!isPlayingFull && trimEnd > 0 && time >= trimEnd) {
      if (isLooping) {
        audio.currentTime = trimStart;
        setCurrentTime(trimStart);
        animFrameRef.current = requestAnimationFrame(checkPlayback);
        return;
      } else {
        audio.pause();
        setIsPlaying(false);
        audio.currentTime = trimStart;
        setCurrentTime(trimStart);
        return;
      }
    }

    animFrameRef.current = requestAnimationFrame(checkPlayback);
  }, [trimStart, trimEnd, isLooping, isPlayingFull]);

  useEffect(() => {
    if (isPlaying || isPlayingFull) {
      animFrameRef.current = requestAnimationFrame(checkPlayback);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, isPlayingFull, checkPlayback]);

  // Drag logic for Start Handle, End Handle, and Middle Window
  useEffect(() => {
    if (!dragMode) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!waveformRef.current || duration <= 0) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartRef.current.clientX;
      const deltaTime = (deltaX / rect.width) * duration;

      if (dragMode === 'start') {
        const newStart = Math.max(0, Math.min(dragStartRef.current.initialEnd - 0.1, dragStartRef.current.initialStart + deltaTime));
        const rounded = Math.round(newStart * 100) / 100;
        setTrimStart(rounded);
        if (audioRef.current && !isPlaying) {
          audioRef.current.currentTime = rounded;
          setCurrentTime(rounded);
        }
      } else if (dragMode === 'end') {
        const newEnd = Math.min(duration, Math.max(dragStartRef.current.initialStart + 0.1, dragStartRef.current.initialEnd + deltaTime));
        const rounded = Math.round(newEnd * 100) / 100;
        setTrimEnd(rounded);
      } else if (dragMode === 'window') {
        const span = dragStartRef.current.initialEnd - dragStartRef.current.initialStart;
        let newStart = dragStartRef.current.initialStart + deltaTime;
        let newEnd = dragStartRef.current.initialEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = span;
        } else if (newEnd > duration) {
          newEnd = duration;
          newStart = Math.max(0, duration - span);
        }

        setTrimStart(Math.round(newStart * 100) / 100);
        setTrimEnd(Math.round(newEnd * 100) / 100);
      }
    };

    const onMouseUp = () => {
      setDragMode(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragMode, duration, isPlaying]);

  if (!isOpen || !sound) return null;

  // Formatting helpers
  const formatTime = (secs: number): string => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragMode || !waveformRef.current || duration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = Math.round(clickRatio * duration * 100) / 100;

    setCurrentTime(seekTime);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  // Play / Pause Trimmed Selection
  const handleTogglePlayTrim = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setIsPlayingFull(false);
      audio.currentTime = trimStart;
      setCurrentTime(trimStart);
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Play / Pause Full Audio
  const handleTogglePlayFull = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingFull) {
      audio.pause();
      setIsPlayingFull(false);
    } else {
      setIsPlaying(false);
      audio.currentTime = 0;
      setCurrentTime(0);
      audio.play().then(() => setIsPlayingFull(true)).catch(() => {});
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = trimStart;
    }
    setIsPlaying(false);
    setIsPlayingFull(false);
    setCurrentTime(trimStart);
  };

  const handleReset = () => {
    setTrimStart(0);
    setTrimEnd(duration);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleSave = () => {
    if (audioRef.current) audioRef.current.pause();
    onSaveTrim(sound.id, trimStart, trimEnd);
    onClose();
  };

  const handleSaveAsNew = () => {
    if (audioRef.current) audioRef.current.pause();
    if (onSaveAsNewTrim) {
      onSaveAsNewTrim(sound.id, trimStart, trimEnd);
    } else {
      onSaveTrim(sound.id, trimStart, trimEnd);
    }
    onClose();
  };

  const trimmedLength = Math.max(0, trimEnd - trimStart);
  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const playheadPercent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div
      data-hud-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (audioRef.current) audioRef.current.pause();
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        data-hud-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0B0E14] border border-[#1B222E] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden select-none transition-all duration-150"
      >
        {/* Modal Header */}
        <header className="h-16 px-6 border-b border-[#1B222E] flex items-center justify-between bg-[#0E121A]/70 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: `${accent}15`,
                borderColor: `${accent}35`,
                color: accent,
              }}
            >
              <Scissors size={15} />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white tracking-wide flex items-center gap-2">
                <span>Audio Trimmer</span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-[#151B25] text-[#31C5F4] border border-[#1B222E]">
                  {formatTime(duration)}
                </span>
              </h3>
              <p className="text-[11px] text-[#5A687C] truncate max-w-md">{sound.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4 bg-[#0B0E14]">
          {/* Waveform Card */}
          <div className="p-5 bg-[#10141C] border border-[#1B222E] rounded-2xl space-y-3.5">
            {/* Top Info Badge Row */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-[#8E95A5]">
                <span>Current:</span>
                <span className="text-white font-bold">{formatTime(currentTime)}</span>
              </div>
              <div
                className="px-3 py-1 rounded-xl font-bold flex items-center gap-2 border"
                style={{
                  backgroundColor: `${accent}15`,
                  borderColor: `${accent}35`,
                  color: accent,
                }}
              >
                <span>Trimmed Span:</span>
                <span className="text-white font-mono">{trimmedLength.toFixed(2)}s</span>
              </div>
            </div>

            {/* Interactive Waveform Track */}
            <div
              ref={waveformRef}
              onClick={handleTrackClick}
              className="relative w-full h-28 bg-[#090C12] rounded-2xl border border-[#1B222E] overflow-hidden cursor-crosshair group flex items-center"
            >
            {/* Waveform Bars (Clean flat rendering without fuzzy glows) */}
            <div className="w-full h-full flex items-center justify-between gap-[2px] px-2 pointer-events-none">
              {isLoadingWaveform ? (
                <div className="w-full flex items-center justify-center text-[#5A6880] text-xs">
                  <span>Analyzing audio waveform...</span>
                </div>
              ) : (
                waveformData.map((peak, idx) => {
                  const barPercent = (idx / TOTAL_BARS) * 100;
                  const isInsideTrim = barPercent >= startPercent && barPercent <= endPercent;

                  return (
                    <div
                      key={idx}
                      className="w-[3px] rounded-full flex-shrink-0"
                      style={{
                        height: `${Math.max(12, peak * 90)}%`,
                        backgroundColor: isInsideTrim
                          ? accent
                          : 'rgba(255, 255, 255, 0.15)',
                      }}
                    />
                  );
                })
              )}
            </div>

            {/* Left Out-of-Bounds Shroud */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none border-r border-white/10"
              style={{ width: `${startPercent}%` }}
            />

            {/* Right Out-of-Bounds Shroud */}
            <div
              className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none border-l border-white/10"
              style={{ width: `${100 - endPercent}%` }}
            />

            {/* Middle Draggable Selection Window */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                dragStartRef.current = {
                  clientX: e.clientX,
                  initialStart: trimStart,
                  initialEnd: trimEnd,
                };
                setDragMode('window');
              }}
              title="Drag selection window"
              className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing border-y border-transparent transition-colors hover:border-[#31C5F4]/40"
              style={{
                left: `${startPercent}%`,
                width: `${endPercent - startPercent}%`,
                backgroundColor: `${accent}15`,
              }}
            />

            {/* Start Handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                dragStartRef.current = {
                  clientX: e.clientX,
                  initialStart: trimStart,
                  initialEnd: trimEnd,
                };
                setDragMode('start');
              }}
              title="Drag Start Point"
              className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize flex flex-col items-center justify-between z-20 group/handle"
              style={{ left: `${startPercent}%` }}
            >
              <div
                className="w-3.5 h-5 rounded-md flex items-center justify-center text-[8px] font-bold text-black"
                style={{ backgroundColor: accent }}
              >
                ◀
              </div>
              <div className="w-[2px] h-full" style={{ backgroundColor: accent }} />
              <div
                className="w-3.5 h-3.5 rounded-md flex items-center justify-center"
                style={{ backgroundColor: accent }}
              />
            </div>

            {/* End Handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                dragStartRef.current = {
                  clientX: e.clientX,
                  initialStart: trimStart,
                  initialEnd: trimEnd,
                };
                setDragMode('end');
              }}
              title="Drag End Point"
              className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize flex flex-col items-center justify-between z-20 group/handle"
              style={{ left: `${endPercent}%` }}
            >
              <div
                className="w-3.5 h-5 rounded-md flex items-center justify-center text-[8px] font-bold text-black"
                style={{ backgroundColor: accent }}
              >
                ▶
              </div>
              <div className="w-[2px] h-full" style={{ backgroundColor: accent }} />
              <div
                className="w-3.5 h-3.5 rounded-md flex items-center justify-center"
                style={{ backgroundColor: accent }}
              />
            </div>

            {/* Dynamic Playhead Line (Follows exact audio frame with 0ms lag, no glow) */}
            {(isPlaying || isPlayingFull) && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white z-30 pointer-events-none"
                style={{ left: `${playheadPercent}%` }}
              >
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white rotate-45" />
                <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white rotate-45" />
              </div>
            )}
          </div>
        </div>

          {/* Micro-Adjustment Fine-Tuning Pods */}
          <div className="grid grid-cols-2 gap-4">
            {/* Start Fine-Tuner */}
            <div className="p-4 rounded-2xl bg-[#10141C] border border-[#1B222E] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A687C]">Start Time</span>
                <button
                  type="button"
                  onClick={() => {
                    setTrimStart(Math.round(currentTime * 100) / 100);
                  }}
                  className="text-[10.5px] font-semibold text-[#31C5F4] hover:underline cursor-pointer"
                >
                  Set to Playhead
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-mono font-bold text-white">{formatTime(trimStart)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTrimStart((prev) => Math.max(0, Math.round((prev - 0.1) * 100) / 100))}
                    className="p-1.5 rounded-lg bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-white hover:border-[#31C5F4]/40 transition-colors cursor-pointer"
                    title="-0.1s"
                  >
                    <Minus size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimStart((prev) => Math.min(trimEnd - 0.1, Math.round((prev + 0.1) * 100) / 100))}
                    className="p-1.5 rounded-lg bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-white hover:border-[#31C5F4]/40 transition-colors cursor-pointer"
                    title="+0.1s"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* End Fine-Tuner */}
            <div className="p-4 rounded-2xl bg-[#10141C] border border-[#1B222E] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A687C]">End Time</span>
                <button
                  type="button"
                  onClick={() => {
                    setTrimEnd(Math.max(trimStart + 0.1, Math.round(currentTime * 100) / 100));
                  }}
                  className="text-[10.5px] font-semibold text-[#31C5F4] hover:underline cursor-pointer"
                >
                  Set to Playhead
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-mono font-bold text-white">{formatTime(trimEnd)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTrimEnd((prev) => Math.max(trimStart + 0.1, Math.round((prev - 0.1) * 100) / 100))}
                    className="p-1.5 rounded-lg bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-white hover:border-[#31C5F4]/40 transition-colors cursor-pointer"
                    title="-0.1s"
                  >
                    <Minus size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimEnd((prev) => Math.min(duration, Math.round((prev + 0.1) * 100) / 100))}
                    className="p-1.5 rounded-lg bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-white hover:border-[#31C5F4]/40 transition-colors cursor-pointer"
                    title="+0.1s"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Player & Audition Controls Bar */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#10141C] border border-[#1B222E]">
            <div className="flex items-center gap-2">
              {/* Play / Pause Selection */}
              <button
                type="button"
                onClick={handleTogglePlayTrim}
                className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-md"
                style={{ backgroundColor: accent, color: '#090C12' }}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} className="fill-current" />}
                <span>{isPlaying ? 'Pause' : 'Play Selection'}</span>
              </button>

              {/* Loop Toggle */}
              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isLooping
                    ? 'bg-[#151B25] text-[#31C5F4] border-[#31C5F4]/60'
                    : 'bg-[#151B25] border-[#1B222E] text-[#8E95A5] hover:text-white'
                }`}
                title={isLooping ? 'Looping enabled' : 'Enable loop'}
              >
                <Repeat size={15} />
              </button>

              {/* Stop Playback */}
              <button
                type="button"
                onClick={handleStop}
                className="p-2 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] text-[#8E95A5] hover:text-white transition-colors cursor-pointer"
                title="Stop playback"
              >
                <Square size={15} />
              </button>

              {/* Play Full Audio */}
              <button
                type="button"
                onClick={handleTogglePlayFull}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isPlayingFull
                    ? 'bg-[#151B25] border-[#31C5F4]/50 text-[#31C5F4]'
                    : 'bg-[#151B25] border-[#1B222E] text-[#8E95A5] hover:text-white'
                }`}
                title="Listen to full un-trimmed audio"
              >
                <Volume2 size={14} />
                <span>Play Full</span>
              </button>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset Range</span>
            </button>
          </div>
        </div>

        {/* Modal Footer / Save Options */}
        <footer className="h-16 px-6 border-t border-[#1B222E] flex items-center justify-between bg-[#0E121A] shrink-0">
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[#8E95A5] hover:text-white bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveAsNew}
              className="px-4 py-2 rounded-xl bg-[#151B25] hover:bg-[#1B222E] border border-[#1B222E] hover:border-[#31C5F4]/40 text-white text-[12px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <CopyPlus size={14} style={{ color: accent }} />
              <span>Save as New Sound</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-md"
              style={{ backgroundColor: accent, color: '#090C12' }}
            >
              <Check size={14} className="stroke-[2.5]" />
              <span>Save Trim</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
