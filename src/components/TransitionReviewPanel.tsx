import React, { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import type { Segment } from '../types';

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

  const waypoints = currentProject?.waypoints || [];
  const segments = currentProject?.segments || [];

  // Get waypoint by ID
  const getWaypoint = (id: string) => waypoints.find(wp => wp.id === id);

  // Count statuses
  const readyCount = segments.filter(s => s.status === 'ready').length;
  const generatingCount = segments.filter(s => s.status === 'generating').length;
  const failedCount = segments.filter(s => s.status === 'failed').length;

  const totalSegments = segments.length;
  const completedSegments = readyCount;

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

  const canStitch = readyCount === totalSegments && totalSegments > 0 && !isGenerating;

  return (
    <div className="transition-review-panel">
      {/* Header */}
      <div className="review-header transition-review-header">
        <div className="review-header-left">
          <div className="review-icon transition-icon">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
          <div className="review-title-group">
            <h2 className="review-title transition-title">
              Creating UR Transitions <span className="sparkles">✨</span>
            </h2>
            <p className="review-subtitle">making transition magic · preview when ready</p>
          </div>
        </div>
        <button className="review-close-btn" onClick={onClose}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Grid of transition tiles */}
      <div className="transition-grid">
        {segments.map((segment, index) => {
          const fromWaypoint = getWaypoint(segment.fromWaypointId);
          const toWaypoint = getWaypoint(segment.toWaypointId);
          const versionCount = segment.versions?.length || 0;
          const currentVersionIdx = segment.currentVersionIndex ?? (versionCount - 1);

          return (
            <div
              key={segment.id}
              className={`transition-tile ${segment.status}`}
            >
              {/* Status badge */}
              <div className={`transition-status-badge ${segment.status}`}>
                {segment.status === 'ready' && '✓'}
                {segment.status === 'generating' && `${Math.round(segment.progress || 0)}%`}
                {segment.status === 'failed' && '×'}
                {segment.status === 'pending' && '...'}
              </div>

              {/* Thumbnail area showing from->to images or video preview */}
              <div
                className="transition-thumbnail"
                style={{
                  aspectRatio: currentProject?.sourceImageDimensions
                    ? `${currentProject.sourceImageDimensions.width} / ${currentProject.sourceImageDimensions.height}`
                    : '3 / 4'
                }}
              >
                {segment.status === 'ready' && segment.videoUrl ? (
                  <video
                    src={segment.videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="transition-video-preview"
                  />
                ) : (
                  <div className="transition-frames">
                    {fromWaypoint?.imageUrl && (
                      <img
                        src={fromWaypoint.imageUrl}
                        alt="From"
                        className="frame-from"
                      />
                    )}
                    {toWaypoint?.imageUrl && (
                      <img
                        src={toWaypoint.imageUrl}
                        alt="To"
                        className="frame-to"
                      />
                    )}
                  </div>
                )}

                {/* Generating overlay */}
                {segment.status === 'generating' && (
                  <div className="transition-generating-overlay">
                    <div className="generating-spinner" />
                    <div className="generating-info">
                      <div className="generating-progress">{Math.round(segment.progress || 0)}%</div>
                      {segment.workerName && (
                        <div className="generating-worker">{segment.workerName}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className="transition-info-bar">
                <div className="transition-info-left">
                  {fromWaypoint?.imageUrl && (
                    <img src={fromWaypoint.imageUrl} alt="" className="info-thumb" />
                  )}
                  <span className="transition-label">Transition {index + 1}</span>
                </div>

                <button
                  className={`redo-btn ${segment.status === 'generating' ? 'generating' : ''}`}
                  onClick={() => onRedoSegment(segment.id)}
                  disabled={segment.status === 'generating'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  redo
                </button>

                {segment.status === 'ready' && <span className="check-mark">✓</span>}
              </div>

              {/* Version navigation (if multiple versions) */}
              {versionCount > 1 && (
                <div className="version-nav">
                  <button
                    className="version-btn"
                    onClick={() => handlePrevVersion(segment)}
                  >
                    ←
                  </button>
                  <span className="version-indicator">
                    v{currentVersionIdx + 1}/{versionCount}
                  </span>
                  <button
                    className="version-btn"
                    onClick={() => handleNextVersion(segment)}
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="transition-footer">
        <div className="transition-status-summary">
          {generatingCount > 0 && (
            <span className="status-generating">
              🎬 Creating {generatingCount} transition{generatingCount !== 1 ? 's' : ''}...
              ({completedSegments}/{totalSegments} done)
            </span>
          )}
          {generatingCount === 0 && readyCount === totalSegments && (
            <span className="status-ready">
              ✓ All {totalSegments} transitions ready
            </span>
          )}
          {failedCount > 0 && (
            <span className="status-failed">
              ! {failedCount} failed
            </span>
          )}
        </div>

        <div className="transition-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            cancel
          </button>
          <button
            className={`btn stitch-btn ${canStitch ? 'ready' : 'disabled'}`}
            onClick={onStitch}
            disabled={!canStitch}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            Stitch All Videos
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransitionReviewPanel;
