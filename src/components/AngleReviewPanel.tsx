import React, { useCallback, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Waypoint } from '../types';
import {
  getAzimuthConfig,
  getElevationConfig,
  getDistanceConfig
} from '../constants/cameraAngleSettings';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';
import WorkflowWizard, { WorkflowStep } from './shared/WorkflowWizard';
import { playVideoCompleteIfEnabled } from '../utils/sonicLogos';
import { downloadSingleImage, downloadImagesAsZip, type ImageDownloadItem } from '../utils/bulkDownload';

interface AngleReviewPanelProps {
  onClose: () => void;
  onApply: () => void;
  isGenerating: boolean;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
}

const AngleReviewPanel: React.FC<AngleReviewPanelProps> = ({
  onClose,
  onApply,
  isGenerating,
  onConfirmDestructiveAction
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject } = state;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  const waypoints = currentProject?.waypoints || [];

  // Count statuses
  const readyCount = waypoints.filter(wp => wp.status === 'ready').length;
  const generatingCount = waypoints.filter(wp => wp.status === 'generating').length;
  const failedCount = waypoints.filter(wp => wp.status === 'failed').length;

  // Workflow step
  const completedSteps: ('upload' | 'define-angles' | 'render-angles' | 'render-videos' | 'export')[] = ['upload', 'define-angles'];

  // Get angle label
  const getAngleLabel = (waypoint: Waypoint): string => {
    if (waypoint.isOriginal) return 'Original Image';
    const az = getAzimuthConfig(waypoint.azimuth);
    const el = getElevationConfig(waypoint.elevation);
    const dist = getDistanceConfig(waypoint.distance);
    return `${az.label} · ${el.label} · ${dist.label}`;
  };

  // Execute redo for a single waypoint (called after confirmation)
  const executeRedo = useCallback(async (waypoint: Waypoint) => {
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
              type: 'ADD_WAYPOINT_VERSION',
              payload: { waypointId, imageUrl }
            });
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: { id: waypointId, updates: { status: 'ready', progress: 100, error: undefined } }
            });
            showToast({ message: 'Angle regenerated', type: 'success' });
            // Play sound when single angle completes
            playVideoCompleteIfEnabled();
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

  // Handle redo button click - confirms if work would be lost
  const handleRedo = useCallback((waypoint: Waypoint) => {
    if (waypoint.isOriginal) return;

    // Use confirmation callback if provided, otherwise execute directly
    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-angles', () => executeRedo(waypoint));
    } else {
      executeRedo(waypoint);
    }
  }, [onConfirmDestructiveAction, executeRedo]);

  // Navigate versions
  const handlePrevVersion = useCallback((waypoint: Waypoint) => {
    if (!waypoint.imageHistory || waypoint.imageHistory.length <= 1) return;
    const currentIdx = waypoint.currentImageIndex ?? waypoint.imageHistory.length - 1;
    if (currentIdx > 0) {
      dispatch({
        type: 'SELECT_WAYPOINT_VERSION',
        payload: { waypointId: waypoint.id, index: currentIdx - 1 }
      });
    }
  }, [dispatch]);

  const handleNextVersion = useCallback((waypoint: Waypoint) => {
    if (!waypoint.imageHistory || waypoint.imageHistory.length <= 1) return;
    const currentIdx = waypoint.currentImageIndex ?? waypoint.imageHistory.length - 1;
    if (currentIdx < waypoint.imageHistory.length - 1) {
      dispatch({
        type: 'SELECT_WAYPOINT_VERSION',
        payload: { waypointId: waypoint.id, index: currentIdx + 1 }
      });
    }
  }, [dispatch]);

  const getVersionInfo = (waypoint: Waypoint) => {
    if (!waypoint.imageHistory || waypoint.imageHistory.length <= 1) return null;
    const currentIdx = waypoint.currentImageIndex ?? waypoint.imageHistory.length - 1;
    return {
      current: currentIdx + 1,
      total: waypoint.imageHistory.length,
      canPrev: currentIdx > 0,
      canNext: currentIdx < waypoint.imageHistory.length - 1
    };
  };

  // Download single image
  const handleDownloadSingle = useCallback(async (waypoint: Waypoint, index: number) => {
    if (!waypoint.imageUrl) return;

    setDownloadingId(waypoint.id);
    try {
      const angleLabel = waypoint.isOriginal
        ? 'original'
        : `${waypoint.azimuth}-${waypoint.elevation}-${waypoint.distance}`;
      const filename = `sogni-360-step${index + 1}-${angleLabel}.jpg`;

      const success = await downloadSingleImage(waypoint.imageUrl, filename);
      if (success) {
        showToast({ message: 'Image downloaded', type: 'success' });
      } else {
        showToast({ message: 'Download failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Download failed', type: 'error' });
    } finally {
      setDownloadingId(null);
    }
  }, [showToast]);

  // Download all images as ZIP
  const handleDownloadAll = useCallback(async () => {
    const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl);
    if (readyWaypoints.length === 0) {
      showToast({ message: 'No images to download', type: 'error' });
      return;
    }

    setIsDownloadingAll(true);
    setDownloadProgress('Preparing download...');

    try {
      const images: ImageDownloadItem[] = readyWaypoints.map((wp) => {
        const originalIndex = waypoints.indexOf(wp);
        const angleLabel = wp.isOriginal
          ? 'original'
          : `${wp.azimuth}-${wp.elevation}-${wp.distance}`;
        return {
          url: wp.imageUrl!,
          filename: `sogni-360-step${originalIndex + 1}-${angleLabel}.jpg`
        };
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const success = await downloadImagesAsZip(
        images,
        `sogni-360-angles-${timestamp}.zip`,
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
  }, [waypoints, showToast]);

  const canProceed = readyCount >= 2 && generatingCount === 0 && failedCount === 0;
  const totalComplete = readyCount;
  const totalAngles = waypoints.length;

  return (
    <div className="review-panel">
      {/* Wizard Progress Bar */}
      <div className="review-wizard-wrap">
        <WorkflowWizard
          currentStep="render-angles"
          completedSteps={completedSteps}
        />
      </div>

      {/* Header */}
      <div className="review-header-bar">
        <div>
          <h2 className="review-main-title">{isGenerating ? 'Generating Angles' : 'Review Angles'}</h2>
          <p className="review-main-subtitle">{totalComplete} of {totalAngles} complete</p>
        </div>
        <button className="review-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Carousel */}
      <div className="review-carousel-wrap" ref={carouselRef}>
        {waypoints.map((waypoint, index) => {
          const versionInfo = getVersionInfo(waypoint);
          return (
            <div key={waypoint.id} className="review-card-clean">
              {/* Card Header */}
              <div className="review-card-top">
                <span className="review-card-step-num">Step {index + 1}</span>
                {waypoint.isOriginal && <span className="review-card-orig-tag">Original</span>}
              </div>

              {/* Image - Expands to fill available vertical space */}
              <div className="review-card-img">
                {waypoint.imageUrl ? (
                  <img src={waypoint.imageUrl} alt={`Step ${index + 1}`} />
                ) : currentProject?.sourceImageUrl ? (
                  <img
                    src={currentProject.sourceImageUrl}
                    alt={`Step ${index + 1}`}
                    className={waypoint.status === 'generating' ? 'dimmed' : ''}
                  />
                ) : null}

                {/* Status overlays */}
                {waypoint.status === 'generating' && (
                  <div className="review-card-overlay">
                    <div className="review-progress-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="ring-bg" cx="50" cy="50" r="42" />
                        <circle
                          className="ring-fill"
                          cx="50"
                          cy="50"
                          r="42"
                          strokeDasharray={`${(waypoint.progress || 0) * 2.64} 264`}
                        />
                      </svg>
                      <span className="ring-text">{Math.round(waypoint.progress || 0)}%</span>
                    </div>
                  </div>
                )}

                {waypoint.status === 'failed' && (
                  <div className="review-card-overlay failed">
                    <div className="failed-badge">!</div>
                    <span>{waypoint.error || 'Failed'}</span>
                  </div>
                )}

                {waypoint.status === 'ready' && (
                  <div className="review-card-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info Section - Fixed Height */}
              <div className="review-card-info">
                <div className="review-card-angle">{getAngleLabel(waypoint)}</div>

                {/* Version Nav - Always reserve space */}
                <div className={`review-card-versions ${versionInfo ? 'visible' : 'hidden'}`}>
                  {versionInfo ? (
                    <>
                      <button
                        className="ver-btn"
                        onClick={() => handlePrevVersion(waypoint)}
                        disabled={!versionInfo.canPrev}
                      >
                        ‹
                      </button>
                      <span>Version {versionInfo.current} of {versionInfo.total}</span>
                      <button
                        className="ver-btn"
                        onClick={() => handleNextVersion(waypoint)}
                        disabled={!versionInfo.canNext}
                      >
                        ›
                      </button>
                    </>
                  ) : (
                    <span className="ver-placeholder">&nbsp;</span>
                  )}
                </div>

                {/* Action Buttons Row */}
                <div className="review-card-actions">
                  {/* Download Button - Only when ready with image */}
                  <button
                    className={`review-card-btn download ${waypoint.status !== 'ready' || !waypoint.imageUrl ? 'invisible' : ''}`}
                    onClick={() => handleDownloadSingle(waypoint, index)}
                    disabled={waypoint.status !== 'ready' || !waypoint.imageUrl || downloadingId === waypoint.id}
                  >
                    {downloadingId === waypoint.id ? (
                      <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    Download
                  </button>

                  {/* Regenerate Button - Always same position */}
                  <button
                    className={`review-card-btn regen ${waypoint.isOriginal ? 'invisible' : ''} ${waypoint.status === 'generating' ? 'loading' : ''}`}
                    onClick={() => handleRedo(waypoint)}
                    disabled={waypoint.isOriginal || waypoint.status === 'generating'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
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
            className={`btn ${canProceed ? 'btn-primary' : 'btn-disabled'}`}
            onClick={onApply}
            disabled={!canProceed}
          >
            Generate Transitions
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AngleReviewPanel;
