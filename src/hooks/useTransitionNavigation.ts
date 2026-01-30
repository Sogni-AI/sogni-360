/**
 * useTransitionNavigation
 *
 * Provides waypoint navigation that plays video transitions when available.
 * Use this hook instead of direct nextWaypoint/previousWaypoint from AppContext
 * to get smooth video transitions between waypoints.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface TransitionState {
  isPlaying: boolean;
  videoUrl: string;
  targetWaypointIndex: number;
}

export function useTransitionNavigation() {
  const { state, dispatch } = useApp();
  const { currentProject, currentWaypointIndex, isPlaying: isAutoPlaying, playbackSpeed } = state;
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find segment video URL between two waypoint indices
  const findSegmentVideoUrl = useCallback((fromIndex: number, toIndex: number): string | null => {
    if (!currentProject || currentProject.segments.length === 0) return null;

    const waypoints = currentProject.waypoints;
    if (fromIndex < 0 || fromIndex >= waypoints.length) return null;
    if (toIndex < 0 || toIndex >= waypoints.length) return null;

    const fromWaypoint = waypoints[fromIndex];
    const toWaypoint = waypoints[toIndex];

    // Look for a segment from -> to (forward direction)
    const forwardSegment = currentProject.segments.find(
      s => s.fromWaypointId === fromWaypoint.id && s.toWaypointId === toWaypoint.id
    );
    if (forwardSegment && forwardSegment.status === 'ready' && forwardSegment.videoUrl) {
      return forwardSegment.videoUrl;
    }

    // Look for a segment to -> from (reverse direction - just use the video as-is)
    // Note: True reverse playback not supported by browsers, so we just play forward
    const reverseSegment = currentProject.segments.find(
      s => s.fromWaypointId === toWaypoint.id && s.toWaypointId === fromWaypoint.id
    );
    if (reverseSegment && reverseSegment.status === 'ready' && reverseSegment.videoUrl) {
      return reverseSegment.videoUrl;
    }

    return null;
  }, [currentProject]);

  // Navigate with optional video transition
  const navigateWithTransition = useCallback((targetIndex: number, direction: 'forward' | 'backward') => {
    if (!currentProject) return;

    const maxIndex = currentProject.waypoints.length - 1;
    const clampedTarget = Math.max(0, Math.min(targetIndex, maxIndex));

    // Find video URL for this transition
    const videoUrl = findSegmentVideoUrl(currentWaypointIndex, clampedTarget);

    if (videoUrl) {
      // Play video transition
      setTransition({
        isPlaying: true,
        videoUrl,
        targetWaypointIndex: clampedTarget
      });
    } else {
      // No video transition, just navigate directly
      dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: clampedTarget });
      dispatch({ type: 'SET_PLAYBACK_DIRECTION', payload: direction });
    }
  }, [currentProject, currentWaypointIndex, findSegmentVideoUrl, dispatch]);

  // Next waypoint handler
  const nextWaypoint = useCallback(() => {
    if (!currentProject || transition?.isPlaying) return;
    const maxIndex = currentProject.waypoints.length - 1;
    const newIndex = currentWaypointIndex >= maxIndex ? 0 : currentWaypointIndex + 1;
    navigateWithTransition(newIndex, 'forward');
  }, [currentProject, currentWaypointIndex, navigateWithTransition, transition?.isPlaying]);

  // Previous waypoint handler
  const previousWaypoint = useCallback(() => {
    if (!currentProject || transition?.isPlaying) return;
    const maxIndex = currentProject.waypoints.length - 1;
    const newIndex = currentWaypointIndex <= 0 ? maxIndex : currentWaypointIndex - 1;
    navigateWithTransition(newIndex, 'backward');
  }, [currentProject, currentWaypointIndex, navigateWithTransition, transition?.isPlaying]);

  // Handle video transition end
  const handleTransitionEnd = useCallback(() => {
    if (!transition) return;

    // Update to target waypoint
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: transition.targetWaypointIndex });

    // Clear transition state
    setTransition(null);
  }, [transition, dispatch]);

  // Auto-play handling - waits for video transitions to complete
  useEffect(() => {
    if (!isAutoPlaying || !currentProject || transition?.isPlaying) {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }

    // When a video is playing as part of auto-play, don't start another timer
    // The video's onEnded will trigger the next advance
    autoPlayTimerRef.current = setTimeout(() => {
      nextWaypoint();
    }, 3000 / playbackSpeed);

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [isAutoPlaying, playbackSpeed, currentProject, nextWaypoint, transition?.isPlaying, currentWaypointIndex]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', payload: !isAutoPlaying });
  }, [dispatch, isAutoPlaying]);

  // Get current content (image or video)
  const getCurrentContent = useCallback(() => {
    if (!currentProject) return null;

    // If a transition video is playing, show that
    if (transition?.isPlaying && transition.videoUrl) {
      return { type: 'video' as const, url: transition.videoUrl };
    }

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
  }, [currentProject, currentWaypointIndex, transition]);

  return {
    // Navigation functions
    nextWaypoint,
    previousWaypoint,
    navigateToWaypoint: navigateWithTransition,
    togglePlayback,

    // Transition state
    isTransitionPlaying: transition?.isPlaying || false,
    transitionVideoUrl: transition?.videoUrl || null,
    handleTransitionEnd,

    // Content helpers
    getCurrentContent,

    // Refs for video element
    videoRef
  };
}
