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

  const accent = accentColor || 'var(--accent-color)';

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

  useEffect(() => {
    if (!sound || !isOpen) return;

    let src = sound.audioData || sound.audioPath;
    if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('file:')) {
      src = 'file:///' + src.replace(/\\/g, '/');
    }

    const audio = new Audio(src);
    audioRef.current = audio;

    const onAudioTimeUpdate = () => {
      const cur = audio.currentTime;
      setCurrentTime(cur);

      if (!isPlayingFull) {
        if (cur >= trimEnd) {
          if (isLooping) {
            audio.currentTime = trimStart;
            audio.play().catch(() => {});
          } else {
            audio.pause();
            audio.currentTime = trimStart;
            setIsPlaying(false);
            setCurrentTime(trimStart);
          }
        }
      } else {
        if (cur >= duration) {
          audio.pause();
          setIsPlayingFull(false);
          audio.currentTime = 0;
          setCurrentTime(0);
        }
      }
    };

    const onAudioEnded = () => {
      setIsPlaying(false);
      setIsPlayingFull(false);
      setCurrentTime(trimStart);
    };

    audio.addEventListener('timeupdate', onAudioTimeUpdate);
    audio.addEventListener('ended', onAudioEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onAudioTimeUpdate);
      audio.removeEventListener('ended', onAudioEnded);
      audioRef.current = null;
    };
  }, [sound, isOpen, trimStart, trimEnd, isLooping, isPlayingFull, duration]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (audioRef.current) audioRef.current.pause();
        onClose();
      }
      if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlayTrim();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, trimStart]);

  const handlePointerMove = useCallback(
    (e: MouseEvent) => {
      if (!dragMode || !waveformRef.current || duration <= 0) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartRef.current.clientX;
      const deltaTime = (deltaX / rect.width) * duration;

      if (dragMode === 'start') {
        const newStart = Math.max(0, Math.min(trimEnd - 0.1, dragStartRef.current.initialStart + deltaTime));
        setTrimStart(Math.round(newStart * 100) / 100);
        setCurrentTime(newStart);
        if (audioRef.current) audioRef.current.currentTime = newStart;
      } else if (dragMode === 'end') {
        const newEnd = Math.min(duration, Math.max(trimStart + 0.1, dragStartRef.current.initialEnd + deltaTime));
        setTrimEnd(Math.round(newEnd * 100) / 100);
      } else if (dragMode === 'window') {
        const span = dragStartRef.current.initialEnd - dragStartRef.current.initialStart;
        let newStart = dragStartRef.current.initialStart + deltaTime;
        let newEnd = dragStartRef.current.initialEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = span;
        } else if (newEnd > duration) {
          newEnd = duration;
          newStart = duration - span;
        }

        setTrimStart(Math.round(newStart * 100) / 100);
        setTrimEnd(Math.round(newEnd * 100) / 100);
        setCurrentTime(newStart);
        if (audioRef.current) audioRef.current.currentTime = newStart;
      }
    },
    [dragMode, duration, trimStart, trimEnd]
  );

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
  }, []);

  useEffect(() => {
    if (dragMode) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
      };
    }
  }, [dragMode, handlePointerMove, handlePointerUp]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragMode || !waveformRef.current || duration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickTime = (clickX / rect.width) * duration;
    setCurrentTime(clickTime);
    if (audioRef.current) {
      audioRef.current.currentTime = clickTime;
    }
  };

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
    if (!sound) return;
    if (audioRef.current) audioRef.current.pause();
    onSaveTrim(sound.id, trimStart, trimEnd);
    onClose();
  };

  const handleSaveAsNew = () => {
    if (!sound) return;
    if (audioRef.current) audioRef.current.pause();
    if (onSaveAsNewTrim) {
      onSaveAsNewTrim(sound.id, trimStart, trimEnd);
    } else {
      onSaveTrim(sound.id, trimStart, trimEnd);
    }
    onClose();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  if (!isOpen || !sound) return null;

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
      className="fixed inset-0 z-[100] flex items-center justify-center frosted-backdrop bg-black/35 p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        data-hud-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl frosted-modal bg-[#0e1219]/42 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.12)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white tracking-tight flex items-center gap-2">
              <span>Audio trimmer</span>
              <span className="text-[12px] font-mono font-normal text-slate-400 tabular-nums">
                ({formatTime(duration)})
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-md">{sound.title}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4 bg-transparent">
          {/* Waveform Section */}
          <div className="space-y-2.5">
            {/* Time Readout */}
            <div className="flex items-center justify-between text-[11px] font-mono">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span>Playhead:</span>
                <span className="text-white font-medium tabular-nums">{formatTime(currentTime)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span>Trim span:</span>
                <span className="text-accent font-medium tabular-nums">{trimmedLength.toFixed(2)}s</span>
              </div>
            </div>

            {/* Interactive Waveform Track */}
            <div
              ref={waveformRef}
              onClick={handleTrackClick}
              className="relative w-full h-24 bg-black/35 rounded-lg border border-white/[0.08] overflow-hidden cursor-crosshair flex items-center"
            >
              {/* Bars */}
              <div className="w-full h-full flex items-center justify-between gap-[2px] px-2 pointer-events-none">
                {isLoadingWaveform ? (
                  <div className="w-full flex items-center justify-center text-slate-500 text-[11.5px]">
                    Analyzing waveform...
                  </div>
                ) : (
                  waveformData.map((peak, idx) => {
                    const barPercent = (idx / TOTAL_BARS) * 100;
                    const isInsideTrim = barPercent >= startPercent && barPercent <= endPercent;

                    return (
                      <div
                        key={idx}
                        className="w-[2.5px] rounded-full flex-shrink-0"
                        style={{
                          height: `${Math.max(12, peak * 85)}%`,
                          backgroundColor: isInsideTrim ? accent : 'rgba(255, 255, 255, 0.12)',
                        }}
                      />
                    );
                  })
                )}
              </div>

              {/* Shrouds */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/65 pointer-events-none border-r border-white/10"
                style={{ width: `${startPercent}%` }}
              />
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/65 pointer-events-none border-l border-white/10"
                style={{ width: `${100 - endPercent}%` }}
              />

              {/* Draggable Selection Window */}
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
                className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing border-y border-transparent hover:border-accent/40"
                style={{
                  left: `${startPercent}%`,
                  width: `${endPercent - startPercent}%`,
                  backgroundColor: `${accent}18`,
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
                className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex flex-col items-center justify-between z-20"
                style={{ left: `${startPercent}%` }}
              >
                <div className="w-3 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold text-slate-950" style={{ backgroundColor: accent }}>
                  ◀
                </div>
                <div className="w-[2px] h-full" style={{ backgroundColor: accent }} />
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: accent }} />
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
                className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex flex-col items-center justify-between z-20"
                style={{ left: `${endPercent}%` }}
              >
                <div className="w-3 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold text-slate-950" style={{ backgroundColor: accent }}>
                  ▶
                </div>
                <div className="w-[2px] h-full" style={{ backgroundColor: accent }} />
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: accent }} />
              </div>

              {/* Playhead */}
              {(isPlaying || isPlayingFull) && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-white z-30 pointer-events-none"
                  style={{ left: `${playheadPercent}%` }}
                />
              )}
            </div>
          </div>

          {/* Micro-Adjustment Fine-Tuning */}
          <div className="grid grid-cols-2 gap-6 pt-3 border-t border-white/[0.07]">
            {/* Start Fine-Tuner */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Start time</span>
                <button
                  type="button"
                  onClick={() => setTrimStart(Math.round(currentTime * 100) / 100)}
                  className="text-[10.5px] font-medium text-accent hover:underline cursor-pointer"
                >
                  Set to playhead
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-mono font-medium text-white tabular-nums">{formatTime(trimStart)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTrimStart((prev) => Math.max(0, Math.round((prev - 0.1) * 100) / 100))}
                    className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-colors cursor-pointer"
                    title="-0.1s"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimStart((prev) => Math.min(trimEnd - 0.1, Math.round((prev + 0.1) * 100) / 100))}
                    className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-colors cursor-pointer"
                    title="+0.1s"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* End Fine-Tuner */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">End time</span>
                <button
                  type="button"
                  onClick={() => setTrimEnd(Math.max(trimStart + 0.1, Math.round(currentTime * 100) / 100))}
                  className="text-[10.5px] font-medium text-accent hover:underline cursor-pointer"
                >
                  Set to playhead
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-mono font-medium text-white tabular-nums">{formatTime(trimEnd)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTrimEnd((prev) => Math.max(trimStart + 0.1, Math.round((prev - 0.1) * 100) / 100))}
                    className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-colors cursor-pointer"
                    title="-0.1s"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimEnd((prev) => Math.min(duration, Math.round((prev + 0.1) * 100) / 100))}
                    className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white transition-colors cursor-pointer"
                    title="+0.1s"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.07]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlayTrim}
                className="px-3.5 py-1.5 rounded-lg font-medium text-[11.5px] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs text-slate-950 bg-accent hover:brightness-110"
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} className="fill-current ml-0.5" />}
                <span>{isPlaying ? 'Pause' : 'Play selection'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isLooping
                    ? 'bg-accent/20 border-accent/60 text-accent'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
                title={isLooping ? 'Looping enabled' : 'Enable loop'}
              >
                <Repeat size={13} />
              </button>

              <button
                type="button"
                onClick={handleStop}
                className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Stop"
              >
                <Square size={13} />
              </button>

              <button
                type="button"
                onClick={handleTogglePlayFull}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
                  isPlayingFull
                    ? 'bg-accent/20 border-accent/60 text-accent'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
                title="Listen to full un-trimmed audio"
              >
                <Volume2 size={12} />
                <span>Play full</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={11} />
              <span>Reset range</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="h-16 px-6 border-t border-white/[0.08] flex items-center justify-between frosted-modal-chrome shrink-0">
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveAsNew}
              className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <CopyPlus size={13} className="text-accent" />
              <span>Save as new</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md text-slate-950 bg-accent hover:brightness-110"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Save trim</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
