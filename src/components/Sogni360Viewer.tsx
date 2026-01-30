import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';

const Sogni360Viewer: React.FC = () => {
  const { state } = useApp();
  const { currentProject, currentWaypointIndex } = state;

  // Track the displayed image dimensions for scaling video to match
  const [imageDisplaySize, setImageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const {
    nextWaypoint,
    previousWaypoint,
    navigateToWaypoint,
    togglePlayback,
    isTransitionPlaying,
    handleTransitionEnd,
    handleVideoCanPlay,
    getCurrentContent
  } = useTransitionNavigation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement>(null);
  const content = getCurrentContent();

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
  }, [content]);

  // Handle click zones
  const handleLeftClick = useCallback(() => {
    previousWaypoint();
  }, [previousWaypoint]);

  const handleCenterClick = useCallback(() => {
    togglePlayback();
  }, [togglePlayback]);

  const handleRightClick = useCallback(() => {
    nextWaypoint();
  }, [nextWaypoint]);

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
  }, [nextWaypoint, previousWaypoint, togglePlayback]);

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
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          {/* Destination image ALWAYS shown behind video - prevents flash when video ends */}
          {content.backgroundImageUrl && (
            <img
              ref={backgroundImageRef}
              src={content.backgroundImageUrl}
              alt="Destination"
              className="max-w-full max-h-full object-contain select-none absolute inset-0 m-auto"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
              }}
            />
          )}
          {/* Video element layered on top - scaled to match image size */}
          <video
            ref={videoRef}
            key={content.url}
            src={content.url}
            className={`absolute inset-0 m-auto transition-opacity duration-150 ${
              content.isVideoReady ? 'opacity-100' : 'opacity-0'
            }`}
            style={imageDisplaySize ? {
              width: `${imageDisplaySize.width}px`,
              height: `${imageDisplaySize.height}px`,
              objectFit: 'cover'
            } : {
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
            autoPlay
            muted
            playsInline
            onCanPlayThrough={handleVideoCanPlay}
            onEnded={handleTransitionEnd}
          />
        </div>
      )}

      {/* Click zones (desktop) */}
      <div
        className="click-zone click-zone-left hidden md:block"
        onClick={handleLeftClick}
        title="Previous"
      />
      <div
        className="click-zone click-zone-center hidden md:block"
        onClick={handleCenterClick}
        title="Play/Pause"
      />
      <div
        className="click-zone click-zone-right hidden md:block"
        onClick={handleRightClick}
        title="Next"
      />

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
                const direction = index > currentWaypointIndex ? 'forward' : 'backward';
                navigateToWaypoint(index, direction);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Sogni360Viewer;
