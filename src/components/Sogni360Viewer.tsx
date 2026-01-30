import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';
import { useToast } from '../context/ToastContext';

const Sogni360Viewer: React.FC = () => {
  const { state, dispatch } = useApp();
  const { currentProject, currentWaypointIndex, isPlaying } = state;
  const { showToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  // Track the displayed image dimensions for scaling video to match
  const [imageDisplaySize, setImageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const {
    nextWaypoint,
    previousWaypoint,
    navigateToWaypoint,
    togglePlayback,
    isTransitionPlaying,
    playReverse,
    handleTransitionEnd,
    handleVideoCanPlay,
    getCurrentContent
  } = useTransitionNavigation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement>(null);
  const content = getCurrentContent();

  // Local state to track when DOM video element is actually ready to play
  // This is separate from the preload cache - the actual video element needs to load too
  const [isVideoElementReady, setIsVideoElementReady] = useState(false);

  // Reset video ready state when content URL changes
  useEffect(() => {
    setIsVideoElementReady(false);
  }, [content?.url]);

  // Check if sequence is complete (has transitions to play)
  const waypoints = currentProject?.waypoints || [];
  const segments = currentProject?.segments || [];
  const readyWaypointCount = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl).length;
  const readySegmentCount = segments.filter(s => s.status === 'ready' && s.videoUrl).length;
  const hasPlayableSequence = readyWaypointCount >= 2 && readySegmentCount > 0;
  const hasFinalVideo = !!currentProject?.finalLoopUrl;

  // Download handler for stitched video
  const handleDownloadLoop = useCallback(async () => {
    if (!currentProject?.finalLoopUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(currentProject.finalLoopUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = `sogni-360-loop-${Date.now()}.mp4`;

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download error:', error);
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  }, [currentProject?.finalLoopUrl, isDownloading, showToast]);

  // Reverse playback state
  const reverseAnimationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Track background image size for scaling video to match
  useEffect(() => {
    const updateImageSize = () => {
      const img = backgroundImageRef.current || imageRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        setImageDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
      }
    };

    // Update on image load and window resize
    updateImageSize();
    window.addEventListener('resize', updateImageSize);
    return () => window.removeEventListener('resize', updateImageSize);
  }, [content?.url, content?.type]);

  // Handle reverse video playback using requestAnimationFrame
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playReverse || content?.type !== 'video') {
      // Clean up animation frame if conditions change
      if (reverseAnimationRef.current) {
        cancelAnimationFrame(reverseAnimationRef.current);
        reverseAnimationRef.current = null;
      }
      return;
    }

    // Start reverse playback animation loop
    const animateReverse = (timestamp: number) => {
      if (!video || video.paused === false) {
        // Pause the video - we're manually controlling playback
        video.pause();
      }

      // Initialize timing on first frame
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
        reverseAnimationRef.current = requestAnimationFrame(animateReverse);
        return;
      }

      // Calculate time delta and step backwards
      const deltaTime = (timestamp - lastTimeRef.current) / 1000; // Convert to seconds
      lastTimeRef.current = timestamp;

      // Step backwards (1x playback rate in reverse)
      const newTime = video.currentTime - deltaTime;

      if (newTime <= 0) {
        // Reached the start - end transition
        video.currentTime = 0;
        reverseAnimationRef.current = null;
        lastTimeRef.current = 0;
        handleTransitionEnd();
        return;
      }

      video.currentTime = newTime;
      reverseAnimationRef.current = requestAnimationFrame(animateReverse);
    };

    // Start animation when video is ready
    const startReverse = () => {
      if (video.duration && video.duration > 0) {
        setIsVideoElementReady(true);
        video.currentTime = video.duration;
        lastTimeRef.current = 0;
        reverseAnimationRef.current = requestAnimationFrame(animateReverse);
      }
    };

    // Wait for canplaythrough to ensure video is fully buffered
    const handleCanPlayThrough = () => {
      startReverse();
    };

    // If video is already fully loaded, start immediately
    if (video.readyState >= 4 && video.duration > 0) {
      startReverse();
    } else {
      // Wait for video to be fully buffered before starting reverse playback
      video.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });
    }

    return () => {
      if (reverseAnimationRef.current) {
        cancelAnimationFrame(reverseAnimationRef.current);
        reverseAnimationRef.current = null;
      }
      lastTimeRef.current = 0;
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [playReverse, content?.type, content?.url, handleTransitionEnd]);

  // Handle click zones - stop auto-play when user manually navigates
  const handleLeftClick = useCallback(() => {
    if (isPlaying) {
      dispatch({ type: 'SET_PLAYING', payload: false });
    }
    previousWaypoint();
  }, [previousWaypoint, isPlaying, dispatch]);

  const handleCenterClick = useCallback(() => {
    togglePlayback();
  }, [togglePlayback]);

  const handleRightClick = useCallback(() => {
    if (isPlaying) {
      dispatch({ type: 'SET_PLAYING', payload: false });
    }
    nextWaypoint();
  }, [nextWaypoint, isPlaying, dispatch]);

  // Touch/swipe handling
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };

    const deltaX = touchEnd.x - touchStartRef.current.x;
    const deltaY = touchEnd.y - touchStartRef.current.y;

    // Determine if it's a horizontal swipe (vs vertical or tap)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      // Stop auto-play when user manually swipes
      if (isPlaying) {
        dispatch({ type: 'SET_PLAYING', payload: false });
      }
      if (deltaX > 0) {
        // Swipe right - go to previous
        previousWaypoint();
      } else {
        // Swipe left - go to next
        nextWaypoint();
      }
    } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      // Tap - toggle playback
      togglePlayback();
    }

    touchStartRef.current = null;
  }, [nextWaypoint, previousWaypoint, togglePlayback, isPlaying, dispatch]);

  if (!content) {
    return (
      <div className="sogni-360-viewer flex items-center justify-center text-white">
        <p>No content to display</p>
      </div>
    );
  }

  return (
    <div
      className="sogni-360-viewer"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Image or Video display */}
      {content.type === 'image' ? (
        <img
          ref={imageRef}
          src={content.url}
          alt="Current view"
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setImageDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
          }}
        />
      ) : (
        <div className="video-container">
          {/* Source image shown while video loads - prevents black flash */}
          {(content.sourceImageUrl || content.destinationImageUrl) && (
            <img
              ref={backgroundImageRef}
              src={isVideoElementReady
                ? (content.destinationImageUrl || content.sourceImageUrl!)
                : (content.sourceImageUrl || content.destinationImageUrl!)}
              alt={isVideoElementReady ? "Destination" : "Source"}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
              }}
            />
          )}
          {/* Video element layered on top - only visible when fully loaded */}
          <video
            ref={videoRef}
            key={content.url + (playReverse ? '-reverse' : '')}
            src={content.url}
            className={`video-overlay transition-opacity duration-150 ${
              isVideoElementReady ? 'opacity-100' : 'opacity-0'
            }`}
            style={imageDisplaySize ? {
              width: `${imageDisplaySize.width}px`,
              height: `${imageDisplaySize.height}px`,
              objectFit: 'cover'
            } : undefined}
            muted
            playsInline
            onCanPlayThrough={() => {
              // Only handle forward playback here - reverse is handled in useEffect
              if (!playReverse) {
                setIsVideoElementReady(true);
                handleVideoCanPlay();
                // Start playing now that video is fully buffered
                videoRef.current?.play().catch((err) => {
                  console.error('[Sogni360Viewer] Video play failed:', err);
                  // Clear stuck transition state so UI remains usable
                  handleTransitionEnd();
                });
              }
            }}
            onEnded={playReverse ? undefined : handleTransitionEnd}
            onError={(e) => {
              console.error('[Sogni360Viewer] Video error:', e);
              // Clear stuck transition state so UI remains usable
              handleTransitionEnd();
            }}
          />
        </div>
      )}

      {/* Click zones with hover buttons (desktop) */}
      <div
        className="click-zone click-zone-left hidden md:block"
        onClick={handleLeftClick}
      >
        <button className="click-zone-btn" aria-label="Previous">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
      </div>
      <div
        className="click-zone click-zone-center hidden md:block"
        onClick={handleCenterClick}
      >
        <button className="click-zone-btn" aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>
      </div>
      <div
        className="click-zone click-zone-right hidden md:block"
        onClick={handleRightClick}
      >
        <button className="click-zone-btn" aria-label="Next">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>

      {/* Waypoint indicator */}
      {currentProject && currentProject.waypoints.length > 0 && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 flex gap-2">
          {currentProject.waypoints.map((_, index) => (
            <button
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentWaypointIndex
                  ? 'bg-white w-4'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              onClick={() => {
                if (index === currentWaypointIndex || isTransitionPlaying) return;
                // Stop auto-play when user manually selects a waypoint
                if (isPlaying) {
                  dispatch({ type: 'SET_PLAYING', payload: false });
                }
                const direction = index > currentWaypointIndex ? 'forward' : 'backward';
                navigateToWaypoint(index, direction);
              }}
            />
          ))}
        </div>
      )}

      {/* Playback and download controls - shown when sequence is complete */}
      {hasPlayableSequence && (
        <div className="viewer-controls">
          {/* Auto-play toggle button with label */}
          <div className="autoplay-control">
            <button
              className={`viewer-control-btn ${isPlaying ? 'active' : ''}`}
              onClick={togglePlayback}
              title={isPlaying ? 'Pause auto-play (Space)' : 'Start auto-play (Space)'}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              )}
            </button>
            <span className="autoplay-label">Auto-play</span>
          </div>

          {/* Open final video panel button */}
          {hasFinalVideo && (
            <>
              <button
                className="viewer-control-btn"
                onClick={() => dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: true })}
                title="View stitched loop"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>

              {/* Download stitched video button */}
              <button
                className={`viewer-control-btn ${isDownloading ? 'disabled' : ''}`}
                onClick={handleDownloadLoop}
                disabled={isDownloading}
                title="Download stitched video"
              >
                {isDownloading ? (
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Sogni360Viewer;
