import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Segment } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  getAzimuthConfig,
  getElevationConfig
} from '../constants/cameraAngleSettings';
import WorkflowWizard, { WorkflowStep, computeWorkflowStep } from './shared/WorkflowWizard';
import TransitionVideoCard from './TransitionVideoCard';
import TransitionRegenerateModal from './TransitionRegenerateModal';
import LiquidGlassPanel from './shared/LiquidGlassPanel';
import { downloadSingleVideo, downloadVideosAsZip, type VideoDownloadItem } from '../utils/bulkDownload';
import { toKebabSlug } from '../utils/projectExport';
import { getOriginalLabel } from '../utils/waypointLabels';
import { DEFAULT_VIDEO_SETTINGS, type VideoQualityPreset, type VideoResolution } from '../constants/videoSettings';
import { getAdvancedSettings } from '../hooks/useAdvancedSettings';

interface TransitionReviewPanelProps {
  onClose: () => void;
  onStitch: () => void;
  onRedoSegment: (segmentId: string, customPrompt?: string) => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  isGenerating: boolean;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
  onRequireAuth?: () => void;
  onOpenTransitionConfig?: () => void;
}

const TransitionReviewPanel: React.FC<TransitionReviewPanelProps> = ({
  onClose,
  onStitch,
  onRedoSegment,
  onConfirmDestructiveAction,
  isGenerating,
  onWorkflowStepClick,
  onRequireAuth,
  onOpenTransitionConfig
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, isAuthenticated, hasUsedFreeGeneration } = state;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [regenerateModalSegment, setRegenerateModalSegment] = useState<Segment | null>(null);
  const [showPartialStitchConfirm, setShowPartialStitchConfirm] = useState(false);

  const waypoints = currentProject?.waypoints || [];
  const segments = currentProject?.segments || [];

  // Get ready waypoints (with images)
  const readyWaypoints = useMemo(() => {
    return waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl);
  }, [waypoints]);

  // Create stable keys for detecting changes (primitive strings for useEffect deps)
  const readyWaypointIdsKey = useMemo(() => {
    return readyWaypoints.map(wp => wp.id).join(',');
  }, [readyWaypoints]);

  const segmentPairsKey = useMemo(() => {
    return segments.map(s => `${s.fromWaypointId}:${s.toWaypointId}`).join(',');
  }, [segments]);

  // Synchronize segments with waypoints when new ready waypoints are added
  // This ensures that if user goes back to Render Angles, adds more waypoints,
  // then returns here, the new waypoint transitions appear as pending slots
  // Also updates existing segments if their toWaypointId is no longer correct
  useEffect(() => {
    if (readyWaypoints.length < 2 || segments.length === 0) return;

    // Build a map of expected transitions: fromId -> toId
    const expectedToMap = new Map<string, string>();
    for (let i = 0; i < readyWaypoints.length; i++) {
      const fromWp = readyWaypoints[i];
      const toWp = readyWaypoints[(i + 1) % readyWaypoints.length];
      expectedToMap.set(fromWp.id, toWp.id);
    }

    // Build the final segments map: one segment per fromWaypointId
    // This ensures no duplicates and updates existing segments as needed
    const finalSegmentsMap = new Map<string, Segment>();

    // First pass: process existing segments, keeping the best one for each fromWaypointId
    for (const segment of segments) {
      const expectedToId = expectedToMap.get(segment.fromWaypointId);

      // Skip segments whose fromWaypointId is no longer valid
      if (expectedToId === undefined) continue;

      // Check if we already have a segment for this fromWaypointId
      const existing = finalSegmentsMap.get(segment.fromWaypointId);

      if (!existing) {
        // No existing segment for this fromWaypointId - use this one
        if (segment.toWaypointId === expectedToId) {
          // Segment is already correct
          finalSegmentsMap.set(segment.fromWaypointId, segment);
        } else {
          // Update toWaypointId to match expected
          finalSegmentsMap.set(segment.fromWaypointId, {
            ...segment,
            toWaypointId: expectedToId,
            status: segment.status === 'ready' || segment.status === 'generating'
              ? 'pending' as const
              : segment.status
          });
        }
      } else {
        // Already have a segment - keep the one with more progress/history
        // Prefer: ready > generating > pending, or more versions
        const existingScore = existing.status === 'ready' ? 3 :
          existing.status === 'generating' ? 2 : 1;
        const newScore = segment.status === 'ready' ? 3 :
          segment.status === 'generating' ? 2 : 1;

        if (newScore > existingScore ||
            (newScore === existingScore &&
             (segment.versions?.length || 0) > (existing.versions?.length || 0))) {
          // This segment is better - but still need to update toWaypointId if needed
          if (segment.toWaypointId === expectedToId) {
            finalSegmentsMap.set(segment.fromWaypointId, segment);
          } else {
            finalSegmentsMap.set(segment.fromWaypointId, {
              ...segment,
              toWaypointId: expectedToId,
              status: segment.status === 'ready' || segment.status === 'generating'
                ? 'pending' as const
                : segment.status
            });
          }
        }
      }
    }

    // Second pass: create new segments for any missing fromWaypointIds
    for (const [fromId, toId] of expectedToMap) {
      if (!finalSegmentsMap.has(fromId)) {
        finalSegmentsMap.set(fromId, {
          id: uuidv4(),
          fromWaypointId: fromId,
          toWaypointId: toId,
          status: 'pending' as const,
          versions: []
        });
      }
    }

    // Convert to array and sort by waypoint order
    const sortedSegments = Array.from(finalSegmentsMap.values()).sort((a, b) => {
      const aFromIndex = readyWaypoints.findIndex(wp => wp.id === a.fromWaypointId);
      const bFromIndex = readyWaypoints.findIndex(wp => wp.id === b.fromWaypointId);
      return aFromIndex - bFromIndex;
    });

    // Check if anything actually changed
    const segmentsChanged =
      sortedSegments.length !== segments.length ||
      sortedSegments.some((seg, idx) =>
        seg.id !== segments[idx]?.id ||
        seg.fromWaypointId !== segments[idx]?.fromWaypointId ||
        seg.toWaypointId !== segments[idx]?.toWaypointId ||
        seg.status !== segments[idx]?.status
      );

    if (segmentsChanged) {
      dispatch({ type: 'SET_SEGMENTS', payload: sortedSegments });
    }
  }, [readyWaypointIdsKey, segmentPairsKey]);

  // Get waypoint by ID
  const getWaypoint = (id: string) => waypoints.find(wp => wp.id === id);

  // Get angle label for a waypoint
  const getAngleLabel = (waypointId: string): string => {
    const wp = getWaypoint(waypointId);
    if (!wp) return 'Unknown';
    if (wp.isOriginal) return getOriginalLabel(waypoints, waypointId);
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

  // Workflow step - compute from actual project state
  const { currentStep: computedStep, completedSteps } = computeWorkflowStep(currentProject);

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
      const slug = toKebabSlug(currentProject?.name || 'project');
      const fromWp = waypoints.find(wp => wp.id === segment.fromWaypointId);
      const toWp = waypoints.find(wp => wp.id === segment.toWaypointId);
      const fromLabel = fromWp?.isOriginal ? 'original' : fromWp?.azimuth || 'unknown';
      const toLabel = toWp?.isOriginal ? 'original' : toWp?.azimuth || 'unknown';
      const filename = `sogni-360-${slug}-transition${index + 1}-${fromLabel}-to-${toLabel}.mp4`;

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
      const slug = toKebabSlug(currentProject?.name || 'project');
      const videos: VideoDownloadItem[] = readySegments.map((seg) => {
        const originalIndex = segments.indexOf(seg);
        const fromWp = waypoints.find(wp => wp.id === seg.fromWaypointId);
        const toWp = waypoints.find(wp => wp.id === seg.toWaypointId);
        const fromLabel = fromWp?.isOriginal ? 'original' : fromWp?.azimuth || 'unknown';
        const toLabel = toWp?.isOriginal ? 'original' : toWp?.azimuth || 'unknown';
        return {
          url: seg.videoUrl!,
          filename: `sogni-360-${slug}-transition${originalIndex + 1}-${fromLabel}-to-${toLabel}.mp4`
        };
      });

      const success = await downloadVideosAsZip(
        videos,
        `sogni-360-transitions-${slug}.zip`,
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

  // Delete a segment (user can delete any segment to clean up duplicates/errors)
  const handleDeleteSegment = useCallback((segmentId: string) => {
    // Prevent deleting if it's the only segment
    if (segments.length <= 1) {
      showToast({ message: 'At least one transition required', type: 'error' });
      return;
    }

    dispatch({ type: 'REMOVE_SEGMENT', payload: segmentId });
  }, [segments.length, dispatch, showToast]);

  // Enable button when at least one video is ready and not currently generating
  const canStitch = readyCount >= 1 && !isGenerating;
  const allReady = readyCount === totalSegments && totalSegments > 0;

  // Handle stitch button click - show confirmation if not all videos are ready
  const handleStitchClick = useCallback(() => {
    if (!allReady) {
      setShowPartialStitchConfirm(true);
    } else {
      onStitch();
    }
  }, [allReady, onStitch]);

  const handleConfirmPartialStitch = useCallback(() => {
    setShowPartialStitchConfirm(false);
    onStitch();
  }, [onStitch]);

  // Calculate thumbnail aspect ratio
  const thumbAspect = currentProject?.sourceImageDimensions
    ? currentProject.sourceImageDimensions.width / currentProject.sourceImageDimensions.height
    : 0.75;

  return (
    <div className="review-panel">
      {/* Wizard Progress Bar */}
      <div className="review-wizard-wrap">
        <WorkflowWizard
          currentStep={computedStep}
          completedSteps={completedSteps}
          onStepClick={onWorkflowStepClick}
        />
      </div>

      {/* Header */}
      <div className="review-header-bar">
        <div>
          <h2 className="review-main-title">
            {isGenerating ? 'Generating Transition Videos' : 'Review Transition Videos'}
            <button
              className="title-settings-btn"
              onClick={onOpenTransitionConfig}
              title="Configure Transition Videos"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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

          return (
            <TransitionVideoCard
              key={segment.id}
              segment={segment}
              index={index}
              totalSegments={segments.length}
              thumbAspect={thumbAspect}
              fromImageUrl={fromWaypoint?.imageUrl}
              toImageUrl={toWaypoint?.imageUrl}
              fromLabel={getAngleLabel(segment.fromWaypointId)}
              toLabel={getAngleLabel(segment.toWaypointId)}
              versionInfo={versionInfo}
              onPrevVersion={() => handlePrevVersion(segment)}
              onNextVersion={() => handleNextVersion(segment)}
              onRegenerate={() => handleOpenRegenerateModal(segment.id)}
              onDownload={() => handleDownloadSingle(segment, index)}
              onDelete={() => handleDeleteSegment(segment.id)}
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
            onClick={handleStitchClick}
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
          currentPrompt={regenerateModalSegment.prompt || currentProject?.settings.transitionPrompt}
          imageWidth={currentProject?.sourceImageDimensions?.width}
          imageHeight={currentProject?.sourceImageDimensions?.height}
          resolution={(currentProject?.settings.videoResolution as VideoResolution) || DEFAULT_VIDEO_SETTINGS.resolution}
          quality={(currentProject?.settings.transitionQuality as VideoQualityPreset) || getAdvancedSettings().videoQuality}
          duration={currentProject?.settings.transitionDuration || DEFAULT_VIDEO_SETTINGS.duration}
          tokenType={currentProject?.settings.tokenType as 'spark' | 'sogni' || 'spark'}
          onConfirm={handleRegenerateConfirm}
          onCancel={handleRegenerateCancel}
        />
      )}

      {/* Partial Stitch Confirmation Modal */}
      {showPartialStitchConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/15 p-5">
          <LiquidGlassPanel
            cornerRadius={24}
            className="max-w-md w-full mx-4 glass-modal"
            displacementScale={60}
            saturation={160}
            aberrationIntensity={4}
          >
            <div
              className="p-7"
              onClick={(e) => e.stopPropagation()}
            >
            <h2 className="text-xl font-semibold text-white mb-3">Not All Videos Ready</h2>
            <p className="text-gray-300 mb-4">
              Only <span className="text-white font-medium">{readyCount}</span> of <span className="text-white font-medium">{totalSegments}</span> transition videos are ready.
              {pendingCount > 0 && <> <span className="text-yellow-400">{pendingCount} pending.</span></>}
              {generatingCount > 0 && <> <span className="text-blue-400">{generatingCount} generating.</span></>}
              {failedCount > 0 && <> <span className="text-red-400">{failedCount} failed.</span></>}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              The final video will only include the completed transitions. Continue anyway?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPartialStitchConfirm(false)}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-medium transition-all min-h-[44px] border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPartialStitch}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium transition-all min-h-[44px] shadow-lg shadow-purple-500/25"
              >
                Continue
              </button>
            </div>
            </div>
          </LiquidGlassPanel>
        </div>
      )}
    </div>
  );
};

export default TransitionReviewPanel;
