import React from 'react';
import { useApp } from '../context/AppContext';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';

const PlaybackControls: React.FC = () => {
  const { state, dispatch } = useApp();
  const { currentProject, currentWaypointIndex, isPlaying, playbackSpeed } = state;
  const { previousWaypoint, nextWaypoint, togglePlayback, isTransitionPlaying } = useTransitionNavigation();

  const waypoints = currentProject?.waypoints || [];
  const hasWaypoints = waypoints.length > 0;

  const handleSpeedChange = (speed: number) => {
    dispatch({ type: 'SET_PLAYBACK_SPEED', payload: speed });
  };

  return (
    <div className="playback-controls">
      {/* Previous button */}
      <button
        className="btn btn-ghost p-2"
        onClick={previousWaypoint}
        disabled={!hasWaypoints || isTransitionPlaying}
        title="Previous (←/A)"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Play/Pause button */}
      <button
        className="btn btn-ghost p-2"
        onClick={togglePlayback}
        disabled={!hasWaypoints}
        title="Play/Pause (Space)"
      >
        {isPlaying ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        )}
      </button>

      {/* Next button */}
      <button
        className="btn btn-ghost p-2"
        onClick={nextWaypoint}
        disabled={!hasWaypoints || isTransitionPlaying}
        title="Next (→/D)"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-white/20 mx-2" />

      {/* Position indicator */}
      <div className="text-white text-sm min-w-[60px] text-center">
        {hasWaypoints ? `${currentWaypointIndex + 1} / ${waypoints.length}` : '0 / 0'}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/20 mx-2" />

      {/* Speed selector */}
      <div className="flex gap-1">
        {[0.5, 1, 2].map((speed) => (
          <button
            key={speed}
            className={`btn text-xs px-2 py-1 ${
              playbackSpeed === speed ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => handleSpeedChange(speed)}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
};

export default PlaybackControls;
