import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface GlobalTooltipState {
  text: string;
  visible: boolean;
}

/**
 * Computes exact pixel coordinates (left, top) ensuring the tooltip
 * is strictly contained within the window viewport, avoiding clipping
 * at left, right, top, and bottom edges.
 */
function computeClampedPosition(
  targetEl: HTMLElement,
  tipEl: HTMLElement,
  requestedPos?: 'top' | 'bottom' | 'left' | 'right' | null
): { left: number; top: number } {
  const tRect = targetEl.getBoundingClientRect();
  const tipRect = tipEl.getBoundingClientRect();
  const w = tipRect.width;
  const h = tipRect.height;
  const MARGIN = 12; // minimum distance in px from any window edge
  const GAP = 8;     // clearance from the target element

  let side = requestedPos;

  if (!side) {
    // Intelligent edge auto-detection based on viewport position
    if (tRect.left < 75 && tRect.top > 35 && tRect.bottom < window.innerHeight - 35) {
      // Left navigation rail / left-docked controls: place to the right
      side = 'right';
    } else if (tRect.right > window.innerWidth - 75 && tRect.top > 35 && tRect.bottom < window.innerHeight - 35) {
      // Right edge controls: place to the left
      side = 'left';
    } else if (tRect.top < 60) {
      // Near top of window (e.g. TitleBar, CommandBar): place below
      side = 'bottom';
    } else if (tRect.bottom > window.innerHeight - 65) {
      // Near bottom of window (e.g. BottomToolbar): place above
      side = 'top';
    } else {
      // Default: place above
      side = 'top';
    }
  }

  let left = 0;
  let top = 0;

  if (side === 'right') {
    left = tRect.right + GAP;
    top = tRect.top + tRect.height / 2 - h / 2;
    // If overflowing right window edge, flip to left if space permits
    if (left + w > window.innerWidth - MARGIN && tRect.left - GAP - w >= MARGIN) {
      left = tRect.left - GAP - w;
    }
  } else if (side === 'left') {
    left = tRect.left - GAP - w;
    top = tRect.top + tRect.height / 2 - h / 2;
    // If overflowing left window edge, flip to right if space permits
    if (left < MARGIN && tRect.right + GAP + w <= window.innerWidth - MARGIN) {
      left = tRect.right + GAP;
    }
  } else if (side === 'bottom') {
    left = tRect.left + tRect.width / 2 - w / 2;
    top = tRect.bottom + GAP;
    // If overflowing bottom window edge, flip to top if space permits
    if (top + h > window.innerHeight - MARGIN && tRect.top - GAP - h >= MARGIN) {
      top = tRect.top - GAP - h;
    }
  } else {
    // 'top'
    left = tRect.left + tRect.width / 2 - w / 2;
    top = tRect.top - GAP - h;
    // If overflowing top window edge, flip to bottom if space permits
    if (top < MARGIN && tRect.bottom + GAP + h <= window.innerHeight - MARGIN) {
      top = tRect.bottom + GAP;
    }
  }

  // HARD VIEWPORT CLAMP: Guarantees [left, left + w] and [top, top + h] remain strictly within window bounds
  left = Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, left));
  top = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, top));

  return { left: Math.round(left), top: Math.round(top) };
}

export const GlobalTooltipProvider: React.FC = () => {
  const [tooltip, setTooltip] = useState<GlobalTooltipState>({
    text: '',
    visible: false,
  });

  const timerRef = useRef<any>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const eventTarget = e.target as HTMLElement | null;
      if (!eventTarget) return;

      // Fast-path: moving within the currently hovered tooltip target shouldn't re-query or toggle state
      if (currentTargetRef.current && currentTargetRef.current.contains(eventTarget)) {
        return;
      }

      const target = eventTarget.closest('[data-tooltip], [title]') as HTMLElement | null;
      if (!target) return;

      // Transfer native title to data-tooltip to suppress browser native tooltip
      if (target.hasAttribute('title')) {
        const titleVal = target.getAttribute('title');
        if (titleVal && titleVal.trim()) {
          target.setAttribute('data-tooltip', titleVal);
          target.removeAttribute('title');
        }
      }

      if (currentTargetRef.current === target) return;

      const text = target.getAttribute('data-tooltip');
      if (!text || !text.trim()) return;

      currentTargetRef.current = target;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (currentTargetRef.current !== target) return;
        setTooltip({
          text,
          visible: true,
        });
      }, 160);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-tooltip], [title]');
      if (!target || target !== currentTargetRef.current) return;
      // Ignore child transitions inside the same button/element so tooltips and cursor never flicker
      if (e.relatedTarget && target.contains(e.relatedTarget as Node)) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      currentTargetRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleMouseDown = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      currentTargetRef.current = null;
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    window.addEventListener('mouseover', handleMouseOver, true);
    window.addEventListener('mouseout', handleMouseOut, true);
    window.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      window.removeEventListener('mouseover', handleMouseOver, true);
      window.removeEventListener('mouseout', handleMouseOut, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip.visible || !tooltipRef.current || !currentTargetRef.current) return;

    const requestedPos = currentTargetRef.current.getAttribute('data-tooltip-pos') as
      | 'top'
      | 'bottom'
      | 'left'
      | 'right'
      | null;

    const { left, top } = computeClampedPosition(currentTargetRef.current, tooltipRef.current, requestedPos);

    tooltipRef.current.style.left = `${left}px`;
    tooltipRef.current.style.top = `${top}px`;
    tooltipRef.current.style.opacity = '1';
  }, [tooltip.visible, tooltip.text]);

  if (!tooltip.visible || !tooltip.text) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[999999] pointer-events-none select-none transition-opacity duration-150"
      style={{
        left: '0px',
        top: '0px',
        opacity: 0,
      }}
    >
      <div className="px-2.5 py-1.5 rounded-lg bg-[#0e1219]/95 border border-white/10 text-white text-[11px] font-medium tracking-normal shadow-2xl backdrop-blur-md flex items-center gap-1.5 max-w-[280px] break-words text-left leading-snug">
        {tooltip.text}
      </div>
    </div>,
    document.body
  );
};

// Also export the component Tooltip so existing wrappers work seamlessly
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position,
  delay = 180,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<any>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current || !triggerRef.current) return;

    const { left, top } = computeClampedPosition(triggerRef.current, tooltipRef.current, position);

    tooltipRef.current.style.left = `${left}px`;
    tooltipRef.current.style.top = `${top}px`;
    tooltipRef.current.style.opacity = '1';
  }, [isVisible, content, position]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && content &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[999999] pointer-events-none select-none transition-opacity duration-150"
            style={{
              left: '0px',
              top: '0px',
              opacity: 0,
            }}
          >
            <div className="px-2.5 py-1.5 rounded-lg bg-[#0e1219]/95 border border-white/10 text-white text-[11px] font-medium tracking-normal shadow-2xl backdrop-blur-md flex items-center gap-1.5 max-w-[280px] break-words text-left leading-snug">
              {content}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
