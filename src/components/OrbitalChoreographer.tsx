/**
 * OrbitalChoreographer
 *
 * A unified, spatial interface for defining camera waypoints around a subject.
 * The user interacts directly with a 3D orbital visualization - no forms, no cards.
 *
 * Design principles:
 * - Direct manipulation: interact with the visualization itself
 * - Spatial: waypoints exist in 3D space, not a list
 * - Progressive disclosure: presets first, customization available
 * - Delightful: smooth animations, satisfying feedback
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint, AzimuthKey, ElevationKey, DistanceKey } from '../types';
import {
  MIN_WAYPOINTS,
  MAX_WAYPOINTS,
  MULTI_ANGLE_PRESETS,
  AZIMUTHS,
  ELEVATIONS,
  DISTANCES,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../constants/cameraAngleSettings';
import type { MultiAnglePreset } from '../types/cameraAngle';

// Convert angle config to 3D position on orbital sphere
function angleToPosition(
  azimuth: AzimuthKey,
  elevation: ElevationKey,
  distance: DistanceKey,
  radius: number = 100
): { x: number; y: number; z: number } {
  // Azimuth angle in radians (0 = front, rotating clockwise when viewed from above)
  const azimuthAngles: Record<AzimuthKey, number> = {
    'front': 0,
    'front-right': Math.PI / 4,
    'right': Math.PI / 2,
    'back-right': 3 * Math.PI / 4,
    'back': Math.PI,
    'back-left': -3 * Math.PI / 4,
    'left': -Math.PI / 2,
    'front-left': -Math.PI / 4,
  };

  // Elevation angle in radians (matching the actual keys from cameraAngleSettings)
  const elevationAngles: Record<ElevationKey, number> = {
    'high-angle': Math.PI / 3,    // 60° - looking down from above
    'elevated': Math.PI / 6,       // 30° - slightly elevated
    'eye-level': 0,                // 0° - straight on
    'low-angle': -Math.PI / 6,     // -30° - looking up from below
  };

  // Distance multiplier
  const distanceMultipliers: Record<DistanceKey, number> = {
    'close-up': 0.7,
    'medium': 1.0,
    'wide': 1.3,
  };

  const az = azimuthAngles[azimuth] || 0;
  const el = elevationAngles[elevation] || 0;
  const dist = distanceMultipliers[distance] || 1;
  const r = radius * dist;

  return {
    x: r * Math.sin(az) * Math.cos(el),
    y: r * Math.sin(el),
    z: r * Math.cos(az) * Math.cos(el),
  };
}

// Project 3D position to 2D screen coordinates
function project3D(
  pos: { x: number; y: number; z: number },
  rotation: { x: number; y: number },
  size: number
): { x: number; y: number; scale: number; behind: boolean } {
  // Apply Y rotation (horizontal orbit)
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  let x = pos.x * cosY - pos.z * sinY;
  let z = pos.x * sinY + pos.z * cosY;

  // Apply X rotation (vertical tilt)
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  let y = pos.y * cosX - z * sinX;
  z = pos.y * sinX + z * cosX;

  // Perspective projection
  const perspective = 400;
  const scale = perspective / (perspective + z);

  return {
    x: size / 2 + x * scale,
    y: size / 2 - y * scale,
    scale,
    behind: z < 0,
  };
}

interface OrbitalChoreographerProps {
  onGenerate: () => void;
  isGenerating: boolean;
}

const OrbitalChoreographer: React.FC<OrbitalChoreographerProps> = ({
  onGenerate,
  isGenerating,
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, currentWaypointIndex } = state;
  const containerRef = useRef<HTMLDivElement>(null);

  const waypoints = currentProject?.waypoints || [];
  const [rotation, setRotation] = useState({ x: 0.3, y: -0.5 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showPresetPicker, setShowPresetPicker] = useState(waypoints.length === 0);
  const [hoveredWaypoint, setHoveredWaypoint] = useState<string | null>(null);

  const size = 280; // SVG viewport size
  const orbitRadius = 90;

  // Auto-show preset picker when no waypoints
  useEffect(() => {
    if (waypoints.length === 0 && !showPresetPicker) {
      setShowPresetPicker(true);
    }
  }, [waypoints.length, showPresetPicker]);

  // Calculate waypoint positions in 2D
  const waypointPositions = useMemo(() => {
    return waypoints.map((wp) => {
      const pos3d = angleToPosition(wp.azimuth, wp.elevation, wp.distance, orbitRadius);
      const pos2d = project3D(pos3d, rotation, size);
      return { ...wp, pos3d, pos2d };
    });
  }, [waypoints, rotation]);

  // Sort waypoints by z-depth for proper rendering order
  const sortedWaypoints = useMemo(() => {
    return [...waypointPositions].sort((a, b) => a.pos2d.scale - b.pos2d.scale);
  }, [waypointPositions]);

  // Generate path between waypoints
  const pathPoints = useMemo(() => {
    if (waypointPositions.length < 2) return '';
    const points = waypointPositions.map((wp) => `${wp.pos2d.x},${wp.pos2d.y}`);
    // Close the loop back to start
    points.push(points[0]);
    return `M ${points.join(' L ')}`;
  }, [waypointPositions]);

  // Handle rotation drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.waypoint-marker')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setRotation((prev) => ({
      x: Math.max(-Math.PI / 3, Math.min(Math.PI / 3, prev.x + dy * 0.01)),
      y: prev.y + dx * 0.01,
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Load a preset
  const handleLoadPreset = useCallback((preset: MultiAnglePreset) => {
    // Clear existing waypoints
    waypoints.forEach((wp) => {
      dispatch({ type: 'REMOVE_WAYPOINT', payload: wp.id });
    });

    // Add waypoints from preset
    const anglesToAdd = preset.angles
      .filter((a) => !a.isOriginal)
      .slice(0, MAX_WAYPOINTS);

    anglesToAdd.forEach((angle, index) => {
      const newWaypoint: Waypoint = {
        id: uuidv4(),
        azimuth: angle.azimuth as AzimuthKey,
        elevation: angle.elevation as ElevationKey,
        distance: angle.distance as DistanceKey,
        status: 'pending',
      };
      dispatch({ type: 'ADD_WAYPOINT', payload: newWaypoint });
      if (index === 0) {
        dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: 0 });
      }
    });

    setShowPresetPicker(false);
    showToast({ message: `Loaded "${preset.label}"`, type: 'success' });
  }, [waypoints, dispatch, showToast]);

  // Select a waypoint
  const handleSelectWaypoint = useCallback((index: number) => {
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: index });
  }, [dispatch]);

  // Delete selected waypoint
  const handleDeleteWaypoint = useCallback(() => {
    if (waypoints.length <= 1) {
      showToast({ message: 'Need at least 1 waypoint', type: 'warning' });
      return;
    }
    const wp = waypoints[currentWaypointIndex];
    if (wp) {
      dispatch({ type: 'REMOVE_WAYPOINT', payload: wp.id });
      dispatch({
        type: 'SET_CURRENT_WAYPOINT_INDEX',
        payload: Math.max(0, currentWaypointIndex - 1),
      });
    }
  }, [waypoints, currentWaypointIndex, dispatch, showToast]);

  // Add waypoint at a position
  const handleAddWaypoint = useCallback(() => {
    if (waypoints.length >= MAX_WAYPOINTS) {
      showToast({ message: `Maximum ${MAX_WAYPOINTS} waypoints`, type: 'warning' });
      return;
    }

    // Find a unique position
    const usedAzimuths = new Set(waypoints.map((w) => w.azimuth));
    let newAzimuth: AzimuthKey = 'front';
    for (const az of AZIMUTHS) {
      if (!usedAzimuths.has(az.key)) {
        newAzimuth = az.key;
        break;
      }
    }

    const newWaypoint: Waypoint = {
      id: uuidv4(),
      azimuth: newAzimuth,
      elevation: 'eye-level',
      distance: 'medium',
      status: 'pending',
    };

    dispatch({ type: 'ADD_WAYPOINT', payload: newWaypoint });
    dispatch({ type: 'SET_CURRENT_WAYPOINT_INDEX', payload: waypoints.length });
    showToast({ message: 'Waypoint added', type: 'success' });
  }, [waypoints, dispatch, showToast]);

  // Cycle through azimuth for selected waypoint
  const handleCycleAzimuth = useCallback((direction: 1 | -1) => {
    const wp = waypoints[currentWaypointIndex];
    if (!wp) return;

    const currentIdx = AZIMUTHS.findIndex((a) => a.key === wp.azimuth);
    const newIdx = (currentIdx + direction + AZIMUTHS.length) % AZIMUTHS.length;
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: { id: wp.id, updates: { azimuth: AZIMUTHS[newIdx].key, status: 'pending' } },
    });
  }, [waypoints, currentWaypointIndex, dispatch]);

  // Cycle through elevation for selected waypoint
  const handleCycleElevation = useCallback((direction: 1 | -1) => {
    const wp = waypoints[currentWaypointIndex];
    if (!wp) return;

    const currentIdx = ELEVATIONS.findIndex((e) => e.key === wp.elevation);
    const newIdx = (currentIdx + direction + ELEVATIONS.length) % ELEVATIONS.length;
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: { id: wp.id, updates: { elevation: ELEVATIONS[newIdx].key, status: 'pending' } },
    });
  }, [waypoints, currentWaypointIndex, dispatch]);

  // Cycle through distance for selected waypoint
  const handleCycleDistance = useCallback((direction: 1 | -1) => {
    const wp = waypoints[currentWaypointIndex];
    if (!wp) return;

    const currentIdx = DISTANCES.findIndex((d) => d.key === wp.distance);
    const newIdx = (currentIdx + direction + DISTANCES.length) % DISTANCES.length;
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: { id: wp.id, updates: { distance: DISTANCES[newIdx].key, status: 'pending' } },
    });
  }, [waypoints, currentWaypointIndex, dispatch]);

  const selectedWaypoint = waypoints[currentWaypointIndex];
  const canGenerate = waypoints.length >= MIN_WAYPOINTS && !isGenerating;

  // Render the orbital visualization
  const renderOrbit = () => {
    // Generate orbital ring points
    const ringPoints: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const pos3d = {
        x: orbitRadius * Math.sin(angle),
        y: 0,
        z: orbitRadius * Math.cos(angle),
      };
      const pos2d = project3D(pos3d, rotation, size);
      ringPoints.push(`${pos2d.x},${pos2d.y}`);
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
      >
        {/* Background gradient */}
        <defs>
          <radialGradient id="sphereGradient" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#4B5563" />
            <stop offset="100%" stopColor="#1F2937" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Subject sphere (the person being photographed) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={35}
          fill="url(#sphereGradient)"
          stroke="#6B7280"
          strokeWidth="1"
        />

        {/* Orbital ring */}
        <path
          d={`M ${ringPoints.join(' L ')} Z`}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="1"
          strokeOpacity="0.3"
        />

        {/* Path connecting waypoints */}
        {pathPoints && (
          <path
            d={pathPoints}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeOpacity="0.6"
            strokeDasharray="4 2"
          />
        )}

        {/* Waypoint markers - render in depth order */}
        {sortedWaypoints.map((wp) => {
          const originalIdx = waypoints.findIndex((w) => w.id === wp.id);
          const isSelected = originalIdx === currentWaypointIndex;
          const isHovered = hoveredWaypoint === wp.id;
          const markerSize = 12 * wp.pos2d.scale;
          const opacity = wp.pos2d.behind ? 0.4 : 1;

          // Status colors
          let fillColor = '#3B82F6'; // blue - pending
          if (wp.status === 'generating') fillColor = '#F59E0B'; // yellow
          if (wp.status === 'ready') fillColor = '#10B981'; // green
          if (wp.status === 'failed') fillColor = '#EF4444'; // red

          return (
            <g
              key={wp.id}
              className="waypoint-marker"
              style={{ cursor: 'pointer', opacity }}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectWaypoint(originalIdx);
              }}
              onMouseEnter={() => setHoveredWaypoint(wp.id)}
              onMouseLeave={() => setHoveredWaypoint(null)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={wp.pos2d.x}
                  cy={wp.pos2d.y}
                  r={markerSize + 6}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2"
                  filter="url(#glow)"
                />
              )}

              {/* Marker circle */}
              <circle
                cx={wp.pos2d.x}
                cy={wp.pos2d.y}
                r={markerSize}
                fill={fillColor}
                stroke={isSelected ? '#fff' : '#1F2937'}
                strokeWidth={isSelected ? 2 : 1}
              />

              {/* Sequence number */}
              <text
                x={wp.pos2d.x}
                y={wp.pos2d.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize={10 * wp.pos2d.scale}
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {originalIdx + 1}
              </text>

              {/* Progress indicator for generating */}
              {wp.status === 'generating' && wp.progress !== undefined && (
                <circle
                  cx={wp.pos2d.x}
                  cy={wp.pos2d.y}
                  r={markerSize + 3}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  strokeDasharray={`${(wp.progress / 100) * Math.PI * 2 * (markerSize + 3)} ${Math.PI * 2 * (markerSize + 3)}`}
                  transform={`rotate(-90 ${wp.pos2d.x} ${wp.pos2d.y})`}
                />
              )}

              {/* Hover tooltip */}
              {(isHovered || isSelected) && !wp.pos2d.behind && (
                <g>
                  <rect
                    x={wp.pos2d.x - 50}
                    y={wp.pos2d.y - markerSize - (wp.status === 'failed' && wp.error ? 44 : 28)}
                    width={100}
                    height={wp.status === 'failed' && wp.error ? 36 : 20}
                    rx={4}
                    fill="rgba(0,0,0,0.9)"
                  />
                  <text
                    x={wp.pos2d.x}
                    y={wp.pos2d.y - markerSize - (wp.status === 'failed' && wp.error ? 30 : 14)}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="10"
                    fontWeight="500"
                  >
                    {getAzimuthConfig(wp.azimuth).label}
                  </text>
                  {wp.status === 'failed' && wp.error && (
                    <text
                      x={wp.pos2d.x}
                      y={wp.pos2d.y - markerSize - 14}
                      textAnchor="middle"
                      fill="#f87171"
                      fontSize="8"
                    >
                      {wp.error.length > 20 ? wp.error.substring(0, 20) + '...' : wp.error}
                    </text>
                  )}
                  {wp.status === 'generating' && wp.progress !== undefined && (
                    <text
                      x={wp.pos2d.x}
                      y={wp.pos2d.y + markerSize + 14}
                      textAnchor="middle"
                      fill="#fbbf24"
                      fontSize="9"
                    >
                      {Math.round(wp.progress)}%
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* Center label */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#9CA3AF"
          fontSize="11"
        >
          Subject
        </text>
      </svg>
    );
  };

  return (
    <div className="orbital-choreographer flex flex-col h-full relative">
      {/* Preset picker - inline content when no waypoints */}
      {showPresetPicker && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto">
          <div className="w-full max-w-sm">
            <h3 className="text-white text-lg font-semibold mb-2 text-center">Choose a Camera Path</h3>
            <p className="text-gray-400 text-sm mb-4 text-center">
              Select a preset to define how the camera orbits your subject.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MULTI_ANGLE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  className="flex flex-col items-center p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all hover:scale-105 border border-gray-700 hover:border-blue-500"
                  onClick={() => handleLoadPreset(preset)}
                >
                  <span className="text-3xl mb-2">{preset.icon}</span>
                  <span className="text-white font-medium text-sm">{preset.label}</span>
                  <span className="text-gray-400 text-xs mt-1">{preset.angles.filter(a => !a.isOriginal).length} angles</span>
                </button>
              ))}
            </div>
            <button
              className="w-full mt-4 py-2 text-gray-400 hover:text-white text-sm"
              onClick={() => setShowPresetPicker(false)}
            >
              Start from scratch
            </button>
          </div>
        </div>
      )}

      {/* Main orbital view */}
      <div className="flex-1 flex items-center justify-center relative" ref={containerRef}>
        {renderOrbit()}

        {/* Rotation hint */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-gray-500 text-xs">
          Drag to rotate view
        </div>
      </div>

      {/* Selected waypoint controls */}
      {selectedWaypoint && !showPresetPicker && (
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-medium">
              Waypoint {currentWaypointIndex + 1}
            </span>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                onClick={() => setShowPresetPicker(true)}
                title="Choose a different camera path preset"
              >
                Change Preset
              </button>
              <button
                className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAddWaypoint}
                disabled={waypoints.length >= MAX_WAYPOINTS}
                title={waypoints.length >= MAX_WAYPOINTS ? `Maximum ${MAX_WAYPOINTS} waypoints` : 'Add another camera angle'}
              >
                + Add
              </button>
              <button
                className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeleteWaypoint}
                disabled={waypoints.length <= 1}
                title={waypoints.length <= 1 ? 'Cannot delete the last waypoint' : 'Remove this waypoint'}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Angle controls */}
          <div className="grid grid-cols-3 gap-2">
            {/* Azimuth */}
            <div className="flex items-center justify-between bg-gray-900/50 rounded px-2 py-1">
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleAzimuth(-1)}
                aria-label="Rotate camera counter-clockwise"
                title="Rotate counter-clockwise"
              >
                ‹
              </button>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase">Angle</div>
                <div className="text-white text-sm">{getAzimuthConfig(selectedWaypoint.azimuth).label}</div>
              </div>
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleAzimuth(1)}
                aria-label="Rotate camera clockwise"
                title="Rotate clockwise"
              >
                ›
              </button>
            </div>

            {/* Elevation */}
            <div className="flex items-center justify-between bg-gray-900/50 rounded px-2 py-1">
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleElevation(-1)}
                aria-label="Lower camera angle"
                title="Lower angle"
              >
                ‹
              </button>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase">Height</div>
                <div className="text-white text-sm">{getElevationConfig(selectedWaypoint.elevation).label}</div>
              </div>
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleElevation(1)}
                aria-label="Raise camera angle"
                title="Raise angle"
              >
                ›
              </button>
            </div>

            {/* Distance */}
            <div className="flex items-center justify-between bg-gray-900/50 rounded px-2 py-1">
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleDistance(-1)}
                aria-label="Move camera closer"
                title="Zoom in"
              >
                ‹
              </button>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase">Zoom</div>
                <div className="text-white text-sm">{getDistanceConfig(selectedWaypoint.distance).label}</div>
              </div>
              <button
                className="text-gray-400 hover:text-white px-1 transition-colors"
                onClick={() => handleCycleDistance(1)}
                aria-label="Move camera farther"
                title="Zoom out"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sequence timeline */}
      {waypoints.length > 0 && !showPresetPicker && (
        <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700">
          <div className="flex items-center gap-1 overflow-x-auto">
            {waypoints.map((wp, idx) => {
              const isSelected = idx === currentWaypointIndex;
              let bgColor = 'bg-gray-700';
              if (wp.status === 'generating') bgColor = 'bg-yellow-600';
              if (wp.status === 'ready') bgColor = 'bg-green-600';
              if (wp.status === 'failed') bgColor = 'bg-red-600';

              return (
                <React.Fragment key={wp.id}>
                  <button
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${bgColor} ${
                      isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900' : ''
                    }`}
                    onClick={() => handleSelectWaypoint(idx)}
                  >
                    {wp.status === 'generating' ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : wp.status === 'ready' ? (
                      '✓'
                    ) : wp.status === 'failed' ? (
                      '!'
                    ) : (
                      idx + 1
                    )}
                  </button>
                  {idx < waypoints.length - 1 && (
                    <div className="flex-shrink-0 w-4 h-0.5 bg-gray-600" />
                  )}
                </React.Fragment>
              );
            })}
            {/* Loop indicator */}
            <div className="flex-shrink-0 w-4 h-0.5 bg-gray-600" />
            <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-500 text-xs">
              ↺
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      {!showPresetPicker && (
        <div className="p-4 bg-gray-900 border-t border-gray-800">
          {/* Status indicator for failed waypoints */}
          {waypoints.some(wp => wp.status === 'failed') && (
            <div className="mb-3 p-2 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-red-400 text-sm font-medium">
                {waypoints.filter(wp => wp.status === 'failed').length} angle{waypoints.filter(wp => wp.status === 'failed').length !== 1 ? 's' : ''} failed to generate
              </p>
              <p className="text-red-400/70 text-xs mt-1">
                Click "Generate" to retry failed angles
              </p>
            </div>
          )}

          <button
            className={`w-full py-3 rounded-lg font-medium transition-all ${
              canGenerate
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </span>
            ) : waypoints.length < MIN_WAYPOINTS ? (
              <span className="flex flex-col">
                <span>Need {MIN_WAYPOINTS} waypoints minimum</span>
                <span className="text-xs opacity-70">Currently have {waypoints.length}</span>
              </span>
            ) : waypoints.some(wp => wp.status === 'failed') ? (
              `Retry Failed (${waypoints.filter(wp => wp.status === 'failed').length})`
            ) : waypoints.every(wp => wp.status === 'ready') ? (
              'All Angles Generated ✓'
            ) : (
              `Generate ${waypoints.filter(wp => wp.status === 'pending').length} Angle${waypoints.filter(wp => wp.status === 'pending').length !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default OrbitalChoreographer;
