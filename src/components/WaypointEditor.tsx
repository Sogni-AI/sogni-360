import React, { useCallback, useState, useEffect, useRef } from 'react';
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
  DISTANCES
} from '../constants/cameraAngleSettings';
import type { MultiAnglePreset } from '../types/cameraAngle';
import WorkflowWizard, { WorkflowStep, computeWorkflowStep } from './shared/WorkflowWizard';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';
import AngleReviewPanel from './AngleReviewPanel';
import { warmUpAudio, playSogniSignatureIfEnabled } from '../utils/sonicLogos';
import { useImageCostEstimation } from '../hooks/useImageCostEstimation';
import { trackAngleGeneration, trackPresetSelection } from '../utils/analytics';

interface WaypointEditorProps {
  onClose: () => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
  onRequireAuth?: () => void;
  onOutOfCredits?: () => void;
}

const WaypointEditor: React.FC<WaypointEditorProps> = ({
  onClose,
  onConfirmDestructiveAction,
  onWorkflowStepClick,
  onRequireAuth,
  onOutOfCredits
}) => {
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
      const defaultPreset = MULTI_ANGLE_PRESETS.find(p => p.key === 'zoom-montage');
      if (defaultPreset) {
        handleLoadPreset(defaultPreset);
        setSelectedPresetKey('zoom-montage');
      }
    }
  }, [waypoints.length]);

  // Reset scroll position to the start when component mounts
  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = 0;
    }
  }, []);

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

  // Workflow step
  const { currentStep, completedSteps } = computeWorkflowStep(currentProject);

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
  }, [dispatch, currentProject?.sourceImageUrl]);

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
          onOutOfCredits: () => {
            onOutOfCredits?.();
          },
          onAllComplete: () => {
            setIsGenerating(false);
            dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
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
  }, [currentProject, waypoints, dispatch, showToast, selectedPresetKey, onOutOfCredits]);

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
        onOutOfCredits={onOutOfCredits}
      />
    );
  }

  return (
    <div className="config-panel">
      {/* Wizard Progress Bar */}
      <div className="review-wizard-wrap">
        <WorkflowWizard
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={onWorkflowStepClick}
        />
      </div>

      {/* Header */}
      <div className="config-header-bar">
        <div>
          <h2 className="config-main-title">Configure Camera Angles</h2>
          <p className="config-main-subtitle">{waypoints.length} angles configured</p>
        </div>
        <button className="review-close" onClick={onClose}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preset Tabs */}
      <div className="config-preset-bar">
        {MULTI_ANGLE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            className={`preset-chip ${selectedPresetKey === preset.key ? 'active' : ''}`}
            onClick={() => handleLoadPreset(preset)}
            disabled={isGenerating}
          >
            <span className="preset-chip-icon">{preset.icon}</span>
            <span className="preset-chip-label">{preset.label}</span>
          </button>
        ))}
        <button
          className={`preset-chip ${selectedPresetKey === 'custom' ? 'active' : ''}`}
          onClick={() => setSelectedPresetKey('custom')}
          disabled={isGenerating}
        >
          <span className="preset-chip-icon">✏️</span>
          <span className="preset-chip-label">Custom</span>
        </button>
      </div>

      {/* Carousel - Cards expand to fill vertical space */}
      <div className="config-carousel-wrap" ref={carouselRef}>
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="config-card">
            {/* Card Header */}
            <div className="config-card-top">
              <div className="config-card-top-left">
                <span className="config-card-step-num">Step {index + 1}</span>
                {waypoint.isOriginal && <span className="config-card-orig-tag">Original</span>}
              </div>
              {/* Delete button */}
              {waypoints.length > 1 && (
                <button
                  className="config-card-delete"
                  onClick={() => handleRemoveWaypoint(waypoint.id)}
                  disabled={isGenerating}
                  title="Remove angle"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Main Content Area - Image or 3D Control */}
            <div className="config-card-main">
              {waypoint.isOriginal ? (
                // Original: Show source image
                currentProject?.sourceImageUrl ? (
                  <img src={currentProject.sourceImageUrl} alt="Original" />
                ) : (
                  <div className="config-card-placeholder">No image</div>
                )
              ) : (
                // Non-original: Show source image dimmed with 3D control overlay
                <>
                  {currentProject?.sourceImageUrl && (
                    <img src={currentProject.sourceImageUrl} alt="Preview" className="dimmed" />
                  )}
                  <div className="config-card-3d-overlay">
                    <CameraAngle3DControl
                      azimuth={waypoint.azimuth}
                      elevation={waypoint.elevation}
                      distance={waypoint.distance}
                      onAzimuthChange={(azimuth) => handleUpdateWaypoint(waypoint.id, { azimuth })}
                      onElevationChange={(elevation) => handleUpdateWaypoint(waypoint.id, { elevation })}
                      onDistanceChange={(distance) => handleUpdateWaypoint(waypoint.id, { distance })}
                      size="full"
                    />
                  </div>
                </>
              )}

              {/* Status badge for original */}
              {waypoint.isOriginal && (
                <div className="config-card-check">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="config-card-info">
              {waypoint.isOriginal ? (
                <div className="config-card-angle">Original Image</div>
              ) : (
                <div className="config-card-angle-selectors">
                  <select
                    className="angle-select"
                    value={waypoint.azimuth}
                    onChange={(e) => handleUpdateWaypoint(waypoint.id, { azimuth: e.target.value as AzimuthKey })}
                    disabled={isGenerating}
                  >
                    {AZIMUTHS.map(az => (
                      <option key={az.key} value={az.key}>{az.label}</option>
                    ))}
                  </select>
                  <span className="angle-separator">·</span>
                  <select
                    className="angle-select"
                    value={waypoint.elevation}
                    onChange={(e) => handleUpdateWaypoint(waypoint.id, { elevation: e.target.value as ElevationKey })}
                    disabled={isGenerating}
                  >
                    {ELEVATIONS.map(el => (
                      <option key={el.key} value={el.key}>{el.label}</option>
                    ))}
                  </select>
                  <span className="angle-separator">·</span>
                  <select
                    className="angle-select"
                    value={waypoint.distance}
                    onChange={(e) => handleUpdateWaypoint(waypoint.id, { distance: e.target.value as DistanceKey })}
                    disabled={isGenerating}
                  >
                    {DISTANCES.map(d => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Use original toggle */}
              <label className="config-card-original-toggle">
                <input
                  type="checkbox"
                  checked={waypoint.isOriginal || false}
                  onChange={() => handleToggleOriginal(waypoint)}
                  disabled={isGenerating}
                />
                <span>Use original image</span>
              </label>
            </div>
          </div>
        ))}

        {/* Add Step Card */}
        {waypoints.length < MAX_WAYPOINTS && (
          <button
            className="config-card config-card-add"
            onClick={handleAddWaypoint}
            disabled={isGenerating}
          >
            <div className="config-card-add-content">
              <div className="config-card-add-icon">+</div>
              <div className="config-card-add-label">Add Step</div>
              <div className="config-card-add-count">{waypoints.length}/{MAX_WAYPOINTS}</div>
            </div>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="config-footer-bar">
        <div className="config-status-tags">
          <span className="status-tag pending">
            {anglesToGenerate} to generate
          </span>
          <span className="config-cost">
            {costLoading ? 'Calculating...' : `${formattedCost} spark ≈ ${formattedUSD}`}
          </span>
        </div>
        <div className="config-footer-actions">
          <button className="config-btn cancel" onClick={onClose} disabled={isGenerating}>
            Cancel
          </button>
          <button
            className={`config-btn primary ${!canGenerate ? 'disabled' : ''}`}
            onClick={handleGenerateAngles}
            disabled={!canGenerate}
          >
            {isGenerating ? 'Generating...' : `Generate ${anglesToGenerate} Angle${anglesToGenerate !== 1 ? 's' : ''}`}
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaypointEditor;
