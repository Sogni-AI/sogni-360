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
import useAutoHideUI from '../hooks/useAutoHideUI';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';
import { generateMultipleTransitions } from '../services/TransitionGenerator';

const Sogni360Container: React.FC = () => {
  const { state, dispatch, setUIVisible, isRestoring, updateSegment, clearProject, loadProjectById } = useApp();
  const { nextWaypoint, previousWaypoint, isTransitionPlaying } = useTransitionNavigation();
  const { currentProject, showWaypointEditor, currentWaypointIndex, showTransitionConfig, showTransitionReview, showFinalVideoPreview, showProjectManager } = state;
  const hasAutoOpenedEditor = useRef(false);
  const [isTransitionGenerating, setIsTransitionGenerating] = useState(false);

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

  // Auto-open editor when image is uploaded but no waypoints exist
  useEffect(() => {
    if (currentProject?.sourceImageUrl && waypoints.length === 0 && !showWaypointEditor && !hasAutoOpenedEditor.current && !isRestoring) {
      hasAutoOpenedEditor.current = true;
      dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
    }
  }, [currentProject?.sourceImageUrl, waypoints.length, showWaypointEditor, isRestoring, dispatch]);

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

    try {
      await generateMultipleTransitions(
        segments,
        waypointImages,
        {
          prompt: currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.',
          resolution: (currentProject.settings.videoResolution as '480p' | '580p' | '720p') || '480p',
          quality: (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'fast',
          duration: currentProject.settings.transitionDuration || 1.5,
          tokenType: currentProject.settings.tokenType || 'spark',
          sourceWidth: currentProject.sourceImageDimensions?.width || 480,
          sourceHeight: currentProject.sourceImageDimensions?.height || 640,
          onSegmentStart: (segmentId) => {
            updateSegment(segmentId, { status: 'generating', progress: 0 });
          },
          onSegmentProgress: (segmentId, progress, workerName) => {
            updateSegment(segmentId, { progress, workerName });
          },
          onSegmentComplete: (segmentId, videoUrl, version) => {
            updateSegment(segmentId, { status: 'ready', videoUrl, progress: 100 });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId, version } });
          },
          onSegmentError: (segmentId, error) => {
            updateSegment(segmentId, { status: 'failed', error: error.message });
          },
          onAllComplete: () => {
            setIsTransitionGenerating(false);
            dispatch({ type: 'SET_PROJECT_STATUS', payload: 'complete' });
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

    try {
      await generateMultipleTransitions(
        [segment],
        waypointImages,
        {
          prompt: currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.',
          resolution: (currentProject.settings.videoResolution as '480p' | '580p' | '720p') || '480p',
          quality: (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'fast',
          duration: currentProject.settings.transitionDuration || 1.5,
          tokenType: currentProject.settings.tokenType || 'spark',
          sourceWidth: currentProject.sourceImageDimensions?.width || 480,
          sourceHeight: currentProject.sourceImageDimensions?.height || 640,
          onSegmentProgress: (segmentId, progress, workerName) => {
            updateSegment(segmentId, { progress, workerName });
          },
          onSegmentComplete: (segmentId, videoUrl, version) => {
            updateSegment(segmentId, { status: 'ready', videoUrl, progress: 100 });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId, version } });
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

  // Handle new project - clear current and show uploader
  const handleNewProject = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
    clearProject();
    hasAutoOpenedEditor.current = false;
  }, [clearProject, dispatch]);

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

  // Handle workflow step navigation
  const handleWorkflowStepClick = useCallback((step: WorkflowStep) => {
    // Close all panels first
    dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false });
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_FINAL_VIDEO_PREVIEW', payload: false });

    // Navigate to the clicked step
    switch (step) {
      case 'upload':
        // Start a new project
        handleNewProject();
        break;
      case 'define-angles':
        // Show editor in configuration mode
        dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
        dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
        break;
      case 'render-angles':
        // Show editor in review mode if we have generated angles
        if (hasGeneratedImages) {
          dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: true });
        }
        dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
        break;
      case 'render-videos':
        // Show transition review if we have some videos, otherwise show config
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

  // Compute workflow state
  const { currentStep, completedSteps } = computeWorkflowStep(currentProject);

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
            <WaypointEditor />
          </div>
        </div>
      )}


      {/* Transition Config Panel */}
      {showTransitionConfig && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/60">
          <TransitionConfigPanel
            onClose={() => dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false })}
            onStartGeneration={handleStartTransitionGeneration}
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
    </div>
  );
};

export default Sogni360Container;
