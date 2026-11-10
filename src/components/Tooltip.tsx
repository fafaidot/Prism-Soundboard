import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface GlobalTooltipState {
  text: string;
  x: number;
  y: number;
  position: 'top' | 'bottom';
  visible: boolean;
}

export const GlobalTooltipProvider: React.FC = () => {
  const [tooltip, setTooltip] = useState<GlobalTooltipState>({
    text: '',
    x: 0,
    y: 0,
    position: 'top',
    visible: false,
  });

  const timerRef = useRef<any>(null);
  const currentTargetRef = useRef<Element | null>(null);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-tooltip], [title]');
      if (!target) return;

      // If it has title, transfer it to data-tooltip to suppress the browser's default ugly tooltip!
      if (target.hasAttribute('title')) {
        const titleVal = target.getAttribute('title');
        if (titleVal && titleVal.trim()) {
          target.setAttribute('data-tooltip', titleVal);
          target.removeAttribute('title');
        }
      }

      const text = target.getAttribute('data-tooltip');
      if (!text || !text.trim()) return;

      currentTargetRef.current = target;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (currentTargetRef.current !== target) return;

        const rect = target.getBoundingClientRect();
        const preferredPos = (target.getAttribute('data-tooltip-pos') as 'top' | 'bottom') || 
          (rect.top < 60 ? 'bottom' : 'top');

        let x = rect.left + rect.width / 2;
        let y = preferredPos === 'bottom' ? rect.bottom + 8 : rect.top - 8;

        // Keep within viewport horizontally
        x = Math.max(16, Math.min(window.innerWidth - 16, x));

        setTooltip({
          text,
          x,
          y,
          position: preferredPos,
          visible: true,
        });
      }, 180);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-tooltip], [title]');
      if (target && target === currentTargetRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        currentTargetRef.current = null;
        setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
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

  if (!tooltip.visible || !tooltip.text) return null;

  return createPortal(
    <div
      className="fixed z-[999999] pointer-events-none transition-opacity duration-150 animate-in fade-in zoom-in-95"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: tooltip.position === 'bottom' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      <div className="px-2.5 py-1.5 rounded-[9px] bg-[#12141c]/95 border border-[#2b3142] text-white text-[11px] font-semibold tracking-wide whitespace-nowrap shadow-[0_8px_25px_rgba(0,0,0,0.85)] backdrop-blur-md flex items-center gap-1.5">
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
  position = 'bottom',
  delay = 200,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<any>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = position === 'bottom' ? rect.bottom + 8 : rect.top - 8;
        if (position === 'left') {
          x = rect.left - 8;
          y = rect.top + rect.height / 2;
        } else if (position === 'right') {
          x = rect.right + 8;
          y = rect.top + rect.height / 2;
        }
        setCoords({ x, y });
        setIsVisible(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const getTransform = () => {
    if (position === 'bottom') return 'translate(-50%, 0)';
    if (position === 'top') return 'translate(-50%, -100%)';
    if (position === 'left') return 'translate(-100%, -50%)';
    return 'translate(0, -50%)';
  };

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
      {isVisible && coords && content &&
        createPortal(
          <div
            className="fixed z-[999999] pointer-events-none transition-opacity duration-150 animate-in fade-in zoom-in-95"
            style={{
              left: `${coords.x}px`,
              top: `${coords.y}px`,
              transform: getTransform(),
            }}
          >
            <div className="px-2.5 py-1.5 rounded-[9px] bg-[#12141c]/95 border border-[#2b3142] text-white text-[11px] font-semibold tracking-wide whitespace-nowrap shadow-[0_8px_25px_rgba(0,0,0,0.85)] backdrop-blur-md flex items-center gap-1.5">
              {content}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
