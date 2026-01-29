import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint, AzimuthKey, ElevationKey, DistanceKey } from '../types';
import {
  MIN_WAYPOINTS,
  MAX_WAYPOINTS,
  MULTI_ANGLE_PRESETS
} from '../constants/cameraAngleSettings';
import type { MultiAnglePreset } from '../types/cameraAngle';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';
import AngleReviewPanel from './AngleReviewPanel';

const SPARK_PER_ANGLE = 2.59;
const USD_PER_SPARK = 0.005;

const WaypointEditor: React.FC = () => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject } = state;
  const [isGenerating, setIsGenerating] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('custom');
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasAutoLoadedPreset = useRef(false);

  const waypoints = currentProject?.waypoints || [];

  useEffect(() => {
    if (waypoints.length === 0 && !hasAutoLoadedPreset.current) {
      hasAutoLoadedPreset.current = true;
      const defaultPreset = MULTI_ANGLE_PRESETS.find(p => p.key === 'zoom-out-360');
      if (defaultPreset) {
        handleLoadPreset(defaultPreset);
        setSelectedPresetKey('zoom-out-360');
      }
    }
  }, [waypoints.length]);

  useEffect(() => {
    return () => { hasAutoLoadedPreset.current = false; };
  }, []);

  const anglesToGenerate = waypoints.filter(wp => !wp.isOriginal).length;
  const totalSpark = anglesToGenerate * SPARK_PER_ANGLE;
  const totalUsd = totalSpark * USD_PER_SPARK;

  const handleLoadPreset = useCallback((preset: MultiAnglePreset) => {
    const anglesToAdd = preset.angles.slice(0, MAX_WAYPOINTS);
    const newWaypoints: Waypoint[] = anglesToAdd.map((angle) => {
      const isOriginal = angle.isOriginal === true;
      return {
        id: uuidv4(),
        azimuth: angle.azimuth as AzimuthKey,
        elevation: angle.elevation as ElevationKey,
        distance: angle.distance as DistanceKey,
        status: isOriginal ? 'ready' : 'pending',
        isOriginal,
        imageUrl: isOriginal ? currentProject?.sourceImageUrl : undefined
      };
    });
    dispatch({ type: 'SET_WAYPOINTS', payload: newWaypoints });
    setSelectedPresetKey(preset.key);
  }, [dispatch, currentProject?.sourceImageUrl]);

  const handleAddWaypoint = useCallback(() => {
    if (waypoints.length >= MAX_WAYPOINTS) {
      showToast({ message: `Maximum ${MAX_WAYPOINTS} angles allowed`, type: 'warning' });
      return;
    }
    const newWaypoint: Waypoint = {
      id: uuidv4(),
      azimuth: 'front',
      elevation: 'eye-level',
      distance: 'medium',
      status: 'pending'
    };
    dispatch({ type: 'ADD_WAYPOINT', payload: newWaypoint });
    setSelectedPresetKey('custom');
    setTimeout(() => {
      carouselRef.current?.scrollTo({ left: carouselRef.current.scrollWidth, behavior: 'smooth' });
    }, 100);
  }, [waypoints.length, dispatch, showToast]);

  const handleRemoveWaypoint = useCallback((id: string) => {
    if (waypoints.length <= 1) {
      showToast({ message: 'At least 1 angle required', type: 'warning' });
      return;
    }
    dispatch({ type: 'REMOVE_WAYPOINT', payload: id });
    setSelectedPresetKey('custom');
  }, [waypoints.length, dispatch, showToast]);

  const handleToggleOriginal = useCallback((waypoint: Waypoint) => {
    const hasOtherOriginal = waypoints.some(wp => wp.isOriginal && wp.id !== waypoint.id);
    if (!waypoint.isOriginal && hasOtherOriginal) {
      showToast({ message: 'Only one angle can use the original perspective', type: 'warning' });
      return;
    }
    const newIsOriginal = !waypoint.isOriginal;
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: {
        id: waypoint.id,
        updates: {
          isOriginal: newIsOriginal,
          status: newIsOriginal ? 'ready' : 'pending',
          imageUrl: newIsOriginal ? currentProject?.sourceImageUrl : undefined
        }
      }
    });
    setSelectedPresetKey('custom');
  }, [waypoints, dispatch, showToast, currentProject?.sourceImageUrl]);

  const handleUpdateWaypoint = useCallback((id: string, updates: Partial<Waypoint>) => {
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: { id, updates: { ...updates, status: 'pending' } }
    });
    setSelectedPresetKey('custom');
  }, [dispatch]);

  const handleGenerateAngles = useCallback(async () => {
    if (!currentProject?.sourceImageUrl) {
      showToast({ message: 'No source image', type: 'error' });
      return;
    }
    if (waypoints.length < MIN_WAYPOINTS) {
      showToast({ message: `Add at least ${MIN_WAYPOINTS} angles`, type: 'warning' });
      return;
    }

    setShowReviewPanel(true);
    setIsGenerating(true);
    dispatch({ type: 'SET_PROJECT_STATUS', payload: 'generating-angles' });

    const waypointsToGenerate = waypoints.filter(wp => !wp.isOriginal);
    for (const wp of waypointsToGenerate) {
      dispatch({
        type: 'UPDATE_WAYPOINT',
        payload: { id: wp.id, updates: { status: 'generating', progress: 0, error: undefined } }
      });
    }

    try {
      await generateMultipleAngles(
        currentProject.sourceImageUrl,
        waypoints,
        currentProject.sourceImageDimensions.width,
        currentProject.sourceImageDimensions.height,
        {
          tokenType: currentProject.settings.tokenType,
          onWaypointStart: (waypointId) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: waypointId, updates: { status: 'generating', progress: 0 } } });
          },
          onWaypointProgress: (waypointId, progress) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: waypointId, updates: { progress } } });
          },
          onWaypointComplete: (waypointId, imageUrl) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: waypointId, updates: { status: 'ready', imageUrl, progress: 100, error: undefined } } });
          },
          onWaypointError: (waypointId, error) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: waypointId, updates: { status: 'failed', error: error.message, progress: 0, imageUrl: undefined } } });
          },
          onAllComplete: () => {
            setIsGenerating(false);
            dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
          }
        }
      );
    } catch (error) {
      console.error('[WaypointEditor] Generation error:', error);
      setIsGenerating(false);
      dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
      for (const wp of waypoints) {
        if (wp.status === 'generating') {
          dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: wp.id, updates: { status: 'failed', error: 'Generation interrupted', progress: 0 } } });
        }
      }
      showToast({ message: 'Generation failed: ' + (error instanceof Error ? error.message : 'Unknown error'), type: 'error' });
    }
  }, [currentProject, waypoints, dispatch, showToast]);

  const handleReviewClose = useCallback(() => {
    setShowReviewPanel(false);
    if (isGenerating) {
      for (const wp of waypoints) {
        if (wp.status === 'generating') {
          dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: wp.id, updates: { status: 'pending', progress: 0 } } });
        }
      }
      setIsGenerating(false);
      dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
    }
  }, [isGenerating, waypoints, dispatch]);

  const handleReviewApply = useCallback(() => {
    setShowReviewPanel(false);
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false });
    showToast({ message: 'Angles applied to gallery', type: 'success' });
  }, [dispatch, showToast]);

  const canGenerate = waypoints.length >= MIN_WAYPOINTS && !isGenerating;

  if (showReviewPanel) {
    return <AngleReviewPanel onClose={handleReviewClose} onApply={handleReviewApply} isGenerating={isGenerating} />;
  }

  return (
    <div className="waypoint-editor-carousel">
      {/* Preset tabs */}
      <div className="preset-tabs">
        {MULTI_ANGLE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            className={`preset-tab ${selectedPresetKey === preset.key ? 'active' : ''}`}
            onClick={() => handleLoadPreset(preset)}
            disabled={isGenerating}
          >
            <span className="preset-icon">{preset.icon}</span>
            <span className="preset-label">{preset.label}</span>
          </button>
        ))}
        <button
          className={`preset-tab ${selectedPresetKey === 'custom' ? 'active' : ''}`}
          onClick={() => setSelectedPresetKey('custom')}
          disabled={isGenerating}
        >
          <span className="preset-icon">✏️</span>
          <span className="preset-label">Custom</span>
        </button>
      </div>

      {/* Horizontal carousel - large tiles, scrollable */}
      <div className="angle-carousel" ref={carouselRef}>
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="angle-card">
            {/* Delete button */}
            {waypoints.length > 1 && (
              <button
                className="angle-card-delete"
                onClick={() => handleRemoveWaypoint(waypoint.id)}
                disabled={isGenerating}
                title="Remove angle"
              >
                ×
              </button>
            )}

            {/* Card number */}
            <div className="angle-card-number">{index + 1}</div>

            {/* Large thumbnail - preserves aspect ratio */}
            <div
              className={`angle-card-thumbnail ${waypoint.isOriginal ? 'is-original' : ''}`}
              style={{
                aspectRatio: currentProject?.sourceImageDimensions
                  ? `${currentProject.sourceImageDimensions.width} / ${currentProject.sourceImageDimensions.height}`
                  : '3 / 4'
              }}
            >
              {waypoint.imageUrl ? (
                <img src={waypoint.imageUrl} alt={`Angle ${index + 1}`} />
              ) : currentProject?.sourceImageUrl ? (
                <img
                  src={currentProject.sourceImageUrl}
                  alt={`Angle ${index + 1}`}
                  className={waypoint.isOriginal ? '' : 'opacity-40'}
                />
              ) : (
                <div className="thumbnail-placeholder">#{index + 1}</div>
              )}

              {waypoint.status === 'generating' && (
                <div className="generating-overlay">
                  <div className="spinner" />
                  {waypoint.progress !== undefined && waypoint.progress > 0 && (
                    <span className="progress-text">{Math.round(waypoint.progress)}%</span>
                  )}
                </div>
              )}

              {waypoint.status === 'ready' && waypoint.isOriginal && (
                <div className="status-badge original">★</div>
              )}
              {waypoint.status === 'ready' && !waypoint.isOriginal && (
                <div className="status-badge ready">✓</div>
              )}
              {waypoint.status === 'failed' && (
                <div className="status-badge failed">!</div>
              )}
            </div>

            {/* Use original checkbox */}
            <label className="original-checkbox">
              <input
                type="checkbox"
                checked={waypoint.isOriginal || false}
                onChange={() => handleToggleOriginal(waypoint)}
                disabled={isGenerating}
              />
              <span>Use original</span>
            </label>

            {/* 3D Control for non-original angles */}
            {!waypoint.isOriginal && (
              <div className="angle-card-3d-control">
                <CameraAngle3DControl
                  azimuth={waypoint.azimuth}
                  elevation={waypoint.elevation}
                  distance={waypoint.distance}
                  onAzimuthChange={(azimuth) => handleUpdateWaypoint(waypoint.id, { azimuth })}
                  onElevationChange={(elevation) => handleUpdateWaypoint(waypoint.id, { elevation })}
                  onDistanceChange={(distance) => handleUpdateWaypoint(waypoint.id, { distance })}
                  size="card"
                />
              </div>
            )}

            {waypoint.isOriginal && (
              <div className="original-info">Source Image</div>
            )}
          </div>
        ))}

        {/* Add angle card at the end */}
        {waypoints.length < MAX_WAYPOINTS && (
          <div className="angle-card add-card" onClick={handleAddWaypoint}>
            <div className="add-card-content">
              <div className="add-icon">+</div>
              <div className="add-label">Add Angle</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="editor-footer">
        <div className="cost-estimate">
          <div className="cost-breakdown">
            {anglesToGenerate} angle{anglesToGenerate !== 1 ? 's' : ''} × 1 image
          </div>
          <div className="cost-total">
            {totalSpark.toFixed(2)} spark ≈ ${totalUsd.toFixed(2)}
          </div>
        </div>
        <div className="footer-actions">
          <button
            className="btn btn-ghost"
            onClick={() => dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false })}
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            className={`btn ${canGenerate ? 'btn-primary' : 'btn-disabled'}`}
            onClick={handleGenerateAngles}
            disabled={!canGenerate}
          >
            {isGenerating ? 'Generating...' : `Generate ${anglesToGenerate} Angle${anglesToGenerate !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaypointEditor;
