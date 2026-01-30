import React, { useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { Segment } from '../types';
import {
  getAzimuthConfig,
  getElevationConfig
} from '../constants/cameraAngleSettings';
import WorkflowWizard from './shared/WorkflowWizard';
import TransitionVideoCard from './TransitionVideoCard';

interface TransitionReviewPanelProps {
  onClose: () => void;
  onStitch: () => void;
  onRedoSegment: (segmentId: string) => void;
  isGenerating: boolean;
}

const TransitionReviewPanel: React.FC<TransitionReviewPanelProps> = ({
  onClose,
  onStitch,
  onRedoSegment,
  isGenerating
}) => {
  const { state, dispatch } = useApp();
  const { currentProject } = state;
  const carouselRef = useRef<HTMLDivElement>(null);

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
              thumbAspect={thumbAspect}
              sourceAspectRatio={sourceAspectRatio}
              fromImageUrl={fromWaypoint?.imageUrl}
              toImageUrl={toWaypoint?.imageUrl}
              fromLabel={getAngleLabel(segment.fromWaypointId)}
              toLabel={getAngleLabel(segment.toWaypointId)}
              versionInfo={versionInfo}
              onPrevVersion={() => handlePrevVersion(segment)}
              onNextVersion={() => handleNextVersion(segment)}
              onRegenerate={() => onRedoSegment(segment.id)}
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
    </div>
  );
};

export default TransitionReviewPanel;
