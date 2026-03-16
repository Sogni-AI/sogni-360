/**
 * usePanelResize — Pointer-based resize handle for centered modal panels.
 * Current rendered size becomes the minimum; panel can only grow.
 * Drag delta is doubled because panel is centered (growth splits to both sides).
 * Desktop only (768px+).
 */

import { useRef, useState, useCallback } from 'react';

interface PanelSize {
  w: number;
  h: number;
}

export function usePanelResize() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState<PanelSize | null>(null);
  const minSizeRef = useRef<PanelSize>({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = panelRef.current!.getBoundingClientRect();
    if (minSizeRef.current.w === 0) {
      minSizeRef.current = { w: rect.width, h: rect.height };
    }
    dragRef.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // ×2 because panel is centered — growth splits evenly to both sides
    const dx = (e.clientX - dragRef.current.x) * 2;
    const dy = (e.clientY - dragRef.current.y) * 2;
    const maxW = window.innerWidth - 32;
    const maxH = window.innerHeight - 32;
    setPanelSize({
      w: Math.min(maxW, Math.max(minSizeRef.current.w, dragRef.current.w + dx)),
      h: Math.min(maxH, Math.max(minSizeRef.current.h, dragRef.current.h + dy)),
    });
  }, []);

  const handleResizePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const resizeStyle: React.CSSProperties | undefined = panelSize
    ? { width: panelSize.w, height: panelSize.h, maxWidth: 'none' }
    : undefined;

  return {
    panelRef,
    panelSize,
    resizeStyle,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
  };
}
