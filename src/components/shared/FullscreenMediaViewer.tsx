import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioManager } from '../../context/AudioManagerContext';
import MuteToggleButton from './MuteToggleButton';

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
  versionInfo?: VersionInfo | null;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
  loop?: boolean;
  videoModel?: string;
}

/** Fullscreen modal for viewing images or videos */
const FullscreenMediaViewer: React.FC<FullscreenMediaViewerProps> = ({
  type,
  src,
  alt = '',
  onClose,
  versionInfo,
  onPrevVersion,
  onNextVersion,
  loop = false,
  videoModel
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // LTX audio support
  const audioManager = useAudioManager();
  const isLtx = videoModel === 'ltx2.3';
  const fullscreenAudioId = `fullscreen-${src.substring(0, 40)}`;
  const isAudioActive = audioManager.activeAudioId === fullscreenAudioId;
  const hasAudio = isLtx && isAudioActive;

  // Register/unregister with AudioManager (user taps mute button to unmute)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLtx || type !== 'video') return;
    audioManager.register(fullscreenAudioId, video);
    return () => {
      audioManager.releaseAudio(fullscreenAudioId);
      audioManager.unregister(fullscreenAudioId);
    };
  }, [fullscreenAudioId, isLtx, type]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Keyboard navigation (escape to close, arrows for versions)
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

    if (absX > 50 && absX > absY * 1.5) {
      if (deltaX > 0 && (versionInfo.canPrev || loop) && onPrevVersion) {
        onPrevVersion();
      } else if (deltaX < 0 && (versionInfo.canNext || loop) && onNextVersion) {
        onNextVersion();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [versionInfo, onPrevVersion, onNextVersion, loop]);

  useEffect(() => {
    if (type !== 'video' || !videoRef.current) return;
    setIsPaused(false);
    const video = videoRef.current;
    const tryPlay = () => { video.play().catch(() => setIsPaused(true)); };
    if (video.readyState >= 3) {
      tryPlay();
    } else {
      video.addEventListener('loadeddata', tryPlay, { once: true });
      return () => video.removeEventListener('loadeddata', tryPlay);
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
            muted={!hasAudio}
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
          {/* LTX audio mute toggle - bottom-right */}
          {isLtx && (
            <div style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 10 }}>
              <MuteToggleButton
                muted={!hasAudio}
                onToggle={() => {
                  if (isAudioActive) {
                    audioManager.releaseAudio(fullscreenAudioId);
                  } else {
                    audioManager.claimAudio(fullscreenAudioId);
                  }
                }}
                size="md"
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default FullscreenMediaViewer;
