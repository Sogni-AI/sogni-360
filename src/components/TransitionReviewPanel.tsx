import React, { useCallback, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Segment } from '../types';
import {
  getAzimuthConfig,
  getElevationConfig
} from '../constants/cameraAngleSettings';
import WorkflowWizard, { WorkflowStep } from './shared/WorkflowWizard';
import TransitionVideoCard from './TransitionVideoCard';
import TransitionRegenerateModal from './TransitionRegenerateModal';
import { downloadSingleVideo, downloadVideosAsZip, type VideoDownloadItem } from '../utils/bulkDownload';

interface TransitionReviewPanelProps {
  onClose: () => void;
  onStitch: () => void;
  onRedoSegment: (segmentId: string, customPrompt?: string) => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  isGenerating: boolean;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
  onRequireAuth?: () => void;
}

const TransitionReviewPanel: React.FC<TransitionReviewPanelProps> = ({
  onClose,
  onStitch,
  onRedoSegment,
  onConfirmDestructiveAction,
  isGenerating,
  onWorkflowStepClick,
  onRequireAuth
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, isAuthenticated, hasUsedFreeGeneration } = state;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [regenerateModalSegment, setRegenerateModalSegment] = useState<Segment | null>(null);

  const waypoints = currentProject?.waypoints || [];
  const segments = currentProject?.segments || [];

  // Get waypoint by ID
  const getWaypoint = (id: string) => waypoints.find(wp => wp.id === id);

  // Get angle label for a waypoint
  const getAngleLabel = (waypointId: string): string => {
    const wp = getWaypoint(waypointId);
    if (!wp) return 'Unknown';
    if (wp.isOriginal) return 'Original';
    const az = getAzimuthConfig(wp.azimuth);
    const el = getElevationConfig(wp.elevation);
    return `${az.label} · ${el.label}`;
  };

  // Count statuses
  const readyCount = segments.filter(s => s.status === 'ready').length;
  const generatingCount = segments.filter(s => s.status === 'generating').length;
  const failedCount = segments.filter(s => s.status === 'failed').length;
  const pendingCount = segments.filter(s => s.status === 'pending').length;

  const totalSegments = segments.length;

  // Workflow step
  const completedSteps: ('upload' | 'define-angles' | 'render-angles' | 'render-videos' | 'export')[] = ['upload', 'define-angles', 'render-angles'];

  // Handle version navigation
  const handlePrevVersion = useCallback((segment: Segment) => {
    if (!segment.versions || segment.versions.length <= 1) return;
    const currentIndex = segment.currentVersionIndex ?? segment.versions.length - 1;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : segment.versions.length - 1;
    dispatch({
      type: 'SELECT_SEGMENT_VERSION',
      payload: { segmentId: segment.id, versionIndex: newIndex }
    });
  }, [dispatch]);

  const handleNextVersion = useCallback((segment: Segment) => {
    if (!segment.versions || segment.versions.length <= 1) return;
    const currentIndex = segment.currentVersionIndex ?? segment.versions.length - 1;
    const newIndex = currentIndex < segment.versions.length - 1 ? currentIndex + 1 : 0;
    dispatch({
      type: 'SELECT_SEGMENT_VERSION',
      payload: { segmentId: segment.id, versionIndex: newIndex }
    });
  }, [dispatch]);

  const getVersionInfo = (segment: Segment) => {
    if (!segment.versions || segment.versions.length <= 1) return null;
    const currentIndex = segment.currentVersionIndex ?? segment.versions.length - 1;
    return {
      current: currentIndex + 1,
      total: segment.versions.length,
      canPrev: currentIndex > 0,
      canNext: currentIndex < segment.versions.length - 1
    };
  };

  // Download single video
  const handleDownloadSingle = useCallback(async (segment: Segment, index: number) => {
    if (!segment.videoUrl) return;

    setDownloadingId(segment.id);
    try {
      const fromWp = waypoints.find(wp => wp.id === segment.fromWaypointId);
      const toWp = waypoints.find(wp => wp.id === segment.toWaypointId);
      const fromLabel = fromWp?.isOriginal ? 'original' : fromWp?.azimuth || 'unknown';
      const toLabel = toWp?.isOriginal ? 'original' : toWp?.azimuth || 'unknown';
      const filename = `sogni-360-transition${index + 1}-${fromLabel}-to-${toLabel}.mp4`;

      const success = await downloadSingleVideo(segment.videoUrl, filename);
      if (success) {
      } else {
        showToast({ message: 'Download failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setDownloadingId(null);
    }
  }, [waypoints, showToast]);

  // Download all videos as ZIP
  const handleDownloadAll = useCallback(async () => {
    const readySegments = segments.filter(s => s.status === 'ready' && s.videoUrl);
    if (readySegments.length === 0) {
      showToast({ message: 'No videos to download', type: 'error' });
      return;
    }

    setIsDownloadingAll(true);
    setDownloadProgress('Preparing download...');

    try {
      const videos: VideoDownloadItem[] = readySegments.map((seg) => {
        const originalIndex = segments.indexOf(seg);
        const fromWp = waypoints.find(wp => wp.id === seg.fromWaypointId);
        const toWp = waypoints.find(wp => wp.id === seg.toWaypointId);
        const fromLabel = fromWp?.isOriginal ? 'original' : fromWp?.azimuth || 'unknown';
        const toLabel = toWp?.isOriginal ? 'original' : toWp?.azimuth || 'unknown';
        return {
          url: seg.videoUrl!,
          filename: `sogni-360-transition${originalIndex + 1}-${fromLabel}-to-${toLabel}.mp4`
        };
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const success = await downloadVideosAsZip(
        videos,
        `sogni-360-transitions-${timestamp}.zip`,
        (_current, _total, message) => {
          setDownloadProgress(message);
        }
      );

      if (success) {
        showToast({ message: 'ZIP download complete', type: 'success' });
      } else {
        showToast({ message: 'ZIP download failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'ZIP download failed', type: 'error' });
    } finally {
      setIsDownloadingAll(false);
      setDownloadProgress(null);
    }
  }, [segments, waypoints, showToast]);

  // Open the regenerate modal for a segment
  const handleOpenRegenerateModal = useCallback((segmentId: string) => {
    // Auth gating: require login if user has already used their free generation
    if (!isAuthenticated && hasUsedFreeGeneration) {
      if (onRequireAuth) {
        onRequireAuth();
      }
      return;
    }

    const segment = segments.find(s => s.id === segmentId);
    if (segment) {
      setRegenerateModalSegment(segment);
    }
  }, [segments, isAuthenticated, hasUsedFreeGeneration, onRequireAuth]);

  // Handle actual regeneration after modal confirmation
  const handleRegenerateConfirm = useCallback((customPrompt: string) => {
    if (!regenerateModalSegment) return;

    // Mark that user has used their free generation (for unauthenticated users)
    if (!isAuthenticated && !hasUsedFreeGeneration) {
      dispatch({ type: 'SET_HAS_USED_FREE_GENERATION', payload: true });
    }

    const segmentId = regenerateModalSegment.id;
    setRegenerateModalSegment(null);

    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-videos', () => onRedoSegment(segmentId, customPrompt));
    } else {
      onRedoSegment(segmentId, customPrompt);
    }
  }, [regenerateModalSegment, onConfirmDestructiveAction, onRedoSegment, isAuthenticated, hasUsedFreeGeneration, dispatch]);

  // Close the regenerate modal
  const handleRegenerateCancel = useCallback(() => {
    setRegenerateModalSegment(null);
  }, []);

  // Delete last segment (only last can be deleted to keep transitions aligned)
  const handleDeleteSegment = useCallback((segmentId: string, index: number) => {
    // Only allow deleting the last segment
    if (index !== segments.length - 1) {
      showToast({ message: 'Only the last transition can be removed', type: 'error' });
      return;
    }

    // Prevent deleting if it's the only segment
    if (segments.length <= 1) {
      showToast({ message: 'At least one transition required', type: 'error' });
      return;
    }

    const segment = segments.find(s => s.id === segmentId);

    // Also remove the corresponding waypoint (the "to" waypoint of this segment)
    const lastWaypoint = waypoints[waypoints.length - 1];
    if (lastWaypoint && segment?.toWaypointId === lastWaypoint.id) {
      dispatch({ type: 'REMOVE_WAYPOINT', payload: lastWaypoint.id });
    }

    dispatch({ type: 'REMOVE_SEGMENT', payload: segmentId });
  }, [segments, waypoints, dispatch, showToast]);

  const canStitch = readyCount === totalSegments && totalSegments > 0 && !isGenerating;

  // Calculate thumbnail aspect ratio
  const thumbAspect = currentProject?.sourceImageDimensions
    ? currentProject.sourceImageDimensions.width / currentProject.sourceImageDimensions.height
    : 0.75;

  return (
    <div className="review-panel">
      {/* Wizard Progress Bar */}
      <div className="review-wizard-wrap">
        <WorkflowWizard
          currentStep="render-videos"
          completedSteps={completedSteps}
          onStepClick={onWorkflowStepClick}
        />
      </div>

      {/* Header */}
      <div className="review-header-bar">
        <div>
          <h2 className="review-main-title">
            {isGenerating ? 'Generating Transition Videos' : 'Review Transition Videos'}
          </h2>
          <p className="review-main-subtitle">
            {readyCount} of {totalSegments} complete
          </p>
        </div>
        <button className="review-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Carousel */}
      <div className="review-carousel-wrap" ref={carouselRef}>
        {segments.map((segment, index) => {
          const fromWaypoint = getWaypoint(segment.fromWaypointId);
          const toWaypoint = getWaypoint(segment.toWaypointId);
          const versionInfo = getVersionInfo(segment);

          const sourceAspectRatio = currentProject?.sourceImageDimensions
            ? `${currentProject.sourceImageDimensions.width} / ${currentProject.sourceImageDimensions.height}`
            : '3 / 4';

          return (
            <TransitionVideoCard
              key={segment.id}
              segment={segment}
              index={index}
              totalSegments={segments.length}
              thumbAspect={thumbAspect}
              sourceAspectRatio={sourceAspectRatio}
              fromImageUrl={fromWaypoint?.imageUrl}
              toImageUrl={toWaypoint?.imageUrl}
              fromLabel={getAngleLabel(segment.fromWaypointId)}
              toLabel={getAngleLabel(segment.toWaypointId)}
              versionInfo={versionInfo}
              onPrevVersion={() => handlePrevVersion(segment)}
              onNextVersion={() => handleNextVersion(segment)}
              onRegenerate={() => handleOpenRegenerateModal(segment.id)}
              onDownload={() => handleDownloadSingle(segment, index)}
              onDelete={() => handleDeleteSegment(segment.id, index)}
              isDownloading={downloadingId === segment.id}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="review-footer-bar">
        <div className="review-status-tags">
          {readyCount > 0 && (
            <span className="status-tag ready">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {readyCount} ready
            </span>
          )}
          {generatingCount > 0 && (
            <span className="status-tag generating">
              <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {generatingCount} generating
            </span>
          )}
          {pendingCount > 0 && (
            <span className="status-tag pending">
              {pendingCount} pending
            </span>
          )}
          {failedCount > 0 && (
            <span className="status-tag failed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {failedCount} failed
            </span>
          )}
        </div>

        <div className="review-actions-bar">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>

          {/* Download All Button */}
          <button
            className={`btn btn-secondary ${readyCount === 0 || isDownloadingAll ? 'btn-disabled' : ''}`}
            onClick={handleDownloadAll}
            disabled={readyCount === 0 || isDownloadingAll}
          >
            {isDownloadingAll ? (
              <>
                <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {downloadProgress || 'Downloading...'}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All
              </>
            )}
          </button>

          <button
            className={`btn ${canStitch ? 'btn-primary' : 'btn-disabled'}`}
            onClick={onStitch}
            disabled={!canStitch}
          >
            Create Final Video
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Regenerate Modal */}
      {regenerateModalSegment && (
        <TransitionRegenerateModal
          fromLabel={getAngleLabel(regenerateModalSegment.fromWaypointId)}
          toLabel={getAngleLabel(regenerateModalSegment.toWaypointId)}
          fromImageUrl={getWaypoint(regenerateModalSegment.fromWaypointId)?.imageUrl}
          toImageUrl={getWaypoint(regenerateModalSegment.toWaypointId)?.imageUrl}
          thumbAspect={thumbAspect}
          currentPrompt={currentProject?.settings.transitionPrompt}
          onConfirm={handleRegenerateConfirm}
          onCancel={handleRegenerateCancel}
        />
      )}
    </div>
  );
};

export default TransitionReviewPanel;
