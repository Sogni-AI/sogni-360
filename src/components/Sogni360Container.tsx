import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Segment } from '../types';
import { useApp } from '../context/AppContext';
import { useSogniAuth } from '../services/sogniAuth';
import SourceUploader from './SourceUploader';
import Sogni360Viewer from './Sogni360Viewer';
import WaypointEditor from './WaypointEditor';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import WorkflowWizard, { computeWorkflowStep, WorkflowStep } from './shared/WorkflowWizard';
import TransitionConfigPanel from './TransitionConfigPanel';
import TransitionReviewPanel from './TransitionReviewPanel';
import FinalVideoPanel from './FinalVideoPanel';
import ProjectManagerModal from './ProjectManagerModal';
import WorkflowNavigationModal from './WorkflowNavigationModal';
import NewProjectConfirmModal from './NewProjectConfirmModal';
import ProjectNameModal, { generateProjectName } from './ProjectNameModal';
import useAutoHideUI from '../hooks/useAutoHideUI';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';
import { generateMultipleTransitions } from '../services/TransitionGenerator';
import { duplicateProject, getProjectCount } from '../utils/localProjectsDB';
import { playVideoCompleteIfEnabled, playSogniSignatureIfEnabled } from '../utils/sonicLogos';
import { DEFAULT_VIDEO_SETTINGS } from '../constants/videoSettings';

// Type for pending destructive action that needs confirmation
interface PendingDestructiveAction {
  fromStep: WorkflowStep;
  toStep: WorkflowStep;
  callback: () => void;
}

const Sogni360Container: React.FC = () => {
  const { state, dispatch, setUIVisible, isRestoring, updateSegment, clearProject, loadProjectById } = useApp();
  const { nextWaypoint, previousWaypoint, isTransitionPlaying, targetWaypointIndex } = useTransitionNavigation();
  const { currentProject, showWaypointEditor, currentWaypointIndex, showTransitionConfig, showTransitionReview, showFinalVideoPreview, showProjectManager } = state;
  const hasAutoOpenedEditor = useRef(false);
  const [isTransitionGenerating, setIsTransitionGenerating] = useState(false);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<PendingDestructiveAction | null>(null);
  const [showNewProjectConfirm, setShowNewProjectConfirm] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [projectCount, setProjectCount] = useState(0);

  // Auth state
  const { isAuthenticated, isLoading: authLoading } = useSogniAuth();

  // Auto-hide UI after inactivity
  const isUIAutoVisible = useAutoHideUI(3000);

  // Compute whether we have generated images to navigate
  const waypoints = currentProject?.waypoints || [];
  const readyWaypointCount = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl).length;
  const failedWaypointCount = waypoints.filter(wp => wp.status === 'failed').length;
  // Only enable navigation/playback if we have 2+ ready waypoints AND no failed waypoints
  const hasGeneratedImages = readyWaypointCount >= 2 && failedWaypointCount === 0;
  const isGenerating = currentProject?.status === 'generating-angles';

  // Get current waypoint for 3D control display
  const currentWaypoint = waypoints[currentWaypointIndex];

  // Get target waypoint during video transition for camera animation
  const targetWaypoint = targetWaypointIndex !== null ? waypoints[targetWaypointIndex] : null;

  // Get video duration for camera animation sync
  const videoDuration = currentProject?.settings?.transitionDuration || 1.5;

  // Fetch project count on mount (for clever name generation)
  useEffect(() => {
    getProjectCount().then(setProjectCount).catch(() => setProjectCount(0));
  }, []);

  // Show project name modal when image is uploaded but no waypoints exist (and name is default)
  useEffect(() => {
    if (
      currentProject?.sourceImageUrl &&
      waypoints.length === 0 &&
      !showWaypointEditor &&
      !hasAutoOpenedEditor.current &&
      !isRestoring &&
      !showProjectNameModal &&
      currentProject.name === 'Untitled Project'
    ) {
      hasAutoOpenedEditor.current = true;
      setShowProjectNameModal(true);
    }
  }, [currentProject?.sourceImageUrl, currentProject?.name, waypoints.length, showWaypointEditor, isRestoring, showProjectNameModal]);

  // Reset auto-open flag when project changes
  useEffect(() => {
    if (!currentProject) {
      hasAutoOpenedEditor.current = false;
    }
  }, [currentProject]);

  // Sync auto-hide state with app state
  useEffect(() => {
    setUIVisible(isUIAutoVisible);
  }, [isUIAutoVisible, setUIVisible]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Update auth state in context
  useEffect(() => {
    dispatch({ type: 'SET_AUTHENTICATED', payload: isAuthenticated });
  }, [isAuthenticated, dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (hasGeneratedImages && !isTransitionPlaying) {
            previousWaypoint();
          }
          break;

        case 'ArrowRight':
        case 'd':
        case 'D':
          if (hasGeneratedImages && !isTransitionPlaying) {
            nextWaypoint();
          }
          break;

        case ' ':
          e.preventDefault();
          if (hasGeneratedImages) {
            dispatch({ type: 'SET_PLAYING', payload: !state.isPlaying });
          }
          break;

        case 'Escape':
          if (state.showWaypointEditor) {
            dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false });
          } else if (state.showExportPanel) {
            dispatch({ type: 'SET_SHOW_EXPORT_PANEL', payload: false });
          }
          break;

        case 'e':
        case 'E':
          dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: !showWaypointEditor });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasGeneratedImages, state.isPlaying, state.showWaypointEditor, state.showExportPanel, showWaypointEditor, dispatch, nextWaypoint, previousWaypoint, isTransitionPlaying]);

  // Handle starting transition generation
  const handleStartTransitionGeneration = useCallback(async (passedSegments?: Segment[]) => {
    if (!currentProject) return;

    // Use passed segments (from TransitionConfigPanel) or fall back to state
    const segments = passedSegments || currentProject.segments;
    if (segments.length === 0) return;

    // Build waypoint image map
    const waypointImages = new Map<string, string>();
    currentProject.waypoints.forEach(wp => {
      if (wp.imageUrl) {
        waypointImages.set(wp.id, wp.imageUrl);
      }
    });

    // Switch to review panel
    dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
    dispatch({ type: 'SET_PROJECT_STATUS', payload: 'generating-transitions' });
    setIsTransitionGenerating(true);

    // Get source dimensions - MUST use actual dimensions, not fallbacks
    const sourceWidth = currentProject.sourceImageDimensions?.width;
    const sourceHeight = currentProject.sourceImageDimensions?.height;
    const resolution = currentProject.settings.videoResolution || DEFAULT_VIDEO_SETTINGS.resolution;

    console.log('[Sogni360Container] Transition generation config:', {
      resolution,
      sourceWidth,
      sourceHeight,
      hasSourceDimensions: !!currentProject.sourceImageDimensions,
      settings: currentProject.settings
    });

    if (!sourceWidth || !sourceHeight) {
      console.error('[Sogni360Container] WARNING: sourceImageDimensions is missing! Video will generate at wrong size.');
    }

    try {
      await generateMultipleTransitions(
        segments,
        waypointImages,
        {
          prompt: currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.',
          resolution,
          quality: (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'fast',
          duration: currentProject.settings.transitionDuration || 1.5,
          tokenType: currentProject.settings.tokenType || 'spark',
          sourceWidth: sourceWidth || 1024,  // Default to 1024 if missing
          sourceHeight: sourceHeight || 1024,  // Default to 1024 if missing
          onSegmentStart: (segmentId) => {
            updateSegment(segmentId, { status: 'generating', progress: 0 });
          },
          onSegmentProgress: (segmentId, progress, workerName) => {
            updateSegment(segmentId, { progress, workerName });
          },
          onSegmentComplete: (segmentId, videoUrl, version) => {
            updateSegment(segmentId, { status: 'ready', videoUrl, progress: 100 });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId, version } });
            // Play sound when each transition completes
            playVideoCompleteIfEnabled();
          },
          onSegmentError: (segmentId, error) => {
            updateSegment(segmentId, { status: 'failed', error: error.message });
          },
          onAllComplete: () => {
            setIsTransitionGenerating(false);
            dispatch({ type: 'SET_PROJECT_STATUS', payload: 'complete' });
            // Play signature sound when all transitions complete
            playSogniSignatureIfEnabled();
          }
        }
      );
    } catch (error) {
      console.error('Transition generation error:', error);
      setIsTransitionGenerating(false);
    }
  }, [currentProject, dispatch, updateSegment]);

  // Handle redo of a single segment
  const handleRedoSegment = useCallback(async (segmentId: string) => {
    if (!currentProject) return;

    const segment = currentProject.segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Build waypoint image map
    const waypointImages = new Map<string, string>();
    currentProject.waypoints.forEach(wp => {
      if (wp.imageUrl) {
        waypointImages.set(wp.id, wp.imageUrl);
      }
    });

    // Reset segment to generating
    updateSegment(segmentId, { status: 'generating', progress: 0 });

    // Get source dimensions - MUST use actual dimensions
    const redoSourceWidth = currentProject.sourceImageDimensions?.width;
    const redoSourceHeight = currentProject.sourceImageDimensions?.height;
    const redoResolution = currentProject.settings.videoResolution || DEFAULT_VIDEO_SETTINGS.resolution;

    console.log('[Sogni360Container] Redo transition config:', {
      resolution: redoResolution,
      sourceWidth: redoSourceWidth,
      sourceHeight: redoSourceHeight
    });

    try {
      await generateMultipleTransitions(
        [segment],
        waypointImages,
        {
          prompt: currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.',
          resolution: redoResolution,
          quality: (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'fast',
          duration: currentProject.settings.transitionDuration || 1.5,
          tokenType: currentProject.settings.tokenType || 'spark',
          sourceWidth: redoSourceWidth || 1024,
          sourceHeight: redoSourceHeight || 1024,
          onSegmentProgress: (segmentId, progress, workerName) => {
            updateSegment(segmentId, { progress, workerName });
          },
          onSegmentComplete: (segmentId, videoUrl, version) => {
            updateSegment(segmentId, { status: 'ready', videoUrl, progress: 100 });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId, version } });
            // Play sound when redo transition completes
            playVideoCompleteIfEnabled();
          },
          onSegmentError: (segmentId, error) => {
            updateSegment(segmentId, { status: 'failed', error: error.message });
          }
        }
      );
    } catch (error) {
      console.error('Redo segment error:', error);
    }
  }, [currentProject, dispatch, updateSegment]);

  // Handle video stitching - plays all segments in sequence
  const handleStitchVideos = useCallback(async () => {
    if (!currentProject) return;

    const segments = currentProject.segments;
    const allReady = segments.every(s => s.status === 'ready' && s.videoUrl);
    if (!allReady) return;

    // Get all video URLs for sequential playback
    const videoUrls = segments.map(s => s.videoUrl).filter(Boolean) as string[];

    if (videoUrls.length > 0) {
      dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: false });
      dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: true });
    }
  }, [currentProject, dispatch]);

  // Handle closing final video and returning to editor
  const handleBackToEditor = useCallback(() => {
    dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
  }, [dispatch]);

  // Handle closing final video completely
  const handleCloseFinalVideo = useCallback(() => {
    dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: false });
  }, [dispatch]);

  // Check if current project has work that would be lost
  const hasUnsavedWork = useCallback(() => {
    if (!currentProject) return false;
    // Has waypoints defined
    if (currentProject.waypoints.length > 0) return true;
    // Has generated images
    if (currentProject.waypoints.some(wp => wp.status === 'ready' && wp.imageUrl)) return true;
    // Has segments
    if (currentProject.segments.length > 0) return true;
    // Has final video
    if (currentProject.finalLoopUrl) return true;
    return false;
  }, [currentProject]);

  // Execute actual project clear
  const executeNewProject = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
    setShowNewProjectConfirm(false);
    clearProject();
    hasAutoOpenedEditor.current = false;
  }, [clearProject, dispatch]);

  // Handle new project - show confirmation if work would be lost
  const handleNewProject = useCallback(() => {
    if (hasUnsavedWork()) {
      setShowNewProjectConfirm(true);
    } else {
      executeNewProject();
    }
  }, [hasUnsavedWork, executeNewProject]);

  // Cancel new project confirmation
  const handleCancelNewProject = useCallback(() => {
    setShowNewProjectConfirm(false);
  }, []);

  // Handle project name confirmation
  const handleProjectNameConfirm = useCallback((name: string) => {
    dispatch({ type: 'SET_PROJECT_NAME', payload: name });
    setShowProjectNameModal(false);
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
    // Update project count for next time
    setProjectCount(prev => prev + 1);
  }, [dispatch]);

  // Handle project name cancel (use default name and continue)
  const handleProjectNameCancel = useCallback(() => {
    setShowProjectNameModal(false);
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
  }, [dispatch]);

  // Handle loading a project
  const handleLoadProject = useCallback(async (projectId: string) => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
    await loadProjectById(projectId);
    hasAutoOpenedEditor.current = true; // Don't auto-open editor for loaded projects
  }, [loadProjectById, dispatch]);

  // Handle closing project manager
  const handleCloseProjectManager = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
  }, [dispatch]);

  // Handle opening project manager
  const handleOpenProjectManager = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: true });
  }, [dispatch]);

  // Compute workflow state - needs to be before callbacks that use it
  const { currentStep, completedSteps } = computeWorkflowStep(currentProject);

  // Check if navigating to a step would lose work
  const wouldLoseWork = useCallback((toStep: WorkflowStep): boolean => {
    if (!currentProject) return false;

    // Check what work exists after the target step
    if (toStep === 'upload') {
      // Going to upload always loses everything
      return currentProject.waypoints.length > 0 ||
             currentProject.segments.length > 0 ||
             !!currentProject.finalLoopUrl;
    }

    if (toStep === 'define-angles') {
      // Lose rendered angles, videos, export
      const hasRenderedAngles = currentProject.waypoints.some(wp => wp.status === 'ready' && wp.imageUrl && !wp.isOriginal);
      return hasRenderedAngles ||
             currentProject.segments.length > 0 ||
             !!currentProject.finalLoopUrl;
    }

    if (toStep === 'render-angles') {
      // Lose videos and export
      return currentProject.segments.length > 0 || !!currentProject.finalLoopUrl;
    }

    if (toStep === 'render-videos') {
      // Lose export
      return !!currentProject.finalLoopUrl;
    }

    return false;
  }, [currentProject]);

  // Execute the actual navigation (called after user confirms or no confirmation needed)
  const executeNavigation = useCallback((step: WorkflowStep, clearSubsequentData: boolean = false) => {
    // Close all panels first
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false });
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: false });

    // Clear subsequent data if going backward
    if (clearSubsequentData && currentProject) {
      if (step === 'upload') {
        handleNewProject();
        return;
      }

      if (step === 'define-angles') {
        // Reset all waypoints to pending, clear segments
        const resetWaypoints = currentProject.waypoints.map(wp => ({
          ...wp,
          status: (wp.isOriginal ? 'ready' : 'pending') as 'ready' | 'pending',
          imageUrl: wp.isOriginal ? currentProject.sourceImageUrl : undefined,
          imageHistory: undefined,
          currentImageIndex: undefined
        }));
        dispatch({ type: 'SET_WAYPOINTS', payload: resetWaypoints });
        dispatch({ type: 'SET_SEGMENTS', payload: [] });
        dispatch({ type: 'SET_FINAL_LOOP_URL', payload: undefined });
        dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
      }

      if (step === 'render-angles') {
        // Clear segments and final video
        dispatch({ type: 'SET_SEGMENTS', payload: [] });
        dispatch({ type: 'SET_FINAL_LOOP_URL', payload: undefined });
        dispatch({ type: 'SET_PROJECT_STATUS', payload: 'draft' });
      }

      if (step === 'render-videos') {
        // Clear final video
        dispatch({ type: 'SET_FINAL_LOOP_URL', payload: undefined });
      }
    }

    // Navigate to the clicked step
    switch (step) {
      case 'upload':
        handleNewProject();
        break;
      case 'define-angles':
        dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
        dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
        break;
      case 'render-angles':
        if (hasGeneratedImages) {
          dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: true });
        }
        dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
        break;
      case 'render-videos':
        if (currentProject?.segments?.some(s => s.status === 'ready' || s.status === 'generating')) {
          dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
        } else if (hasGeneratedImages) {
          dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: true });
        }
        break;
      case 'export':
        if (currentProject?.finalLoopUrl) {
          dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: true });
        } else if (currentProject?.segments?.some(s => s.status === 'ready')) {
          dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
        }
        break;
    }
  }, [dispatch, hasGeneratedImages, currentProject, handleNewProject]);

  // Handle workflow step navigation - now always navigates freely (view-only)
  // Confirmation is shown when user attempts a destructive action, not on navigation
  const handleWorkflowStepClick = useCallback((step: WorkflowStep) => {
    // Always navigate directly - user can view/download without losing work
    executeNavigation(step, false);
  }, [executeNavigation]);

  // Confirm a destructive action that would lose work
  // Child components call this before regenerating angles, transitions, etc.
  const confirmDestructiveAction = useCallback((actionStep: WorkflowStep, onConfirm: () => void) => {
    // Check if this action would lose work
    if (wouldLoseWork(actionStep)) {
      // Show confirmation modal with the action callback
      setPendingDestructiveAction({
        fromStep: currentStep,
        toStep: actionStep,
        callback: onConfirm
      });
      return;
    }
    // No work to lose, execute action directly
    onConfirm();
  }, [currentStep, wouldLoseWork]);

  // Clear data for a destructive action (without navigation)
  const clearDataForAction = useCallback((actionStep: WorkflowStep) => {
    if (!currentProject) return;

    if (actionStep === 'define-angles' || actionStep === 'render-angles') {
      // Clear segments and final video
      dispatch({ type: 'SET_SEGMENTS', payload: [] });
      dispatch({ type: 'SET_FINAL_LOOP_URL', payload: undefined });
    }

    if (actionStep === 'render-videos') {
      // Clear final video only
      dispatch({ type: 'SET_FINAL_LOOP_URL', payload: undefined });
    }
  }, [currentProject, dispatch]);

  // Handle destructive action modal actions
  const handleActionCancel = useCallback(() => {
    setPendingDestructiveAction(null);
  }, []);

  const handleActionDiscard = useCallback(() => {
    if (!pendingDestructiveAction) return;
    const { toStep, callback } = pendingDestructiveAction;
    setPendingDestructiveAction(null);
    // Clear data then execute the action
    clearDataForAction(toStep);
    callback();
  }, [pendingDestructiveAction, clearDataForAction]);

  const handleActionSaveCopy = useCallback(async (newName: string) => {
    if (!pendingDestructiveAction || !currentProject) return;
    const { toStep, callback } = pendingDestructiveAction;

    // Duplicate the project with the new name
    await duplicateProject(currentProject, newName);

    // Clear data and execute action
    setPendingDestructiveAction(null);
    clearDataForAction(toStep);
    callback();
  }, [pendingDestructiveAction, currentProject, clearDataForAction]);

  // If loading auth or restoring project, show loading state
  if (authLoading || isRestoring) {
    return (
      <div className="sogni-360-container flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">
            {isRestoring ? 'Restoring your project...' : 'Connecting to Sogni...'}
          </p>
        </div>
      </div>
    );
  }

  // If no source image, show uploader
  if (!currentProject?.sourceImageUrl) {
    return (
      <div className="sogni-360-container">
        <SourceUploader />
        {/* Project Manager Modal - also available from uploader */}
        {showProjectManager && (
          <ProjectManagerModal
            onClose={handleCloseProjectManager}
            onLoadProject={handleLoadProject}
            onNewProject={handleNewProject}
            currentProjectId={currentProject?.id}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sogni-360-container">
      {/* Global Workflow Wizard - always visible when project exists */}
      {currentProject && (
        <div className="global-wizard-bar">
          <div className="global-wizard-bar-inner">
            <WorkflowWizard
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={handleWorkflowStepClick}
            />
            <div className="project-actions-bar">
              <button className="project-action-btn" onClick={handleNewProject} title="New Project">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New</span>
              </button>
              <button className="project-action-btn" onClick={handleOpenProjectManager} title="My Projects">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>Projects</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main viewer */}
      <Sogni360Viewer />

      {/* 3D Camera Angle Indicator with Navigation - shows current angle position */}
      {currentWaypoint && !showWaypointEditor && (
        <div className="camera-angle-indicator-with-nav">
          {/* Previous button */}
          {hasGeneratedImages && (
            <button
              className="nav-arrow nav-arrow-left"
              onClick={previousWaypoint}
              disabled={isTransitionPlaying}
              title="Previous (A / Left Arrow)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* 3D Control */}
          <div className="camera-angle-indicator-inner">
            <CameraAngle3DControl
              azimuth={currentWaypoint.azimuth}
              elevation={currentWaypoint.elevation}
              distance={currentWaypoint.distance}
              onAzimuthChange={() => {}}
              onElevationChange={() => {}}
              onDistanceChange={() => {}}
              size="compact"
              // Animation props for synced camera movement during video playback
              targetAzimuth={targetWaypoint?.azimuth}
              targetElevation={targetWaypoint?.elevation}
              targetDistance={targetWaypoint?.distance}
              animationDuration={videoDuration}
              isAnimating={isTransitionPlaying && !!targetWaypoint}
            />
            {/* Waypoint counter */}
            {hasGeneratedImages && (
              <div className="waypoint-counter">
                {currentWaypointIndex + 1} / {waypoints.length}
              </div>
            )}
          </div>

          {/* Next button */}
          {hasGeneratedImages && (
            <button
              className="nav-arrow nav-arrow-right"
              onClick={nextWaypoint}
              disabled={isTransitionPlaying}
              title="Next (D / Right Arrow)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Generating state overlay */}
      {isGenerating && !showWaypointEditor && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-[15]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Generating Angles</h2>
            <p className="text-gray-300">
              {waypoints.filter(wp => wp.status === 'ready').length} / {waypoints.length} complete
            </p>
            <div className="mt-4 w-64 mx-auto bg-gray-800 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(waypoints.filter(wp => wp.status === 'ready').length / waypoints.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Waypoint editor panel - full screen overlay */}
      {showWaypointEditor && (
        <div className="waypoint-editor-panel">
          <div className="waypoint-editor-panel-header">
            <h2 className="text-lg font-semibold text-white">Configure Camera Angles</h2>
            <button
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              onClick={() => dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false })}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="waypoint-editor-panel-content">
            <WaypointEditor onConfirmDestructiveAction={confirmDestructiveAction} />
          </div>
        </div>
      )}


      {/* Transition Config Panel */}
      {showTransitionConfig && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/60">
          <TransitionConfigPanel
            onClose={() => dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false })}
            onStartGeneration={handleStartTransitionGeneration}
            onConfirmDestructiveAction={confirmDestructiveAction}
          />
        </div>
      )}

      {/* Transition Review Panel - uses position:fixed internally, no wrapper needed */}
      {showTransitionReview && (
        <TransitionReviewPanel
          onClose={() => {
            dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: false });
            if (!isTransitionGenerating) {
              dispatch({ type: 'SET_PROJECT_STATUS', payload: 'complete' });
            }
          }}
          onStitch={handleStitchVideos}
          onRedoSegment={handleRedoSegment}
          onConfirmDestructiveAction={confirmDestructiveAction}
          isGenerating={isTransitionGenerating}
        />
      )}

      {/* Final Video Preview Panel - plays stitched video with gapless playback */}
      {showFinalVideoPreview && currentProject?.segments && (
        <FinalVideoPanel
          videoUrls={currentProject.segments.map(s => s.videoUrl).filter(Boolean) as string[]}
          stitchedVideoUrl={currentProject.finalLoopUrl}
          onClose={handleCloseFinalVideo}
          onBackToEditor={handleBackToEditor}
          onStitchComplete={(url) => {
            dispatch({ type: 'SET_FINAL_LOOP_URL', payload: url });
          }}
          initialMusicSelection={currentProject.settings.musicSelection}
        />
      )}

      {/* Project Manager Modal */}
      {showProjectManager && (
        <ProjectManagerModal
          onClose={handleCloseProjectManager}
          onLoadProject={handleLoadProject}
          onNewProject={handleNewProject}
          currentProjectId={currentProject?.id}
        />
      )}

      {/* Destructive Action Confirmation Modal */}
      {pendingDestructiveAction && currentProject && (
        <WorkflowNavigationModal
          fromStep={pendingDestructiveAction.fromStep}
          toStep={pendingDestructiveAction.toStep}
          currentProjectName={currentProject.name}
          onCancel={handleActionCancel}
          onDiscard={handleActionDiscard}
          onSaveCopy={handleActionSaveCopy}
        />
      )}

      {/* New Project Confirmation Modal */}
      {showNewProjectConfirm && (
        <NewProjectConfirmModal
          projectName={currentProject?.name}
          onConfirm={executeNewProject}
          onCancel={handleCancelNewProject}
        />
      )}

      {/* Project Name Modal (shown after image upload) */}
      {showProjectNameModal && (
        <ProjectNameModal
          suggestedName={generateProjectName(projectCount)}
          onConfirm={handleProjectNameConfirm}
          onCancel={handleProjectNameCancel}
        />
      )}
    </div>
  );
};

export default Sogni360Container;
