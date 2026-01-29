import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint, AzimuthKey, ElevationKey, DistanceKey } from '../types';
import { MIN_WAYPOINTS, MAX_WAYPOINTS } from '../constants/cameraAngleSettings';

/**
 * Hook for managing waypoints in a project
 */
function useWaypoints() {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();

  const waypoints = state.currentProject?.waypoints || [];

  /**
   * Add a new waypoint with specified angle
   */
  const addWaypoint = useCallback((
    azimuth: AzimuthKey = 'front',
    elevation: ElevationKey = 'eye-level',
    distance: DistanceKey = 'medium'
  ) => {
    if (waypoints.length >= MAX_WAYPOINTS) {
      showToast({
        message: `Maximum ${MAX_WAYPOINTS} waypoints allowed`,
        type: 'warning'
      });
      return null;
    }

    const newWaypoint: Waypoint = {
      id: uuidv4(),
      azimuth,
      elevation,
      distance,
      status: 'pending'
    };

    dispatch({ type: 'ADD_WAYPOINT', payload: newWaypoint });
    return newWaypoint.id;
  }, [waypoints.length, dispatch, showToast]);

  /**
   * Remove a waypoint by ID
   */
  const removeWaypoint = useCallback((id: string) => {
    if (waypoints.length <= MIN_WAYPOINTS) {
      showToast({
        message: `Minimum ${MIN_WAYPOINTS} waypoints required`,
        type: 'warning'
      });
      return false;
    }

    dispatch({ type: 'REMOVE_WAYPOINT', payload: id });
    return true;
  }, [waypoints.length, dispatch, showToast]);

  /**
   * Update a waypoint's angle configuration
   */
  const updateWaypointAngle = useCallback((
    id: string,
    azimuth?: AzimuthKey,
    elevation?: ElevationKey,
    distance?: DistanceKey
  ) => {
    const updates: Partial<Waypoint> = { status: 'pending' };
    if (azimuth !== undefined) updates.azimuth = azimuth;
    if (elevation !== undefined) updates.elevation = elevation;
    if (distance !== undefined) updates.distance = distance;

    dispatch({ type: 'UPDATE_WAYPOINT', payload: { id, updates } });
  }, [dispatch]);

  /**
   * Update a waypoint's status
   */
  const updateWaypointStatus = useCallback((
    id: string,
    status: Waypoint['status'],
    extras?: { progress?: number; error?: string; imageUrl?: string; projectId?: string }
  ) => {
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: {
        id,
        updates: { status, ...extras }
      }
    });
  }, [dispatch]);

  /**
   * Reorder waypoints by dragging
   */
  const reorderWaypoints = useCallback((newOrder: string[]) => {
    dispatch({ type: 'REORDER_WAYPOINTS', payload: newOrder });
  }, [dispatch]);

  /**
   * Check if all waypoints are ready (images generated)
   */
  const allWaypointsReady = useCallback(() => {
    return waypoints.length >= MIN_WAYPOINTS && waypoints.every(w => w.status === 'ready');
  }, [waypoints]);

  /**
   * Get pending waypoints that need generation
   */
  const getPendingWaypoints = useCallback(() => {
    return waypoints.filter(w => w.status === 'pending' || w.status === 'failed');
  }, [waypoints]);

  /**
   * Get waypoint by ID
   */
  const getWaypointById = useCallback((id: string) => {
    return waypoints.find(w => w.id === id);
  }, [waypoints]);

  /**
   * Get waypoint by index
   */
  const getWaypointByIndex = useCallback((index: number) => {
    return waypoints[index];
  }, [waypoints]);

  return {
    waypoints,
    addWaypoint,
    removeWaypoint,
    updateWaypointAngle,
    updateWaypointStatus,
    reorderWaypoints,
    allWaypointsReady,
    getPendingWaypoints,
    getWaypointById,
    getWaypointByIndex,
    canAddWaypoint: waypoints.length < MAX_WAYPOINTS,
    canRemoveWaypoint: waypoints.length > MIN_WAYPOINTS,
    minWaypoints: MIN_WAYPOINTS,
    maxWaypoints: MAX_WAYPOINTS
  };
}

export default useWaypoints;
