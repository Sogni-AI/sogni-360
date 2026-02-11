import type { Waypoint } from '../types';

/**
 * Returns a numbered label for an original waypoint.
 * - If the waypoint has a customLabel, returns that
 * - If only 1 original exists → "Original"
 * - If multiple → "Original", "Original 2", "Original 3", etc.
 */
export function getOriginalLabel(waypoints: Waypoint[], waypointId: string): string {
  const waypoint = waypoints.find(wp => wp.id === waypointId);
  if (waypoint?.customLabel) return waypoint.customLabel;

  const originals = waypoints.filter(wp => wp.isOriginal);
  if (originals.length <= 1) return 'Original';

  const index = originals.findIndex(wp => wp.id === waypointId);
  if (index <= 0) return 'Original';
  return `Original ${index + 1}`;
}

/** Max characters for a custom waypoint label */
export const MAX_LABEL_LENGTH = 28;
