import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { Segment } from '../types';
import FullscreenMediaViewer from './shared/FullscreenMediaViewer';
import { useLazyLoad } from '../hooks/useLazyLoad';
import { getCachedBlobUrl, preloadVideo } from '../utils/videoBlobCache';

interface TransitionVideoCardProps {
  segment: Segment;
  index: number;
  totalSegments: number;
  thumbAspect: number;
  fromImageUrl?: string;
  toImageUrl?: string;
  fromLabel: string;
  toLabel: string;
  versionInfo: { current: number; total: number; canPrev: boolean; canNext: boolean } | null;
  onPrevVersion: () => void;
  onNextVersion: () => void;
  onRegenerate: () => void;
  onDownload: () => void;
  onDelete: () => void;
  isDownloading: boolean;
}

/**
 * Individual video card component with proper autoplay and play/pause controls
 */
const TransitionVideoCard: React.FC<TransitionVideoCardProps> = ({
  segment,
  index,
  totalSegments,
  thumbAspect,
  fromImageUrl,
  toImageUrl,
  fromLabel,
  toLabel,
  versionInfo,
  onPrevVersion,
  onNextVersion,
  onRegenerate,
  onDownload,
  onDelete,
  isDownloading
}) => {
  const canDelete = totalSegments > 1;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false); // Track if user manually paused
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
  const hasEverBeenVisible = useRef(false); // Track if card has ever been visible (for lazy loading)

  // Single observer for real-time visibility tracking
  const { ref: cardRef, isVisible: isCurrentlyVisible } = useLazyLoad({ rootMargin: '50px', once: false });

  // Track if card has ever been visible (for lazy loading the video src)
  const hasBeenVisible = isCurrentlyVisible || hasEverBeenVisible.current;
  if (isCurrentlyVisible && !hasEverBeenVisible.current) {
    hasEverBeenVisible.current = true;
  }

  // Get blob URL from cache or preload video when visible
  // This ensures we use cached blob URLs for reliable playback
  useEffect(() => {
    if (!segment.videoUrl || !hasBeenVisible) return;

    // Check if already cached
    const cached = getCachedBlobUrl(segment.videoUrl);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    // Not cached - preload the video
    preloadVideo(segment.videoUrl).then(url => {
      if (url) {
        setBlobUrl(url);
      }
    });
  }, [segment.videoUrl, hasBeenVisible]);

  // Reset states when video URL changes
  useEffect(() => {
    setVideoLoaded(false);
    setUserPaused(false); // Reset user pause preference for new video
    // Check if new URL is already cached
    if (segment.videoUrl) {
      const cached = getCachedBlobUrl(segment.videoUrl);
      setBlobUrl(cached);
    } else {
      setBlobUrl(undefined);
    }
  }, [segment.videoUrl]);

  // Pause videos when scrolled out of view to free browser resources
  // Autoplay is handled by the native autoplay attribute on muted videos
  useEffect(() => {
    if (segment.status !== 'ready' || !segment.videoUrl || !videoRef.current || !videoLoaded) {
      return;
    }

    if (!isCurrentlyVisible) {
      // Not visible - pause to free up browser resources
      videoRef.current.pause();
      setIsPaused(true);
    } else if (!userPaused) {
      // Visible and not user-paused - ensure playing
      // This handles the case where video was paused due to scrolling out of view
      videoRef.current.play().catch(() => {
        setIsPaused(true);
      });
      setIsPaused(false);
    }
  }, [segment.status, segment.videoUrl, isCurrentlyVisible, videoLoaded, userPaused]);

  // Handle play/pause toggle (user-initiated)
  const handleVideoToggle = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPaused(false);
      setUserPaused(false); // User wants it to play
    } else {
      videoRef.current.pause();
      setIsPaused(true);
      setUserPaused(true); // User wants it paused
    }
  }, []);

  // Track video play/pause state
  const handlePlay = useCallback(() => setIsPaused(false), []);
  const handlePause = useCallback(() => setIsPaused(true), []);

  // Track when video has loaded enough to display
  const handleVideoLoaded = useCallback(() => setVideoLoaded(true), []);

  return (
    <div ref={cardRef} className="transition-card">
      {/* Card Header */}
      <div className="transition-card-header">
        <span className="transition-card-title">Transition {index + 1}</span>
        <div className="transition-header-right">
          {segment.status === 'ready' && (
            <span className="transition-status-pill ready">Ready</span>
          )}
          {segment.status === 'generating' && (
            <span className="transition-status-pill generating">
              {Math.round(segment.progress || 0)}%
            </span>
          )}
          {segment.status === 'failed' && (
            <span className="transition-status-pill failed">Failed</span>
          )}
          {segment.status === 'pending' && (
            <span className="transition-status-pill pending">Pending</span>
          )}
          {/* Delete button */}
          <button
            className={`transition-delete-btn ${!canDelete ? 'hidden' : ''}`}
            onClick={onDelete}
            title={totalSegments <= 1 ? 'At least one transition required' : 'Remove this transition'}
            disabled={!canDelete}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Preview Area - fills available space in card */}
      <div className="transition-card-preview">
        {segment.status === 'ready' && segment.videoUrl ? (
          /* Ready - show video with autoplay, tap to open fullscreen */
          <div
            className={`transition-video-wrap ${!videoLoaded ? 'loading' : ''}`}
            onClick={() => setShowFullscreen(true)}
          >
            <video
              ref={videoRef}
              src={hasBeenVisible ? (blobUrl || segment.videoUrl) : undefined}
              autoPlay
              loop
              muted
              playsInline
              onPlay={handlePlay}
              onPause={handlePause}
              onLoadedData={handleVideoLoaded}
              style={{ opacity: videoLoaded ? 1 : 0 }}
            />
            {/* Corner play/pause button */}
            <button
              className="video-corner-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleVideoToggle();
              }}
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
            <div className="transition-ready-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        ) : (
          /* Not ready - show thumbnails and separate progress row */
          <>
            {/* Thumbnails - stacked for landscape, side by side for portrait */}
            <div className={`transition-thumbs-row ${thumbAspect > 1 ? 'stacked' : ''}`}>
              <div className="transition-thumb" style={{ aspectRatio: thumbAspect }}>
                {fromImageUrl && <img src={fromImageUrl} alt="From" loading="lazy" />}
                <span className="thumb-label">From</span>
              </div>
              <div className="transition-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="transition-thumb" style={{ aspectRatio: thumbAspect }}>
                {toImageUrl && <img src={toImageUrl} alt="To" loading="lazy" />}
                <span className="thumb-label">To</span>
              </div>
            </div>

            {/* Progress/Status Row - separate from thumbnails */}
            {segment.status === 'generating' && (
              <div className="transition-progress-row">
                <div className="progress-ring-inline">
                  <svg viewBox="0 0 100 100">
                    <circle className="ring-bg" cx="50" cy="50" r="42" />
                    <circle
                      className="ring-fill"
                      cx="50"
                      cy="50"
                      r="42"
                      strokeDasharray={`${(segment.progress || 0) * 2.64} 264`}
                    />
                  </svg>
                </div>
                <span className="progress-text">Generating... {Math.round(segment.progress || 0)}%</span>
              </div>
            )}
            {segment.status === 'failed' && (
              <div className="transition-status-row failed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Generation failed</span>
              </div>
            )}
            {segment.status === 'pending' && (
              <div className="transition-status-row pending">
                <span>Waiting to generate...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card Footer - Fixed structure for alignment */}
      <div className="transition-card-footer">
        <div className="transition-angle-info">
          {fromLabel} → {toLabel}
        </div>

        {/* Version row - always rendered to maintain consistent height */}
        <div className={`transition-versions ${!versionInfo ? 'hidden' : ''}`}>
          {versionInfo ? (
            <>
              <button
                className="ver-btn-sm"
                onClick={onPrevVersion}
                disabled={!versionInfo.canPrev}
              >
                ‹
              </button>
              <span>v{versionInfo.current}/{versionInfo.total}</span>
              <button
                className="ver-btn-sm"
                onClick={onNextVersion}
                disabled={!versionInfo.canNext}
              >
                ›
              </button>
            </>
          ) : (
            <span className="version-placeholder">v1/1</span>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="transition-card-actions">
          {/* Download Button - Only when ready with video */}
          <button
            className={`transition-action-btn download ${segment.status !== 'ready' || !segment.videoUrl ? 'invisible' : ''}`}
            onClick={onDownload}
            disabled={segment.status !== 'ready' || !segment.videoUrl || isDownloading}
          >
            {isDownloading ? (
              <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Download
          </button>

          {/* Regenerate Button - always enabled to allow cancel & retry */}
          <button
            className="transition-action-btn regen"
            onClick={onRegenerate}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {segment.status === 'generating' ? 'Restart' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Fullscreen video viewer with version navigation */}
      {showFullscreen && segment.videoUrl && (
        <FullscreenMediaViewer
          type="video"
          src={blobUrl || segment.videoUrl}
          onClose={() => setShowFullscreen(false)}
          versionInfo={versionInfo}
          onPrevVersion={onPrevVersion}
          onNextVersion={onNextVersion}
          loop
        />
      )}
    </div>
  );
};

export default TransitionVideoCard;
