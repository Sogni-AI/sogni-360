import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { v4 as uuidv4 } from 'uuid';
import type { Waypoint, AzimuthKey, ElevationKey, DistanceKey } from '../types';
import {
  MIN_WAYPOINTS,
  MAX_WAYPOINTS,
  MULTI_ANGLE_PRESETS,
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../constants/cameraAngleSettings';
import type { MultiAnglePreset } from '../types/cameraAngle';
import type { WorkflowStep } from './shared/WorkflowWizard';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';
import AngleReviewPanel from './AngleReviewPanel';
import { warmUpAudio, playSogniSignatureIfEnabled } from '../utils/sonicLogos';
import { useImageCostEstimation } from '../hooks/useImageCostEstimation';
import { trackAngleGeneration, trackPresetSelection } from '../utils/analytics';

interface WaypointEditorProps {
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
  onRequireAuth?: () => void;
}

/**
 * Get a human-readable label for a waypoint's angle
 */
function getAngleLabel(waypoint: Waypoint): string {
  if (waypoint.isOriginal) return 'Original Image';
  const az = getAzimuthConfig(waypoint.azimuth);
  const el = getElevationConfig(waypoint.elevation);
  const dist = getDistanceConfig(waypoint.distance);
  return `${az.label} · ${el.label} · ${dist.label}`;
}

const WaypointEditor: React.FC<WaypointEditorProps> = ({ onConfirmDestructiveAction, onWorkflowStepClick, onRequireAuth }) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, showAngleReview, isAuthenticated, hasUsedFreeGeneration } = state;
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('custom');
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasAutoLoadedPreset = useRef(false);

  const waypoints = currentProject?.waypoints || [];

  useEffect(() => {
    if (waypoints.length === 0 && !hasAutoLoadedPreset.current) {
      hasAutoLoadedPreset.current = true;
      const defaultPreset = MULTI_ANGLE_PRESETS.find(p => p.key === 'zoom-out-360-9');
      if (defaultPreset) {
        handleLoadPreset(defaultPreset);
        setSelectedPresetKey('zoom-out-360-9');
      }
    }
  }, [waypoints.length]);

  useEffect(() => {
    return () => { hasAutoLoadedPreset.current = false; };
  }, []);

  const anglesToGenerate = waypoints.filter(wp => !wp.isOriginal).length;

  // Get cost estimate from API
  const { loading: costLoading, formattedCost, formattedUSD } = useImageCostEstimation({
    imageCount: anglesToGenerate,
    tokenType: currentProject?.settings.tokenType || 'spark',
    enabled: anglesToGenerate > 0
  });

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
    trackPresetSelection(preset.key);
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

  // Actual generation logic (called after confirmation if needed)
  const executeGenerateAngles = useCallback(async () => {
    if (!currentProject?.sourceImageUrl) {
      showToast({ message: 'No source image', type: 'error' });
      return;
    }

    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: true });
    setIsGenerating(true);
    dispatch({ type: 'SET_PROJECT_STATUS', payload: 'generating-angles' });

    const waypointsToGenerate = waypoints.filter(wp => !wp.isOriginal);
    for (const wp of waypointsToGenerate) {
      dispatch({
        type: 'UPDATE_WAYPOINT',
        payload: { id: wp.id, updates: { status: 'generating', progress: 0, error: undefined } }
      });
    }

    // Track angle generation
    trackAngleGeneration({
      angle_count: waypointsToGenerate.length,
      preset_name: selectedPresetKey,
      source: 'upload'
    });

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
          onWaypointComplete: (waypointId, result) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: {
              id: waypointId,
              updates: {
                status: 'ready',
                imageUrl: result.imageUrl,
                progress: 100,
                error: undefined,
                sdkProjectId: result.sdkProjectId,
                sdkJobId: result.sdkJobId
              }
            } });
          },
          onWaypointError: (waypointId, error) => {
            dispatch({ type: 'UPDATE_WAYPOINT', payload: { id: waypointId, updates: { status: 'failed', error: error.message, progress: 0, imageUrl: undefined } } });
          },
          onAllComplete: () => {
            setIsGenerating(false);
            dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
            // Play sound when all angles complete
            playSogniSignatureIfEnabled();
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

  // Handle generate button click - confirms if work would be lost
  const handleGenerateAngles = useCallback(() => {
    if (!currentProject?.sourceImageUrl) {
      showToast({ message: 'No source image', type: 'error' });
      return;
    }
    if (waypoints.length < MIN_WAYPOINTS) {
      showToast({ message: `Add at least ${MIN_WAYPOINTS} angles`, type: 'warning' });
      return;
    }

    // Auth gating: require login if user has already used their free generation
    if (!isAuthenticated && hasUsedFreeGeneration) {
      if (onRequireAuth) {
        onRequireAuth();
      }
      return;
    }

    // Mark that user has used their free generation (for unauthenticated users)
    if (!isAuthenticated && !hasUsedFreeGeneration) {
      dispatch({ type: 'SET_HAS_USED_FREE_GENERATION', payload: true });
    }

    // Warm up audio on user interaction for iOS compatibility
    warmUpAudio();

    // Use confirmation callback if provided, otherwise execute directly
    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-angles', executeGenerateAngles);
    } else {
      executeGenerateAngles();
    }
  }, [currentProject?.sourceImageUrl, waypoints.length, onConfirmDestructiveAction, executeGenerateAngles, showToast, isAuthenticated, hasUsedFreeGeneration, onRequireAuth, dispatch]);

  const handleReviewClose = useCallback(() => {
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
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
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false });
    // Automatically open transition config panel
    dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: true });
  }, [dispatch]);

  const canGenerate = waypoints.length >= MIN_WAYPOINTS && !isGenerating;

  if (showAngleReview) {
    return (
      <AngleReviewPanel
        onClose={handleReviewClose}
        onApply={handleReviewApply}
        isGenerating={isGenerating}
        onConfirmDestructiveAction={onConfirmDestructiveAction}
        onWorkflowStepClick={onWorkflowStepClick}
        onRequireAuth={onRequireAuth}
      />
    );
  }

  return (
    <div className="waypoint-editor-timeline">
      {/* Header with presets */}
      <div className="timeline-header">
        <div className="timeline-title">
          <h2>Timeline Editor</h2>
          <p className="timeline-subtitle">
            Create a sequence of camera angles. Each step will generate a new perspective.
          </p>
        </div>
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
      </div>

      {/* Timeline track */}
      <div className="timeline-track" ref={carouselRef}>
        <div className="timeline-steps">
          {waypoints.map((waypoint, index) => (
            <div key={waypoint.id} className="timeline-step">
              {/* Connector line (except first) */}
              {index > 0 && <div className="timeline-connector" />}

              {/* Step card */}
              <div className={`step-card ${waypoint.isOriginal ? 'is-original' : ''}`}>
                {/* Delete button */}
                {waypoints.length > 1 && (
                  <button
                    className="step-delete"
                    onClick={() => handleRemoveWaypoint(waypoint.id)}
                    disabled={isGenerating}
                    title="Remove angle"
                  >
                    ×
                  </button>
                )}

                {/* Step header */}
                <div className="step-header">
                  <div className="step-number">Step {index + 1}</div>
                  {waypoint.isOriginal && (
                    <span className="original-badge">Original</span>
                  )}
                </div>

                {/* Angle label */}
                <div className="step-angle-label">
                  {getAngleLabel(waypoint)}
                </div>

                {/* Use original toggle */}
                <label className="step-original-toggle">
                  <input
                    type="checkbox"
                    checked={waypoint.isOriginal || false}
                    onChange={() => handleToggleOriginal(waypoint)}
                    disabled={isGenerating}
                  />
                  <span>Use original image</span>
                </label>

                {/* Original image preview */}
                {waypoint.isOriginal && currentProject?.sourceImageUrl && (
                  <div className="step-original-preview">
                    <img
                      src={currentProject.sourceImageUrl}
                      alt="Original"
                    />
                  </div>
                )}

                {/* 3D Control for non-original angles */}
                {!waypoint.isOriginal && (
                  <div className="step-3d-control">
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

                {/* Status indicator */}
                {waypoint.status === 'ready' && !waypoint.isOriginal && (
                  <div className="step-status ready">Generated</div>
                )}
                {waypoint.status === 'pending' && !waypoint.isOriginal && (
                  <div className="step-status pending">Pending</div>
                )}
                {waypoint.status === 'failed' && (
                  <div className="step-status failed">Failed</div>
                )}
              </div>
            </div>
          ))}

          {/* Add angle button */}
          {waypoints.length < MAX_WAYPOINTS && (
            <div className="timeline-step">
              {waypoints.length > 0 && <div className="timeline-connector" />}
              <button
                className="step-card add-step"
                onClick={handleAddWaypoint}
                disabled={isGenerating}
              >
                <div className="add-step-icon">+</div>
                <div className="add-step-label">Add Step</div>
                <div className="add-step-count">{waypoints.length}/{MAX_WAYPOINTS}</div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="timeline-footer">
        <div className="cost-estimate">
          <div className="cost-breakdown">
            {anglesToGenerate} angle{anglesToGenerate !== 1 ? 's' : ''} to generate
          </div>
          <div className="cost-total">
            {costLoading ? (
              <span className="cost-loading">Calculating...</span>
            ) : (
              <>{formattedCost} spark ≈ {formattedUSD}</>
            )}
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
