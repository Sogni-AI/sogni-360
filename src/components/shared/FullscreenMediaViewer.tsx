import React, { useCallback, useEffect, useRef, useState } from 'react';

interface FullscreenMediaViewerProps {
  type: 'image' | 'video';
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Fullscreen modal for viewing images or videos
 * - Images: tap/click anywhere to close
 * - Videos: tap/click video to play/pause, tap X button to close
 */
const FullscreenMediaViewer: React.FC<FullscreenMediaViewerProps> = ({
  type,
  src,
  alt = '',
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Autoplay video when opened
  useEffect(() => {
    if (type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {
        setIsPaused(true);
      });
    }
  }, [type]);

  const handleVideoToggle = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const handlePlay = useCallback(() => setIsPaused(false), []);
  const handlePause = useCallback(() => setIsPaused(true), []);

  const handleBackdropClick = useCallback(() => {
    // For images, close on any click
    // For videos, only close if clicking outside the video
    if (type === 'image') {
      onClose();
    }
  }, [type, onClose]);

  return (
    <div
      className="fullscreen-media-viewer"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        className="fullscreen-close-btn"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="24" height="24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {type === 'image' ? (
        <img
          src={src}
          alt={alt}
          className="fullscreen-media-content"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className="fullscreen-video-container"
          onClick={(e) => {
            e.stopPropagation();
            handleVideoToggle();
          }}
        >
          <video
            ref={videoRef}
            src={src}
            loop
            muted
            playsInline
            className="fullscreen-media-content"
            onPlay={handlePlay}
            onPause={handlePause}
          />
          {/* Play/Pause overlay */}
          {isPaused && (
            <div className="fullscreen-play-overlay">
              <div className="fullscreen-play-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tap to close hint for images */}
      {type === 'image' && (
        <div className="fullscreen-hint">Tap anywhere to close</div>
      )}
    </div>
  );
};

export default FullscreenMediaViewer;
