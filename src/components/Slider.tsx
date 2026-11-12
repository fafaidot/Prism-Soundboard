import React, { useRef, useCallback, useEffect } from 'react';

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

  // Compute percentage clamped between 0 and 100
  const range = max - min;
  const percentage = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 0;

  const calculateValueFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return value;
      const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = offsetX / rect.width;
      const rawVal = min + ratio * (max - min);

      if (step > 0) {
        const steppedVal = Math.round((rawVal - min) / step) * step + min;
        // Fix float precision issues (e.g. 1.00000000002)
        const decimals = (step.toString().split('.')[1] || '').length;
        const clamped = Math.max(min, Math.min(max, Number(steppedVal.toFixed(decimals))));
        return clamped;
      }
      return Math.max(min, Math.min(max, rawVal));
    },
    [min, max, step, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;

    // Capture pointer on target if available
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const newVal = calculateValueFromPointer(e.clientX);
    onChange(newVal);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const newVal = calculateValueFromPointer(e.clientX);
    onChange(newVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
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
          }}
          className="h-full rounded-full transition-[width] duration-75 ease-out"
        />
      </div>

      {/* Thumb Handle */}
      <div
        style={{
          left: `${percentage}%`,
          borderColor: fillColor,
        }}
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#090B10] border-2 shadow-md transition-transform duration-75 group-hover:scale-110 active:scale-125 pointer-events-none"
      />
    </div>
  );
};
