import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';
import { useToast } from '../context/ToastContext';
import { preloadVideo, hasCachedBlobUrl, getCachedBlobUrl } from '../utils/videoBlobCache';

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
  const content = getCurrentContent();

  // Track which video URL + direction is ready to play
  // This prevents race conditions when rapidly switching videos or changing direction
  const [readyVideoKey, setReadyVideoKey] = useState<string | null>(null);

  // State to hold the blob URL for reverse playback (ensures full video is loaded)
  const [reverseBlobUrl, setReverseBlobUrl] = useState<string | null>(null);

  // Video is ready only when readyVideoKey matches the current video+direction
  const isVideoElementReady = content?.type === 'video' && readyVideoKey !== null && (
    content.playReverse
      ? reverseBlobUrl !== null && readyVideoKey === `${reverseBlobUrl}:reverse`
      : readyVideoKey === `${content.url}:forward`
  );

  // Check if final video is available
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

  // Track image size for scaling video to match
  useEffect(() => {
    const updateImageSize = () => {
      const img = imageRef.current;
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
  // For reverse playback to work reliably, we MUST have the full video loaded as a blob
  useEffect(() => {
    if (!playReverse || content?.type !== 'video' || !content?.url) {
      // Clean up animation frame if conditions change
      if (reverseAnimationRef.current) {
        cancelAnimationFrame(reverseAnimationRef.current);
        reverseAnimationRef.current = null;
      }
      setReverseBlobUrl(null);
      return;
    }

    let cancelled = false;

    // Ensure video is loaded as blob for reliable reverse playback
    const ensureBlobUrl = async (): Promise<string | null> => {
      const url = content.url;

      // If already a blob URL, use it directly
      if (url.startsWith('blob:')) {
        return url;
      }

      // Check if we have it cached
      if (hasCachedBlobUrl(url)) {
        return getCachedBlobUrl(url) || null;
      }

      // Need to preload it - this fetches the full video into memory
      const blobUrl = await preloadVideo(url);
      return blobUrl || null;
    };

    // Initialize reverse playback
    const initReverse = async () => {
      console.log('[Reverse] Ensuring blob URL for:', content.url?.substring(0, 50));
      const blobUrl = await ensureBlobUrl();
      if (cancelled || !blobUrl) {
        console.log('[Reverse] Blob URL failed or cancelled');
        return;
      }
      console.log('[Reverse] Got blob URL:', blobUrl.substring(0, 30));
      setReverseBlobUrl(blobUrl);
    };

    initReverse();

    return () => {
      cancelled = true;
      if (reverseAnimationRef.current) {
        cancelAnimationFrame(reverseAnimationRef.current);
        reverseAnimationRef.current = null;
      }
      lastTimeRef.current = 0;
    };
  }, [playReverse, content?.type, content?.url]);

  // Once we have the blob URL, set up the actual reverse playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playReverse || !reverseBlobUrl) {
      return;
    }

    let loadedHandler: (() => void) | null = null;
    let seekedHandler: (() => void) | null = null;
    let timeupdateHandler: (() => void) | null = null;
    let cancelled = false;

    // Reverse playback using setInterval instead of RAF for more consistent timing
    // RAF-based seeking causes stuttering because video decoders aren't optimized for reverse
    // Using interval gives the decoder more time between seeks
    const REVERSE_FPS = 30; // Target 30fps for reverse (smoother than 60fps seeking)
    const FRAME_INTERVAL = 1000 / REVERSE_FPS;
    let reverseInterval: ReturnType<typeof setInterval> | null = null;
    let lastReverseTime = 0;

    const startReverseInterval = () => {
      if (reverseInterval) return;

      lastReverseTime = performance.now();
      video.pause();

      reverseInterval = setInterval(() => {
        if (cancelled || !video) {
          if (reverseInterval) clearInterval(reverseInterval);
          reverseInterval = null;
          return;
        }

        const now = performance.now();
        const deltaTime = (now - lastReverseTime) / 1000;
        lastReverseTime = now;

        const newTime = video.currentTime - deltaTime;

        if (newTime <= 0) {
          video.currentTime = 0;
          if (reverseInterval) clearInterval(reverseInterval);
          reverseInterval = null;
          handleTransitionEnd();
          return;
        }

        video.currentTime = newTime;
      }, FRAME_INTERVAL);
    };

    const stopReverseInterval = () => {
      if (reverseInterval) {
        clearInterval(reverseInterval);
        reverseInterval = null;
      }
    };

    // Start animation after frame is rendered
    const beginReverseAnimation = () => {
      if (cancelled) return;
      timeupdateHandler = () => {
        if (cancelled) return;
        video.removeEventListener('timeupdate', timeupdateHandler!);
        timeupdateHandler = null;
        // Use RAF to ensure frame is painted before showing video
        requestAnimationFrame(() => {
          if (cancelled) return;
          requestAnimationFrame(() => {
            if (cancelled) return;
            setReadyVideoKey(`${reverseBlobUrl}:reverse`);
            // Start the interval-based reverse playback
            startReverseInterval();
          });
        });
      };
      video.addEventListener('timeupdate', timeupdateHandler, { once: true });
      // Force a tiny currentTime change to trigger timeupdate
      const ct = video.currentTime;
      video.currentTime = ct > 0.01 ? ct - 0.01 : ct + 0.01;
    };

    // Seek to end and verify position
    const seekToEnd = () => {
      if (cancelled || !video.duration || video.duration <= 0) return;

      const targetTime = video.duration - 0.01; // Slightly before absolute end
      console.log('[Reverse] Seeking to end:', { duration: video.duration, targetTime, currentTime: video.currentTime, src: video.src?.substring(0, 50) });
      video.currentTime = targetTime;

      seekedHandler = () => {
        if (cancelled) return;
        console.log('[Reverse] Seeked event fired:', { currentTime: video.currentTime, duration: video.duration, targetTime });
        // Verify we actually reached near the end
        if (video.currentTime >= video.duration - 0.5) {
          console.log('[Reverse] Seek successful, starting animation');
          beginReverseAnimation();
        } else {
          // Seek didn't work - try again or give up
          console.warn('[Reverse] Seek failed, at:', video.currentTime, 'wanted:', targetTime);
          // Try one more time
          video.currentTime = targetTime;
          video.addEventListener('seeked', () => {
            console.log('[Reverse] Retry seeked:', { currentTime: video.currentTime });
            if (!cancelled) beginReverseAnimation();
          }, { once: true });
        }
      };
      video.addEventListener('seeked', seekedHandler, { once: true });
    };

    // ALWAYS wait for loadedmetadata since we changed the src
    // This ensures video.duration is accurate and seeking will work
    loadedHandler = () => {
      if (cancelled) return;
      video.removeEventListener('loadedmetadata', loadedHandler!);
      loadedHandler = null;
      // Double-check duration is valid before seeking
      if (video.duration && video.duration > 0 && isFinite(video.duration)) {
        seekToEnd();
      } else {
        // Wait for durationchange if metadata loaded but duration isn't ready
        const onDurationChange = () => {
          if (cancelled) return;
          video.removeEventListener('durationchange', onDurationChange);
          if (video.duration && video.duration > 0 && isFinite(video.duration)) {
            seekToEnd();
          }
        };
        video.addEventListener('durationchange', onDurationChange);
      }
    };

    // Always wait for loadedmetadata - don't assume video is ready
    video.addEventListener('loadedmetadata', loadedHandler);

    return () => {
      cancelled = true;
      stopReverseInterval();
      if (loadedHandler) {
        video.removeEventListener('loadedmetadata', loadedHandler);
      }
      if (seekedHandler) {
        video.removeEventListener('seeked', seekedHandler);
      }
      if (timeupdateHandler) {
        video.removeEventListener('timeupdate', timeupdateHandler);
      }
    };
  }, [playReverse, reverseBlobUrl, handleTransitionEnd]);

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

  // Stop touch propagation on interactive elements to prevent double-triggering
  // (touch handler on parent + click handler on button)
  const stopTouchPropagation = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

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
      {/* Base image layer - always visible, prevents flicker during transitions */}
      {/* During video playback, keep showing source image - the video covers it */}
      {/* Only switch to new waypoint image after transition completes */}
      <img
        ref={imageRef}
        src={content.type === 'video'
          ? (content.sourceImageUrl || content.destinationImageUrl || '')
          : content.url}
        alt="Current view"
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          setImageDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
        }}
      />
      {/* Preload destination image during video so it's cached when transition ends */}
      {content.type === 'video' && content.destinationImageUrl && (
        <img
          src={content.destinationImageUrl}
          alt=""
          className="hidden"
          aria-hidden="true"
        />
      )}

      {/* Video overlay - only mounted during transitions */}
      {/* For reverse playback, use the blob URL to ensure full video is loaded */}
      {content.type === 'video' && (playReverse ? reverseBlobUrl : true) && (
        <video
          ref={videoRef}
          key={(playReverse ? reverseBlobUrl : content.url) + (playReverse ? '-reverse' : '')}
          src={playReverse ? (reverseBlobUrl || '') : content.url}
          className={`video-overlay transition-opacity duration-100 ${
            isVideoElementReady ? 'opacity-100' : 'opacity-0'
          }`}
          style={imageDisplaySize ? {
            width: `${imageDisplaySize.width}px`,
            height: `${imageDisplaySize.height}px`,
            objectFit: 'cover'
          } : undefined}
          muted
          playsInline
          preload="auto"
          onCanPlayThrough={() => {
            // Only handle forward playback here - reverse is handled in useEffect
            if (!playReverse) {
              handleVideoCanPlay();
              // Start playing now that video is fully buffered
              // Don't set isVideoElementReady yet - wait for onPlaying
              videoRef.current?.play().catch((err) => {
                console.error('[Sogni360Viewer] Video play failed:', err);
                // Clear stuck transition state so UI remains usable
                handleTransitionEnd();
              });
            }
          }}
          onPlaying={() => {
            // Video is actually rendering frames now - safe to show
            // This prevents flicker on iOS where canplaythrough fires before frames render
            if (!playReverse) {
              // Set ready with key that includes direction (forward)
              setReadyVideoKey(`${content.url}:forward`);
            }
          }}
          onEnded={playReverse ? undefined : handleTransitionEnd}
          onError={(e) => {
            console.error('[Sogni360Viewer] Video error:', e);
            // Clear stuck transition state so UI remains usable
            handleTransitionEnd();
          }}
        />
      )}

      {/* Click zones with hover buttons (desktop) */}
      <div
        className="click-zone click-zone-left hidden md:block"
        onClick={handleLeftClick}
      >
        <button type="button" className="click-zone-btn" aria-label="Previous" onClick={handleLeftClick}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
      </div>
      <div
        className="click-zone click-zone-center hidden md:block"
        onClick={handleCenterClick}
      >
        <button type="button" className="click-zone-btn" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={handleCenterClick}>
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
        <button type="button" className="click-zone-btn" aria-label="Next" onClick={handleRightClick}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>

      {/* Waypoint indicator */}
      {currentProject && currentProject.waypoints.length > 0 && (() => {
        const waypointCount = currentProject.waypoints.length;
        const maxWidth = 240; // Max container width in pixels

        // For many waypoints, use tiny dots
        // Under 10: normal dots (6px), 10-20: small (4px), 20+: tiny (3px)
        let baseDotSize: number;
        let baseGap: number;
        if (waypointCount <= 10) {
          baseDotSize = 6;
          baseGap = 6;
        } else if (waypointCount <= 20) {
          baseDotSize = 4;
          baseGap = 4;
        } else {
          baseDotSize = 3;
          baseGap = 3;
        }

        // Calculate if we still need to shrink further
        const spaceNeeded = waypointCount * baseDotSize + (waypointCount - 1) * baseGap;
        const scale = spaceNeeded > maxWidth ? maxWidth / spaceNeeded : 1;

        const dotSize = Math.max(2, Math.round(baseDotSize * scale));
        const gap = Math.max(1, Math.round(baseGap * scale));
        const activeDotWidth = Math.min(dotSize * 2, dotSize + 4); // Active dot slightly wider

        return (
          <div
            className="absolute bottom-24 left-1/2 transform -translate-x-1/2 flex items-center"
            style={{
              maxWidth: `${maxWidth}px`,
              gap: `${gap}px`,
              padding: `6px ${Math.max(8, gap * 2)}px`,
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '9999px',
              backdropFilter: 'blur(8px)',
            }}
            onTouchStart={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
          >
            {currentProject.waypoints.map((_, index) => (
              <button
                key={index}
                className="rounded-full transition-all flex-shrink-0"
                style={{
                  width: index === currentWaypointIndex ? `${activeDotWidth}px` : `${dotSize}px`,
                  height: `${dotSize}px`,
                  background: index === currentWaypointIndex
                    ? 'white'
                    : 'rgba(255, 255, 255, 0.4)',
                }}
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
        );
      })()}

      {/* Playback and download controls - shown when final video is available */}
      {hasFinalVideo && (
        <div
          className="viewer-controls"
          onTouchStart={stopTouchPropagation}
          onTouchEnd={stopTouchPropagation}
        >
          {/* Play Final Video button - prominent gradient button */}
          <button
            className="viewer-play-video-btn"
            onClick={() => dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: true })}
            title="Play completed video"
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Play Video</span>
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
        </div>
      )}
    </div>
  );
};

export default Sogni360Viewer;
