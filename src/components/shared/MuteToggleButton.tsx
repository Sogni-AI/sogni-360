/**
 * MuteToggleButton
 *
 * Shared mute/unmute toggle button with speaker SVG icons.
 * Uses glass-style aesthetics consistent with the app design.
 */

import React from 'react';

interface MuteToggleButtonProps {
  muted: boolean;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

const SIZES = { sm: 32, md: 40 } as const;
const ICON_SIZES = { sm: 14, md: 18 } as const;
const MIN_TOUCH = 44;

const MuteToggleButton: React.FC<MuteToggleButtonProps> = ({ muted, onToggle, className = '', size = 'md' }) => {
  const btnSize = SIZES[size];
  const iconSize = ICON_SIZES[size];

  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? 'Unmute' : 'Mute'}
      style={{
        width: `${btnSize}px`,
        height: `${btnSize}px`,
        minWidth: `${MIN_TOUCH}px`,
        minHeight: `${MIN_TOUCH}px`,
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'white',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {muted ? (
        /* Speaker off icon */
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        /* Speaker on icon */
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M19.07 4.93a10 10 0 010 14.14" />
          <path d="M15.54 8.46a5 5 0 010 7.07" />
        </svg>
      )}
    </button>
  );
};

export default MuteToggleButton;
