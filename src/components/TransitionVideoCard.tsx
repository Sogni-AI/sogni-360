import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { Segment } from '../types';

interface TransitionVideoCardProps {
  segment: Segment;
  index: number;
  thumbAspect: number;
  sourceAspectRatio: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  fromLabel: string;
  toLabel: string;
  versionInfo: { current: number; total: number; canPrev: boolean; canNext: boolean } | null;
  onPrevVersion: () => void;
  onNextVersion: () => void;
  onRegenerate: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}

/**
 * Individual video card component with proper autoplay and play/pause controls
 */
const TransitionVideoCard: React.FC<TransitionVideoCardProps> = ({
  segment,
  index,
  thumbAspect,
  sourceAspectRatio,
  fromImageUrl,
  toImageUrl,
  fromLabel,
  toLabel,
  versionInfo,
  onPrevVersion,
  onNextVersion,
  onRegenerate,
  onDownload,
  isDownloading
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Autoplay videos when they become ready
  useEffect(() => {
    if (segment.status === 'ready' && segment.videoUrl && videoRef.current) {
      // Small delay to ensure video element is mounted
      const timer = setTimeout(() => {
        videoRef.current?.play().catch(() => {
          // Autoplay blocked - user interaction required
          setIsPaused(true);
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [segment.status, segment.videoUrl]);

  // Handle play/pause toggle
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

  // Track video play/pause state
  const handlePlay = useCallback(() => setIsPaused(false), []);
  const handlePause = useCallback(() => setIsPaused(true), []);

  return (
    <div className="transition-card">
      {/* Card Header */}
      <div className="transition-card-header">
        <span className="transition-card-title">Transition {index + 1}</span>
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
      </div>

      {/* Preview Area */}
      <div className="transition-card-preview">
        {segment.status === 'ready' && segment.videoUrl ? (
          /* Ready - show video with autoplay */
          <div
            className="transition-video-wrap"
            onClick={handleVideoToggle}
            style={{ aspectRatio: sourceAspectRatio }}
          >
            <video
              ref={videoRef}
              src={segment.videoUrl}
              loop
              muted
              playsInline
              onPlay={handlePlay}
              onPause={handlePause}
            />
            {/* Show play button overlay when paused */}
            {isPaused && (
              <div className="video-play-overlay">
                <div className="video-play-btn">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            )}
            {/* Show pause indicator when playing (tap to pause hint) */}
            {!isPaused && (
              <div className="video-playing-indicator">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </div>
            )}
            <div className="transition-ready-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        ) : (
          /* Not ready - show thumbnails and separate progress row */
          <>
            {/* Thumbnails Row - From → To */}
            <div className="transition-thumbs-row">
              <div className="transition-thumb" style={{ aspectRatio: thumbAspect }}>
                {fromImageUrl && <img src={fromImageUrl} alt="From" />}
                <span className="thumb-label">From</span>
              </div>
              <div className="transition-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="transition-thumb" style={{ aspectRatio: thumbAspect }}>
                {toImageUrl && <img src={toImageUrl} alt="To" />}
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

          {/* Regenerate Button */}
          <button
            className={`transition-action-btn regen ${segment.status === 'generating' ? 'disabled' : ''}`}
            onClick={onRegenerate}
            disabled={segment.status === 'generating'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransitionVideoCard;
