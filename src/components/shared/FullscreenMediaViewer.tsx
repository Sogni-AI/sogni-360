import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VersionInfo {
  current: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

interface FullscreenMediaViewerProps {
  type: 'image' | 'video';
  src: string;
  alt?: string;
  onClose: () => void;
  // Version navigation (optional)
  versionInfo?: VersionInfo | null;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
  // When true, navigation loops (buttons always enabled, parent handles looping)
  loop?: boolean;
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
  onClose,
  versionInfo,
  onPrevVersion,
  onNextVersion,
  loop = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Swipe tracking for version navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Keyboard navigation (escape to close, arrows for versions)
  // When loop is true, parent handles looping logic in callbacks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && versionInfo && versionInfo.total > 1 && onPrevVersion) {
        // Allow if can go prev OR if loop is enabled
        if (versionInfo.canPrev || loop) {
          e.preventDefault();
          onPrevVersion();
        }
      } else if (e.key === 'ArrowRight' && versionInfo && versionInfo.total > 1 && onNextVersion) {
        // Allow if can go next OR if loop is enabled
        if (versionInfo.canNext || loop) {
          e.preventDefault();
          onNextVersion();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [versionInfo?.canPrev, versionInfo?.canNext, versionInfo?.total, loop]);

  // Swipe handling for version navigation (touch devices)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!versionInfo || versionInfo.total <= 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [versionInfo]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (!versionInfo || versionInfo.total <= 1) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Only trigger if horizontal swipe is dominant and significant
    if (absX > 50 && absX > absY * 1.5) {
      if (deltaX > 0 && (versionInfo.canPrev || loop) && onPrevVersion) {
        // Swipe right = previous version (or loop to end)
        onPrevVersion();
      } else if (deltaX < 0 && (versionInfo.canNext || loop) && onNextVersion) {
        // Swipe left = next version (or loop to start)
        onNextVersion();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [versionInfo, onPrevVersion, onNextVersion, loop]);

  // Autoplay video when opened or when src changes (version navigation)
  useEffect(() => {
    if (type === 'video' && videoRef.current) {
      // Reset paused state for new video
      setIsPaused(false);
      // Wait for video to be ready before playing
      const video = videoRef.current;
      const tryPlay = () => {
        video.play().catch(() => {
          setIsPaused(true);
        });
      };
      // If video is already loaded, play immediately; otherwise wait for loadeddata
      if (video.readyState >= 3) {
        tryPlay();
      } else {
        video.addEventListener('loadeddata', tryPlay, { once: true });
        return () => video.removeEventListener('loadeddata', tryPlay);
      }
    }
  }, [type, src]);

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

  const showVersionNav = versionInfo && versionInfo.total > 1;

  return (
    <div
      className="fullscreen-media-viewer"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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

      {/* Version navigation - left button */}
      {showVersionNav && (
        <button
          className={`fullscreen-nav-btn fullscreen-nav-prev ${!versionInfo.canPrev && !loop ? 'disabled' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if ((versionInfo.canPrev || loop) && onPrevVersion) onPrevVersion();
          }}
          disabled={!versionInfo.canPrev && !loop}
          aria-label="Previous version"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="32" height="32">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Version navigation - right button */}
      {showVersionNav && (
        <button
          className={`fullscreen-nav-btn fullscreen-nav-next ${!versionInfo.canNext && !loop ? 'disabled' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if ((versionInfo.canNext || loop) && onNextVersion) onNextVersion();
          }}
          disabled={!versionInfo.canNext && !loop}
          aria-label="Next version"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="32" height="32">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Version cycling control - matches card's < v1/3 > style */}
      {showVersionNav && (
        <div className="fullscreen-version-controls">
          <button
            className="ver-btn-fullscreen"
            onClick={(e) => {
              e.stopPropagation();
              if ((versionInfo.canPrev || loop) && onPrevVersion) onPrevVersion();
            }}
            disabled={!versionInfo.canPrev && !loop}
            aria-label="Previous version"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="fullscreen-version-label">v{versionInfo.current}/{versionInfo.total}</span>
          <button
            className="ver-btn-fullscreen"
            onClick={(e) => {
              e.stopPropagation();
              if ((versionInfo.canNext || loop) && onNextVersion) onNextVersion();
            }}
            disabled={!versionInfo.canNext && !loop}
            aria-label="Next version"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

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

    </div>
  );
};

export default FullscreenMediaViewer;
