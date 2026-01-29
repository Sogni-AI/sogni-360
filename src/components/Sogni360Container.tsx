import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSogniAuth } from '../services/sogniAuth';
import SourceUploader from './SourceUploader';
import Sogni360Viewer from './Sogni360Viewer';
import WaypointEditor from './WaypointEditor';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import TransitionConfigPanel from './TransitionConfigPanel';
import TransitionReviewPanel from './TransitionReviewPanel';
import FinalVideoPanel from './FinalVideoPanel';
import useAutoHideUI from '../hooks/useAutoHideUI';
import { generateMultipleTransitions } from '../services/TransitionGenerator';

const Sogni360Container: React.FC = () => {
  const { state, dispatch, setUIVisible, nextWaypoint, previousWaypoint, isRestoring, clearProject, updateSegment } = useApp();
  const { currentProject, uiVisible, showWaypointEditor, currentWaypointIndex, showTransitionConfig, showTransitionReview, showFinalVideoPreview } = state;
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
          if (hasGeneratedImages) {
            previousWaypoint();
          }
          break;

        case 'ArrowRight':
        case 'd':
        case 'D':
          if (hasGeneratedImages) {
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
  }, [hasGeneratedImages, state.isPlaying, state.showWaypointEditor, state.showExportPanel, showWaypointEditor, dispatch, nextWaypoint, previousWaypoint]);

  // Handle starting transition generation
  const handleStartTransitionGeneration = useCallback(async () => {
    if (!currentProject) return;

    const segments = currentProject.segments;
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
          concurrency: 2,
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
          concurrency: 1,
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

  // Handle video stitching (placeholder - client-side stitching to be implemented)
  const handleStitchVideos = useCallback(async () => {
    if (!currentProject) return;

    const segments = currentProject.segments;
    const allReady = segments.every(s => s.status === 'ready' && s.videoUrl);
    if (!allReady) return;

    // For now, use the first segment's video URL as a placeholder
    // TODO: Implement actual client-side video stitching with FFmpeg.wasm
    const videoUrls = segments.map(s => s.videoUrl).filter(Boolean) as string[];

    if (videoUrls.length > 0) {
      // Placeholder: use first video as final loop (to be replaced with stitched video)
      dispatch({ type: 'SET_FINAL_LOOP_URL', payload: videoUrls[0] });
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
      </div>
    );
  }

  return (
    <div className="sogni-360-container">
      {/* Main viewer */}
      <Sogni360Viewer />

      {/* Hidden UI hint */}
      {hasGeneratedImages && !uiVisible && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-gray-600 text-xs pointer-events-none animate-pulse">
          Move mouse to show controls
        </div>
      )}

      {/* Bottom controls overlay - ONLY show if we have generated images */}
      {hasGeneratedImages && (
        <div className={`ui-overlay transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between">
            {/* Navigation controls */}
            <div className="flex items-center gap-2 bg-black/60 rounded-lg px-3 py-2">
              <button
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                onClick={previousWaypoint}
                title="Previous (A / Left Arrow)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="px-3 text-sm">
                {currentWaypointIndex + 1} / {waypoints.length}
              </div>

              <button
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                onClick={nextWaypoint}
                title="Next (D / Right Arrow)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-gray-400 hover:text-white"
                onClick={() => {
                  if (window.confirm('Start a new project? Your current work is saved.')) {
                    clearProject();
                  }
                }}
                title="New Project"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: !showWaypointEditor })}
              >
                {showWaypointEditor ? 'Close' : 'Edit'}
              </button>
              {readyWaypointCount === waypoints.length && waypoints.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={() => dispatch({ type: 'SET_SHOW_EXPORT_PANEL', payload: true })}
                >
                  Export
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3D Camera Angle Indicator - shows current angle position */}
      {currentWaypoint && !showWaypointEditor && (
        <div className="fixed top-4 left-4 z-[15] pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm rounded-xl p-2" style={{ width: 100 }}>
            <CameraAngle3DControl
              azimuth={currentWaypoint.azimuth}
              elevation={currentWaypoint.elevation}
              distance={currentWaypoint.distance}
              onAzimuthChange={() => {}}
              onElevationChange={() => {}}
              onDistanceChange={() => {}}
              size="compact"
            />
          </div>
        </div>
      )}

      {/* Edit button when waypoints exist but editor is closed */}
      {waypoints.length > 0 && !hasGeneratedImages && !showWaypointEditor && !isGenerating && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[15]">
          <button
            className="btn bg-yellow-400 hover:bg-yellow-300 text-black font-semibold px-8 py-3 rounded-lg shadow-lg"
            onClick={() => dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true })}
          >
            Edit Angles
          </button>
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

      {/* Create Transition Video button - shows when all angles ready and not in editor */}
      {hasGeneratedImages && !showWaypointEditor && !isGenerating && !showTransitionConfig && !showTransitionReview && !showFinalVideoPreview && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[15]">
          <button
            className="btn bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold px-6 py-3 rounded-lg shadow-lg flex items-center gap-2"
            onClick={() => dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: true })}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            Create Transition Video
          </button>
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

      {/* Transition Review Panel */}
      {showTransitionReview && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/60">
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
        </div>
      )}

      {/* Final Video Preview Panel */}
      {showFinalVideoPreview && currentProject?.finalLoopUrl && (
        <FinalVideoPanel
          videoUrl={currentProject.finalLoopUrl}
          onClose={handleCloseFinalVideo}
          onBackToEditor={handleBackToEditor}
        />
      )}
    </div>
  );
};

export default Sogni360Container;
