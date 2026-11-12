import React, { useRef, useCallback, useState, useEffect } from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
  className?: string;
  trackClassName?: string;
  fillColor?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  onChange,
  className = '',
  trackClassName = '',
  fillColor = '#31C5F4',
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const trackRectRef = useRef<{ left: number; width: number } | null>(null);
  const latestClientXRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const stepRef = useRef(step);
  stepRef.current = step;

  // Compute percentage clamped between 0 and 100
  const range = max - min;
  const percentage = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 0;

  const computeValueFromClientX = useCallback((clientX: number) => {
    const rect = trackRectRef.current;
    const curMin = minRef.current;
    const curMax = maxRef.current;
    const curStep = stepRef.current;

    if (!rect || rect.width <= 0) return curMin;

    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = offsetX / rect.width;
    const rawVal = curMin + ratio * (curMax - curMin);

    if (curStep > 0) {
      const steppedVal = Math.round((rawVal - curMin) / curStep) * curStep + curMin;
      const decimals = (curStep.toString().split('.')[1] || '').length;
      return Math.max(curMin, Math.min(curMax, Number(steppedVal.toFixed(decimals))));
    }
    return Math.max(curMin, Math.min(curMax, rawVal));
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!isDraggingRef.current) return;
      const newVal = computeValueFromClientX(latestClientXRef.current);
      onChangeRef.current(newVal);
    });
  }, [computeValueFromClientX]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (trackRef.current) {
      const r = trackRef.current.getBoundingClientRect();
      trackRectRef.current = { left: r.left, width: r.width };
    }

    isDraggingRef.current = true;
    setIsDraggingState(true);
    latestClientXRef.current = e.clientX;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const newVal = computeValueFromClientX(e.clientX);
    onChange(newVal);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    latestClientXRef.current = e.clientX;
    scheduleUpdate();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDraggingState(false);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    // Final accurate dispatch
    if (trackRectRef.current) {
      const finalVal = computeValueFromClientX(e.clientX);
      onChange(finalVal);
    }
    trackRectRef.current = null;
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`group relative flex items-center h-4 cursor-pointer select-none touch-none ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${className}`}
    >
      {/* Background Track */}
      <div className={`w-full h-1.5 rounded-full bg-[#0E131A] relative overflow-hidden ${trackClassName}`}>
        {/* Active Fill Track */}
        <div
          style={{
            width: `${percentage}%`,
            backgroundColor: fillColor,
            transition: isDraggingState ? 'none' : 'width 75ms ease-out',
          }}
          className="h-full rounded-full"
        />
      </div>

      {/* Thumb Handle */}
      <div
        style={{
          left: `${percentage}%`,
          borderColor: fillColor,
          transition: isDraggingState ? 'none' : 'transform 75ms ease-out',
        }}
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#090B10] border-2 shadow-md group-hover:scale-110 active:scale-125 pointer-events-none"
      />
    </div>
  );
};
