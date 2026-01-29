import React, { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Waypoint } from '../types';
import {
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../constants/cameraAngleSettings';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';

interface AngleReviewPanelProps {
  onClose: () => void;
  onApply: () => void;
  isGenerating: boolean;
}

const AngleReviewPanel: React.FC<AngleReviewPanelProps> = ({
  onClose,
  onApply,
  isGenerating
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject } = state;

  const waypoints = currentProject?.waypoints || [];

  // Count statuses
  const readyCount = waypoints.filter(wp => wp.status === 'ready').length;
  const generatingCount = waypoints.filter(wp => wp.status === 'generating').length;
  const failedCount = waypoints.filter(wp => wp.status === 'failed').length;
  const pendingCount = waypoints.filter(wp => wp.status === 'pending').length;

  // Get angle label
  const getAngleLabel = (waypoint: Waypoint): string => {
    if (waypoint.isOriginal) return 'source image';
    const az = getAzimuthConfig(waypoint.azimuth);
    const el = getElevationConfig(waypoint.elevation);
    const dist = getDistanceConfig(waypoint.distance);
    return `${az.label.toLowerCase()} · ${el.label.toLowerCase()} · ${dist.label.toLowerCase()}`;
  };

  // Redo a single waypoint
  const handleRedo = useCallback(async (waypoint: Waypoint) => {
    if (!currentProject?.sourceImageUrl || waypoint.isOriginal) return;

    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: { id: waypoint.id, updates: { status: 'generating', progress: 0, error: undefined } }
    });

    try {
      await generateMultipleAngles(
        currentProject.sourceImageUrl,
        [waypoint],
        currentProject.sourceImageDimensions.width,
        currentProject.sourceImageDimensions.height,
        {
          tokenType: currentProject.settings.tokenType,
          onWaypointProgress: (waypointId, progress) => {
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: { id: waypointId, updates: { progress } }
            });
          },
          onWaypointComplete: (waypointId, imageUrl) => {
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: { id: waypointId, updates: { status: 'ready', imageUrl, progress: 100, error: undefined } }
            });
            showToast({ message: 'Angle regenerated', type: 'success' });
          },
          onWaypointError: (waypointId, error) => {
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: { id: waypointId, updates: { status: 'failed', error: error.message, progress: 0, imageUrl: undefined } }
            });
            showToast({ message: 'Regeneration failed', type: 'error' });
          }
        }
      );
    } catch (error) {
      dispatch({
        type: 'UPDATE_WAYPOINT',
        payload: { id: waypoint.id, updates: { status: 'failed', error: 'Redo failed', progress: 0 } }
      });
      showToast({ message: 'Regeneration failed', type: 'error' });
    }
  }, [currentProject, dispatch, showToast]);

  const canApply = readyCount >= 2 && generatingCount === 0 && failedCount === 0;
  const totalComplete = readyCount;
  const totalAngles = waypoints.length;

  return (
    <div className="angle-review-panel">
      {/* Header */}
      <div className="review-header">
        <div className="review-header-left">
          <div className="review-icon">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="review-title-group">
            <h2 className="review-title">{isGenerating ? 'Generating Angles' : 'Review Angles'}</h2>
            <p className="review-subtitle">{totalComplete} of {totalAngles} complete</p>
          </div>
        </div>
        <button
          className="review-close-btn"
          onClick={onClose}
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Grid of angle tiles */}
      <div className="review-grid">
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="review-tile">
            {/* Status badge */}
            <div className={`tile-status-badge ${waypoint.isOriginal ? 'original' : waypoint.status}`}>
              {waypoint.isOriginal ? 'original' : waypoint.status === 'generating'
                ? `${Math.round(waypoint.progress || 0)}%`
                : waypoint.status}
            </div>

            {/* Index badge */}
            <div className="tile-index-badge">{index}</div>

            {/* Image area */}
            <div className="tile-image-area">
              {waypoint.imageUrl ? (
                <img src={waypoint.imageUrl} alt={`Angle ${index}`} />
              ) : currentProject?.sourceImageUrl ? (
                <img
                  src={currentProject.sourceImageUrl}
                  alt={`Angle ${index}`}
                  className={waypoint.status === 'generating' ? 'dimmed' : 'preview'}
                />
              ) : null}

              {/* Generating overlay */}
              {waypoint.status === 'generating' && (
                <div className="tile-generating-overlay">
                  <div className="progress-ring">
                    <svg viewBox="0 0 36 36">
                      <path
                        className="progress-ring-bg"
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="progress-ring-fill"
                        strokeDasharray={`${waypoint.progress || 0}, 100`}
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="progress-center-dot" />
                  </div>
                  <div className="generating-stats">
                    <div className="generating-percent">{Math.round(waypoint.progress || 0)}%</div>
                    <div className="generating-time">~{Math.ceil((100 - (waypoint.progress || 0)) / 10)}s left</div>
                  </div>
                </div>
              )}

              {/* Failed overlay */}
              {waypoint.status === 'failed' && (
                <div className="tile-failed-overlay">
                  <div className="failed-icon">!</div>
                  <div className="failed-text">{waypoint.error || 'Failed'}</div>
                </div>
              )}
            </div>

            {/* Angle info */}
            <div className="tile-info">
              <div className="tile-angle-label">{getAngleLabel(waypoint)}</div>
            </div>

            {/* Redo button */}
            {!waypoint.isOriginal && waypoint.status !== 'pending' && (
              <button
                className={`tile-redo-btn ${waypoint.status === 'generating' ? 'generating' : ''}`}
                onClick={() => handleRedo(waypoint)}
                disabled={waypoint.status === 'generating'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                redo
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="review-footer">
        <div className="review-status-summary">
          {readyCount > 0 && (
            <span className="status-item ready">
              <span className="status-icon">✓</span>
              {readyCount} ready
            </span>
          )}
          {generatingCount > 0 && (
            <span className="status-item generating">
              <span className="status-icon spinning">⟳</span>
              {generatingCount} generating
            </span>
          )}
          {failedCount > 0 && (
            <span className="status-item failed">
              <span className="status-icon">!</span>
              {failedCount} failed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="status-item pending">
              {pendingCount} pending
            </span>
          )}
        </div>

        <div className="review-actions">
          <button
            className="btn btn-ghost review-cancel-btn"
            onClick={onClose}
          >
            cancel
          </button>
          <button
            className={`btn review-apply-btn ${canApply ? 'ready' : 'disabled'}`}
            onClick={onApply}
            disabled={!canApply}
          >
            apply to gallery
          </button>
        </div>
      </div>
    </div>
  );
};

export default AngleReviewPanel;
