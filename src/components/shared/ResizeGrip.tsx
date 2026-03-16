/**
 * ResizeGrip — Drag handle for resizable panels. Desktop only (hidden on mobile).
 * Renders a 6-dot triangle grip in the bottom-right corner.
 */

import React from 'react';

interface ResizeGripProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  className?: string;
}

const ResizeGrip: React.FC<ResizeGripProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className = '',
}) => (
  <div
    className={`hidden md:flex absolute bottom-1.5 right-1.5 w-5 h-5 items-center justify-center cursor-nwse-resize touch-none select-none z-10 ${className}`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
  >
    <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/25">
      <circle cx="8" cy="2" r="1" fill="currentColor" />
      <circle cx="8" cy="5.5" r="1" fill="currentColor" />
      <circle cx="8" cy="9" r="1" fill="currentColor" />
      <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="9" r="1" fill="currentColor" />
      <circle cx="1" cy="9" r="1" fill="currentColor" />
    </svg>
  </div>
);

export default ResizeGrip;
