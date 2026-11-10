import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Square,
  Scissors,
  Check,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { SoundItem } from '../types';

interface AudioTrimmerModalProps {
  sound: SoundItem | null;
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  onSaveTrim: (soundId: string, trimStart: number, trimEnd: number) => void;
}

export const AudioTrimmerModal: React.FC<AudioTrimmerModalProps> = ({
  sound,
  isOpen,
  onClose,
  accentColor,
  onSaveTrim,
}) => {
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState<boolean>(true);
  const [dragMode, setDragMode] = useState<'start' | 'end' | 'window' | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const dragStartData = useRef<{ mouseX: number; initialStart: number; initialEnd: number; initialScroll: number }>({
    mouseX: 0,
    initialStart: 0,
    initialEnd: 0,
    initialScroll: 0,
  });

  const TOTAL_BARS = 200;
  const accent = accentColor || 'var(--accent-color, #8b5cf6)';

  // Decode audio file and extract waveform peaks
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

        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / TOTAL_BARS);
        const peaks: number[] = [];

        for (let i = 0; i < TOTAL_BARS; i++) {
          const start = i * blockSize;
          const end = Math.min(start + blockSize, rawData.length);
          let peak = 0;
          for (let j = start; j < end; j += 2) {
            const val = Math.abs(rawData[j]);
            if (val > peak) peak = val;
          }
          peaks.push(peak);
        }

        const maxPeak = Math.max(...peaks, 0.05);
        const normalized = peaks.map((p) => Math.max(0.06, Math.min(1.0, p / maxPeak)));

        if (!isCancelled) {
          setWaveformData(normalized);
          setIsLoadingWaveform(false);
        }
        tempCtx.close().catch(() => {});
      } catch (err) {
        console.warn('Waveform decode fallback:', err);
        if (!isCancelled) {
          const fallback = Array.from({ length: TOTAL_BARS }, (_, i) => 0.15 + 0.65 * Math.abs(Math.sin(i * 0.12)));
          setWaveformData(fallback);
          setIsLoadingWaveform(false);
        }
      }
    };

    decodeWaveform();
    return () => { isCancelled = true; };
  }, [sound, isOpen]);

  // Load audio element
  useEffect(() => {
    if (sound && isOpen) {
      const audio = new Audio(sound.audioData || sound.audioPath);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        const d = audio.duration || sound.duration || 10;
        setDuration(d);
        setTrimStart(sound.trimStart || 0);
        setTrimEnd(sound.trimEnd && sound.trimEnd <= d ? sound.trimEnd : d);
        setCurrentTime(sound.trimStart || 0);
        setZoomLevel(1);
        setScrollOffset(0);
      };

      audio.onended = () => {
        setIsPlaying(false);
      };

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    }
  }, [sound, isOpen]);

  // High-precision playhead via requestAnimationFrame
  const updatePlayhead = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const time = audio.currentTime;
    setCurrentTime(time);

    if (trimEnd > 0 && time >= trimEnd) {
      audio.pause();
      setIsPlaying(false);
      audio.currentTime = trimStart;
      setCurrentTime(trimStart);
      return;
    }

    animFrameRef.current = requestAnimationFrame(updatePlayhead);
  }, [trimStart, trimEnd]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updatePlayhead]);

  // Drag handlers
  useEffect(() => {
    if (!dragMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!waveformContainerRef.current || duration <= 0) return;
      const rect = waveformContainerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartData.current.mouseX;
      // Account for zoom: visible duration is duration/zoomLevel
      const visibleDuration = duration / zoomLevel;
      const deltaTime = (deltaX / rect.width) * visibleDuration;

      if (dragMode === 'start') {
        const newStart = Math.max(
          0,
          Math.min(dragStartData.current.initialEnd - 0.05, dragStartData.current.initialStart + deltaTime)
        );
        setTrimStart(Math.round(newStart * 1000) / 1000);
        if (audioRef.current) {
          audioRef.current.currentTime = newStart;
          setCurrentTime(newStart);
        }
      } else if (dragMode === 'end') {
        const newEnd = Math.min(
          duration,
          Math.max(dragStartData.current.initialStart + 0.05, dragStartData.current.initialEnd + deltaTime)
        );
        setTrimEnd(Math.round(newEnd * 1000) / 1000);
      } else if (dragMode === 'window') {
        const windowDuration = dragStartData.current.initialEnd - dragStartData.current.initialStart;
        let newStart = dragStartData.current.initialStart + deltaTime;
        let newEnd = dragStartData.current.initialEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = windowDuration;
        }
        if (newEnd > duration) {
          newEnd = duration;
          newStart = Math.max(0, duration - windowDuration);
        }

        setTrimStart(Math.round(newStart * 1000) / 1000);
        setTrimEnd(Math.round(newEnd * 1000) / 1000);
      }
    };

    const handleMouseUp = () => setDragMode(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, duration, zoomLevel]);

  // Scroll to keep selection visible when zoomed
  useEffect(() => {
    if (zoomLevel > 1 && scrollContainerRef.current) {
      const midPoint = ((trimStart + trimEnd) / 2 / duration) * 100 * zoomLevel;
      const containerWidth = scrollContainerRef.current.clientWidth;
      const scrollTarget = (midPoint / 100) * containerWidth - containerWidth / 2;
      scrollContainerRef.current.scrollLeft = Math.max(0, scrollTarget);
    }
  }, [zoomLevel]);

  if (!isOpen || !sound) return null;

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = trimStart;
      setCurrentTime(trimStart);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    }
  };

  const handleSave = () => {
    if (audioRef.current) audioRef.current.pause();
    onSaveTrim(sound.id, trimStart, trimEnd);
    onClose();
  };

  // Format time as MM:SS.mmm
  const formatTime = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const formatShortTime = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Parse time input (MM:SS.mmm or MM:SS,mm or MM:SS)
  const parseTimeInput = (input: string): number | null => {
    const clean = input.replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secParts = parts[1].split('.');
      const secs = parseInt(secParts[0], 10);
      const ms = secParts[1] ? parseInt(secParts[1].padEnd(3, '0').slice(0, 3), 10) : 0;
      if (!isNaN(mins) && !isNaN(secs) && !isNaN(ms)) {
        return mins * 60 + secs + ms / 1000;
      }
    }
    const num = parseFloat(clean);
    if (!isNaN(num)) return num;
    return null;
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragMode || !waveformContainerRef.current || duration <= 0) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    // Account for zoom and scroll
    const visibleStart = scrollOffset / duration;
    const visibleDuration = 1 / zoomLevel;
    const targetTime = (visibleStart + ratio * visibleDuration) * duration;
    const clamped = Math.max(0, Math.min(duration, targetTime));
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  };

  // Zoom-aware positions
  const visibleStartTime = scrollOffset;
  const visibleEndTime = scrollOffset + duration / zoomLevel;
  const visibleDuration = visibleEndTime - visibleStartTime;

  const timeToPercent = (t: number) => ((t - visibleStartTime) / visibleDuration) * 100;

  const startPercent = Math.max(0, timeToPercent(trimStart));
  const endPercent = Math.min(100, timeToPercent(trimEnd));
  const widthPercent = Math.max(0.5, endPercent - startPercent);
  const playheadPercent = timeToPercent(currentTime);
  const selectionDuration = Math.max(0, trimEnd - trimStart);

  // Visible bar range for zoom
  const barStartIdx = Math.floor((visibleStartTime / duration) * TOTAL_BARS);
  const barEndIdx = Math.ceil((visibleEndTime / duration) * TOTAL_BARS);
  const visibleBars = waveformData.slice(Math.max(0, barStartIdx), Math.min(TOTAL_BARS, barEndIdx));

  const nudgeAmount = Math.max(0.01, duration / 1000); // ~1ms nudge steps

  const handleZoomIn = () => {
    const newZoom = Math.min(16, zoomLevel * 2);
    // Center zoom on the selection midpoint
    const mid = (trimStart + trimEnd) / 2;
    const newVisibleDuration = duration / newZoom;
    setScrollOffset(Math.max(0, Math.min(duration - newVisibleDuration, mid - newVisibleDuration / 2)));
    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(1, zoomLevel / 2);
    if (newZoom === 1) {
      setScrollOffset(0);
    } else {
      const mid = (trimStart + trimEnd) / 2;
      const newVisibleDuration = duration / newZoom;
      setScrollOffset(Math.max(0, Math.min(duration - newVisibleDuration, mid - newVisibleDuration / 2)));
    }
    setZoomLevel(newZoom);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (zoomLevel <= 1) return;
    e.preventDefault();
    const visibleDur = duration / zoomLevel;
    const step = visibleDur * 0.1;
    setScrollOffset((prev) => Math.max(0, Math.min(duration - visibleDur, prev + (e.deltaY > 0 ? step : -step))));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#13151b] border border-[#252834] rounded-[16px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#252834] flex items-center justify-between bg-[#0f1117]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ backgroundColor: `${accent}20`, color: accent }}
            >
              <Scissors size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white">Audio Trimmer</h2>
              <p className="text-[11px] text-[#6b7280] truncate max-w-sm">{sound.title}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="p-1.5 rounded-lg text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 bg-[#13151b] flex flex-col gap-4">
          {/* Time Display */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Current playback time */}
              <div className="text-[13px] font-mono text-[#6b7280]">
                <span className="text-white font-bold">{formatTime(currentTime)}</span>
              </div>
            </div>
            {/* Selection duration */}
            <div
              className="px-3 py-1 rounded-[8px] text-[13px] font-mono font-bold"
              style={{ backgroundColor: `${accent}15`, color: accent }}
            >
              {formatTime(selectionDuration)}
            </div>
          </div>

          {/* Waveform */}
          <div className="relative">
            {/* Zoom controls */}
            <div className="absolute -top-0.5 right-0 flex items-center gap-1 z-40">
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 1}
                className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                title="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[10px] font-mono text-[#6b7280] min-w-[28px] text-center">
                {zoomLevel}x
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 16}
                className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                title="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Waveform track */}
            <div
              ref={waveformContainerRef}
              onClick={handleWaveformClick}
              onWheel={handleWheel}
              className="relative w-full h-24 bg-[#0a0c10] rounded-[12px] border border-[#1e2030] flex items-center overflow-hidden cursor-pointer mt-5"
              style={{ padding: '0 2px' }}
            >
              {isLoadingWaveform ? (
                <div className="w-full flex items-center justify-center gap-2 text-[#6b7280]">
                  <div
                    className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: accent, borderTopColor: 'transparent' }}
                  />
                  <span className="text-[11px] font-mono">Analyzing waveform...</span>
                </div>
              ) : (
                <>
                  {/* Waveform bars */}
                  <div className="absolute inset-0 flex items-center px-1" style={{ gap: '1px' }}>
                    {visibleBars.map((peak, idx) => {
                      const globalIdx = barStartIdx + idx;
                      const barTime = (globalIdx / TOTAL_BARS) * duration;
                      const isInsideTrim = barTime >= trimStart && barTime <= trimEnd;
                      const isBeforePlayhead = barTime <= currentTime && isInsideTrim;
                      const heightPercent = Math.max(8, Math.round(peak * 88));

                      let barColor = '#2a2d3a';
                      if (isInsideTrim) {
                        barColor = isBeforePlayhead ? accent : `${accent}80`;
                      }

                      return (
                        <div
                          key={globalIdx}
                          className="flex-1 rounded-full transition-colors duration-75"
                          style={{
                            height: `${heightPercent}%`,
                            backgroundColor: barColor,
                            minWidth: '1px',
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Selection overlay with handles */}
                  {startPercent < 100 && endPercent > 0 && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragMode('window');
                        dragStartData.current = {
                          mouseX: e.clientX,
                          initialStart: trimStart,
                          initialEnd: trimEnd,
                          initialScroll: scrollOffset,
                        };
                      }}
                      className="absolute top-0 bottom-0 z-20 cursor-grab active:cursor-grabbing flex items-stretch"
                      style={{
                        left: `${Math.max(0, startPercent)}%`,
                        width: `${widthPercent}%`,
                      }}
                    >
                      {/* Top/bottom borders */}
                      <div
                        className="absolute inset-x-0 top-0 h-[2px] rounded-t-sm"
                        style={{ backgroundColor: accent }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 h-[2px] rounded-b-sm"
                        style={{ backgroundColor: accent }}
                      />

                      {/* Left handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragMode('start');
                          dragStartData.current = {
                            mouseX: e.clientX,
                            initialStart: trimStart,
                            initialEnd: trimEnd,
                            initialScroll: scrollOffset,
                          };
                        }}
                        className="w-3 h-full flex items-center justify-center cursor-ew-resize rounded-l-[6px] hover:brightness-125 transition-all -ml-[1px] shrink-0"
                        style={{ backgroundColor: accent }}
                        title="Drag start point"
                      >
                        <div className="w-[2px] h-4 bg-black/40 rounded-full" />
                      </div>

                      {/* Middle transparent grab area */}
                      <div className="flex-1" />

                      {/* Right handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragMode('end');
                          dragStartData.current = {
                            mouseX: e.clientX,
                            initialStart: trimStart,
                            initialEnd: trimEnd,
                            initialScroll: scrollOffset,
                          };
                        }}
                        className="w-3 h-full flex items-center justify-center cursor-ew-resize rounded-r-[6px] hover:brightness-125 transition-all -mr-[1px] shrink-0"
                        style={{ backgroundColor: accent }}
                        title="Drag end point"
                      >
                        <div className="w-[2px] h-4 bg-black/40 rounded-full" />
                      </div>
                    </div>
                  )}

                  {/* Dark masks for unselected regions */}
                  {startPercent > 0 && (
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-black/55 pointer-events-none z-10"
                      style={{ width: `${startPercent}%` }}
                    />
                  )}
                  {endPercent < 100 && (
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-black/55 pointer-events-none z-10"
                      style={{ width: `${Math.max(0, 100 - endPercent)}%` }}
                    />
                  )}

                  {/* Playhead */}
                  {duration > 0 && playheadPercent >= 0 && playheadPercent <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none z-30 flex flex-col items-center"
                      style={{ left: `${playheadPercent}%` }}
                    >
                      <div className="w-[2px] h-full bg-white" />
                      <div className="absolute -top-0.5 w-2 h-2 rounded-full bg-white shadow-md" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Time ruler below waveform */}
            <div className="flex items-center justify-between text-[10px] font-mono text-[#4a4f63] px-1 mt-1.5">
              <span>{formatShortTime(visibleStartTime)}</span>
              <span>{formatShortTime(visibleStartTime + visibleDuration * 0.25)}</span>
              <span>{formatShortTime(visibleStartTime + visibleDuration * 0.5)}</span>
              <span>{formatShortTime(visibleStartTime + visibleDuration * 0.75)}</span>
              <span>{formatShortTime(visibleEndTime)}</span>
            </div>
          </div>

          {/* Precise trim inputs */}
          <div className="flex items-center gap-3">
            {/* Start time */}
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Start</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTrimStart(Math.max(0, trimStart - nudgeAmount))}
                  className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Nudge start earlier"
                >
                  <SkipBack size={12} />
                </button>
                <input
                  type="text"
                  value={formatTime(trimStart)}
                  onChange={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (parsed !== null && parsed >= 0 && parsed < trimEnd) {
                      setTrimStart(Math.round(parsed * 1000) / 1000);
                    }
                  }}
                  onBlur={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (parsed !== null && parsed >= 0 && parsed < trimEnd) {
                      setTrimStart(Math.round(parsed * 1000) / 1000);
                      if (audioRef.current) {
                        audioRef.current.currentTime = parsed;
                        setCurrentTime(parsed);
                      }
                    }
                  }}
                  className="flex-1 bg-[#0a0c10] border border-[#1e2030] rounded-[8px] px-2.5 py-1.5 text-[12px] font-mono text-white text-center focus:outline-none focus:ring-1 transition-all"
                  style={{ ['--tw-ring-color' as string]: accent } as React.CSSProperties}
                />
                <button
                  onClick={() => setTrimStart(Math.min(trimEnd - 0.05, trimStart + nudgeAmount))}
                  className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Nudge start later"
                >
                  <SkipForward size={12} />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-[#1e2030] mt-5" />

            {/* End time */}
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">End</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTrimEnd(Math.max(trimStart + 0.05, trimEnd - nudgeAmount))}
                  className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Nudge end earlier"
                >
                  <SkipBack size={12} />
                </button>
                <input
                  type="text"
                  value={formatTime(trimEnd)}
                  onChange={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (parsed !== null && parsed > trimStart && parsed <= duration) {
                      setTrimEnd(Math.round(parsed * 1000) / 1000);
                    }
                  }}
                  onBlur={(e) => {
                    const parsed = parseTimeInput(e.target.value);
                    if (parsed !== null && parsed > trimStart && parsed <= duration) {
                      setTrimEnd(Math.round(parsed * 1000) / 1000);
                    }
                  }}
                  className="flex-1 bg-[#0a0c10] border border-[#1e2030] rounded-[8px] px-2.5 py-1.5 text-[12px] font-mono text-white text-center focus:outline-none focus:ring-1 transition-all"
                  style={{ ['--tw-ring-color' as string]: accent } as React.CSSProperties}
                />
                <button
                  onClick={() => setTrimEnd(Math.min(duration, trimEnd + nudgeAmount))}
                  className="p-1 rounded-md text-[#6b7280] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Nudge end later"
                >
                  <SkipForward size={12} />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-[#1e2030] mt-5" />

            {/* Duration display */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Duration</label>
              <div
                className="px-3 py-1.5 rounded-[8px] text-[12px] font-mono font-bold text-center"
                style={{ backgroundColor: `${accent}15`, color: accent }}
              >
                {formatTime(selectionDuration)}
              </div>
            </div>
          </div>

          {/* Playback and action controls */}
          <div className="flex items-center justify-between pt-3 border-t border-[#1e2030]">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePlay}
                className="px-4 py-2 rounded-[10px] font-bold text-[12px] flex items-center gap-2 transition-all cursor-pointer"
                style={{
                  backgroundColor: isPlaying ? '#ff3b3020' : `${accent}20`,
                  color: isPlaying ? '#ff3b30' : accent,
                  border: `1px solid ${isPlaying ? '#ff3b3030' : `${accent}30`}`,
                }}
              >
                {isPlaying ? (
                  <>
                    <Square size={13} className="fill-current" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Play size={13} className="fill-current" />
                    <span>Preview</span>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => {
                setTrimStart(0);
                setTrimEnd(duration);
                setZoomLevel(1);
                setScrollOffset(0);
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  setCurrentTime(0);
                }
              }}
              className="text-[#6b7280] hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0f1117] border-t border-[#1e2030] flex items-center justify-end gap-3">
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="px-4 py-2 rounded-[10px] text-[12px] font-semibold text-[#6b7280] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-[10px] text-[12px] font-bold text-black flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
            style={{ backgroundColor: accent }}
          >
            <Check size={14} className="stroke-[3]" />
            <span>Apply Trim</span>
          </button>
        </div>
      </div>
    </div>
  );
};
