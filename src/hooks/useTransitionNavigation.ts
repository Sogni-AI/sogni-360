/**
 * useTransitionNavigation
 *
 * Provides waypoint navigation that plays video transitions when available.
 * Uses global state from AppContext for transition state to avoid hooks order issues.
 *
 * Features:
 * - Smart preloading: only preloads adjacent transition videos (not all)
 * - Shows current waypoint image while video loads (no black flash)
 * - Tracks video ready state for smooth transitions
 */

import { useCallback, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { VideoTransitionState, Segment } from '../types';
import {
  hasCachedBlobUrl,
  getCachedBlobUrl,
  isFetchInProgress,
  preloadVideo
} from '../utils/videoBlobCache';

// How many waypoints ahead/behind to preload (2 = preload transitions for ±2 waypoints)
const PRELOAD_RADIUS = 2;

export function useTransitionNavigation() {
  const { state, dispatch } = useApp();
  const {
    currentProject,
    currentWaypointIndex,
    isPlaying: isAutoPlaying,
    playbackSpeed,
    videoTransition
  } = state;

  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to hold the latest nextWaypoint function for use in setTimeout
  // This prevents the timer from being reset when nextWaypoint changes
  const nextWaypointRef = useRef<() => void>(() => {});

  // Find segments adjacent to a waypoint index (segments that start or end at this waypoint)
  const getAdjacentSegments = useCallback((waypointIndex: number): Segment[] => {
    if (!currentProject || currentProject.segments.length === 0) return [];

    const waypoints = currentProject.waypoints;
    if (waypointIndex < 0 || waypointIndex >= waypoints.length) return [];

    const waypointId = waypoints[waypointIndex].id;

    return currentProject.segments.filter(
      s => s.fromWaypointId === waypointId || s.toWaypointId === waypointId
    );
  }, [currentProject]);

  // Smart preload: only preload videos for adjacent waypoints (within PRELOAD_RADIUS)
  // This prevents memory issues with projects that have many segments
  useEffect(() => {
    if (!currentProject || currentProject.segments.length === 0) return;

    const waypoints = currentProject.waypoints;
    const maxIndex = waypoints.length - 1;

    // Collect segments within preload radius
    const segmentsToPreload = new Set<Segment>();

    for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset++) {
      // Handle wraparound for looping navigation
      let idx = currentWaypointIndex + offset;
      if (idx < 0) idx = maxIndex + 1 + idx; // Wrap to end
      if (idx > maxIndex) idx = idx - maxIndex - 1; // Wrap to start

      const adjacentSegments = getAdjacentSegments(idx);
      adjacentSegments.forEach(s => segmentsToPreload.add(s));
    }

    // Preload collected segments
    segmentsToPreload.forEach(segment => {
      if (segment.status === 'ready' && segment.videoUrl &&
          !hasCachedBlobUrl(segment.videoUrl) &&
          !isFetchInProgress(segment.videoUrl)) {
        preloadVideo(segment.videoUrl).catch(err => {
          console.warn('[useTransitionNavigation] Failed to preload video:', segment.videoUrl, err);
        });
      }
    });
  }, [currentProject?.segments, currentWaypointIndex, getAdjacentSegments]);

  // Find segment video URL between two waypoint indices
  // Returns { url, playReverse } where playReverse indicates if video should be played backwards
  const findSegmentVideo = useCallback((fromIndex: number, toIndex: number): { url: string; playReverse: boolean } | null => {
    if (!currentProject || currentProject.segments.length === 0) return null;

    const waypoints = currentProject.waypoints;
    if (fromIndex < 0 || fromIndex >= waypoints.length) return null;
    if (toIndex < 0 || toIndex >= waypoints.length) return null;

    const fromWaypoint = waypoints[fromIndex];
    const toWaypoint = waypoints[toIndex];

    // Look for a segment from -> to (matches our navigation direction - play normally)
    const forwardSegment = currentProject.segments.find(
      s => s.fromWaypointId === fromWaypoint.id && s.toWaypointId === toWaypoint.id
    );
    if (forwardSegment && forwardSegment.status === 'ready' && forwardSegment.videoUrl) {
      return { url: forwardSegment.videoUrl, playReverse: false };
    }

    // Look for a segment to -> from (opposite direction - play in reverse)
    const reverseSegment = currentProject.segments.find(
      s => s.fromWaypointId === toWaypoint.id && s.toWaypointId === fromWaypoint.id
    );
    if (reverseSegment && reverseSegment.status === 'ready' && reverseSegment.videoUrl) {
      return { url: reverseSegment.videoUrl, playReverse: true };
    }

    return null;
  }, [currentProject]);

  // Navigate with optional video transition
  const navigateWithTransition = useCallback((targetIndex: number, direction: 'forward' | 'backward') => {
    if (!currentProject) return;

    const maxIndex = currentProject.waypoints.length - 1;
    const clampedTarget = Math.max(0, Math.min(targetIndex, maxIndex));

    // Find video for this transition (includes reverse playback info)
    const segmentVideo = findSegmentVideo(currentWaypointIndex, clampedTarget);

    if (segmentVideo) {
      // Check if video is preloaded as blob URL (instant playback)
      const blobUrl = getCachedBlobUrl(segmentVideo.url);
      const isVideoReady = !!blobUrl;

      // Use blob URL if available, otherwise fall back to original URL
      const videoUrl = blobUrl || segmentVideo.url;

      // Set transition state in global context
      const transition: VideoTransitionState = {
        isPlaying: true,
        videoUrl,
        targetWaypointIndex: clampedTarget,
        isVideoReady,
        playReverse: segmentVideo.playReverse
      };
      dispatch({ type: 'SET_VIDEO_TRANSITION', payload: transition });
    } else {
      // No video transition, just navigate directly
      dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: clampedTarget });
      dispatch({ type: 'SET_PLAYBACK_DIRECTION', payload: direction });
    }
  }, [currentProject, currentWaypointIndex, findSegmentVideo, dispatch]);

  // Next waypoint handler
  const nextWaypoint = useCallback(() => {
    if (!currentProject || videoTransition?.isPlaying) return;
    const maxIndex = currentProject.waypoints.length - 1;
    const newIndex = currentWaypointIndex >= maxIndex ? 0 : currentWaypointIndex + 1;
    navigateWithTransition(newIndex, 'forward');
  }, [currentProject, currentWaypointIndex, navigateWithTransition, videoTransition?.isPlaying]);

  // Keep the ref updated with the latest nextWaypoint function
  // This allows setTimeout to always call the latest version
  nextWaypointRef.current = nextWaypoint;

  // Previous waypoint handler
  const previousWaypoint = useCallback(() => {
    if (!currentProject || videoTransition?.isPlaying) return;
    const maxIndex = currentProject.waypoints.length - 1;
    const newIndex = currentWaypointIndex <= 0 ? maxIndex : currentWaypointIndex - 1;
    navigateWithTransition(newIndex, 'backward');
  }, [currentProject, currentWaypointIndex, navigateWithTransition, videoTransition?.isPlaying]);

  // Handle video transition end
  const handleTransitionEnd = useCallback(() => {
    if (!videoTransition) return;

    // Update to target waypoint
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: videoTransition.targetWaypointIndex });

    // Clear transition state
    dispatch({ type: 'SET_VIDEO_TRANSITION', payload: null });
  }, [videoTransition, dispatch]);

  // Handle video becoming ready to play (for non-preloaded videos)
  const handleVideoCanPlay = useCallback(() => {
    if (videoTransition && !videoTransition.isVideoReady) {
      dispatch({ type: 'SET_VIDEO_TRANSITION_READY', payload: true });
    }
  }, [videoTransition, dispatch]);

  // Auto-play handling - waits for video transitions to complete
  // Uses nextWaypointRef to always call the latest function without resetting timer
  useEffect(() => {
    if (!isAutoPlaying || !currentProject || videoTransition?.isPlaying) {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }

    autoPlayTimerRef.current = setTimeout(() => {
      // Use ref to get the latest nextWaypoint function
      nextWaypointRef.current();
    }, 500 / playbackSpeed);

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
    // Note: nextWaypoint is not in deps - we use the ref to avoid timer reset on every navigation
    // currentWaypointIndex is also removed - the ref always has the latest function
  }, [isAutoPlaying, playbackSpeed, currentProject, videoTransition?.isPlaying]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', payload: !isAutoPlaying });
  }, [dispatch, isAutoPlaying]);

  // Get waypoint image URL by index
  const getWaypointImageUrl = useCallback((index: number) => {
    if (!currentProject) return '';
    const waypoints = currentProject.waypoints;
    if (index < 0 || index >= waypoints.length) return currentProject.sourceImageUrl;
    return waypoints[index]?.imageUrl || currentProject.sourceImageUrl;
  }, [currentProject]);

  // Get current content (image or video)
  const getCurrentContent = useCallback(() => {
    if (!currentProject) return null;

    // If a transition video is playing
    if (videoTransition?.isPlaying && videoTransition.videoUrl) {
      // Use SOURCE waypoint image as background until video is ready
      // This prevents black flash while video loads
      const sourceImageUrl = getWaypointImageUrl(currentWaypointIndex);
      const destinationImageUrl = getWaypointImageUrl(videoTransition.targetWaypointIndex);

      return {
        type: 'video' as const,
        url: videoTransition.videoUrl,
        isVideoReady: videoTransition.isVideoReady,
        playReverse: videoTransition.playReverse || false,
        // Show source image until video is ready, then destination shows through at end
        sourceImageUrl,
        destinationImageUrl
      };
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
  }, [currentProject, currentWaypointIndex, videoTransition, getWaypointImageUrl]);

  return {
    // Navigation functions
    nextWaypoint,
    previousWaypoint,
    navigateToWaypoint: navigateWithTransition,
    togglePlayback,

    // Transition state (from global context)
    isTransitionPlaying: videoTransition?.isPlaying || false,
    transitionVideoUrl: videoTransition?.videoUrl || null,
    isVideoReady: videoTransition?.isVideoReady || false,
    playReverse: videoTransition?.playReverse || false,
    targetWaypointIndex: videoTransition?.targetWaypointIndex ?? null,
    handleTransitionEnd,
    handleVideoCanPlay,

    // Content helpers
    getCurrentContent
  };
}
