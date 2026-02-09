/**
 * LiquidGlassPanel - Wrapper component for liquid glass effects
 *
 * Uses liquid-glass-react library when enabled, falls back to
 * static frosted glass styling when disabled.
 */

import React from 'react';
import LiquidGlass from 'liquid-glass-react';
import { useApp } from '../../context/AppContext';

interface LiquidGlassPanelProperties {
  children: React.ReactNode;
  cornerRadius?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Add darker tint for modals with dense text content */
  modalTint?: boolean;
  /** Use subtle treatment for small elements (buttons, badges) - minimal border/shadow */
  subtle?: boolean;
}

export function LiquidGlassPanel({
  children,
  cornerRadius = 16,
  style,
  className = '',
  modalTint = false,
  subtle = false,
}: LiquidGlassPanelProperties) {
  const { state } = useApp();
  const liquidGlassEnabled = state.liquidGlassEnabled;

  // Extract padding to handle separately (library needs it as string)
  const { padding, ...wrapStyle } = style || {};
  const paddingStr = typeof padding === 'number'
    ? `${padding}px`
    : (padding as string | undefined);

  // Build wrapper class names
  const wrapperClasses = [
    liquidGlassEnabled ? 'liquid-glass-wrap' : 'glass-fallback',
    modalTint && liquidGlassEnabled ? 'glass-modal-tint' : '',
    subtle && liquidGlassEnabled ? 'liquid-glass-subtle' : '',
    className,
  ].filter(Boolean).join(' ');

  if (!liquidGlassEnabled) {
    return (
      <div
        className={wrapperClasses}
        style={{ borderRadius: `${cornerRadius}px`, ...wrapStyle, padding: paddingStr }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={wrapperClasses}
      style={{ borderRadius: `${cornerRadius}px`, ...wrapStyle }}
    >
      <LiquidGlass
        cornerRadius={cornerRadius}
        displacementScale={subtle ? 80 : 200}
        blurAmount={subtle ? 0.15 : 0.6}
        saturation={subtle ? 200 : 320}
        aberrationIntensity={subtle ? 2 : 12}
        elasticity={0}
        mode={subtle ? 'standard' : 'prominent'}
        padding={paddingStr}
        style={{ top: '50%', left: '50%' }}
      >
        {children}
      </LiquidGlass>
    </div>
  );
}

export default LiquidGlassPanel;
