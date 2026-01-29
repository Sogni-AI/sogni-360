import React, { useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

const Sogni360Viewer: React.FC = () => {
  const { state, nextWaypoint, previousWaypoint, togglePlayback, dispatch } = useApp();
  const { currentProject, currentWaypointIndex } = state;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get current content to display
  const getCurrentContent = useCallback(() => {
    if (!currentProject) return null;

    const waypoints = currentProject.waypoints;

    // If no waypoints, show source image
    if (waypoints.length === 0) {
      return { type: 'image' as const, url: currentProject.sourceImageUrl };
    }

    // Get current waypoint
    const currentWaypoint = waypoints[currentWaypointIndex];
    if (!currentWaypoint) {
      return { type: 'image' as const, url: currentProject.sourceImageUrl };
    }

    // If waypoint has an image, show it
    if (currentWaypoint.imageUrl) {
      return { type: 'image' as const, url: currentWaypoint.imageUrl };
    }

    // Fallback to source image
    return { type: 'image' as const, url: currentProject.sourceImageUrl };
  }, [currentProject, currentWaypointIndex]);

  const content = getCurrentContent();

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

  // Auto-play handling
  useEffect(() => {
    if (!state.isPlaying || !currentProject) return;

    const interval = setInterval(() => {
      nextWaypoint();
    }, 3000 / state.playbackSpeed); // Move to next waypoint every 3 seconds

    return () => clearInterval(interval);
  }, [state.isPlaying, state.playbackSpeed, currentProject, nextWaypoint]);

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
          src={content.url}
          alt="Current view"
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          src={content.url}
          className="max-w-full max-h-full object-contain"
          autoPlay
          muted
          playsInline
        />
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
              onClick={() => dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: index })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Sogni360Viewer;
