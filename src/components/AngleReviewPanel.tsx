import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Waypoint } from '../types';
import {
  getAzimuthConfig,
  AZIMUTHS,
  ELEVATIONS,
  DISTANCES,
  getEnhanceSteps
} from '../constants/cameraAngleSettings';
import { getAdvancedSettings } from '../hooks/useAdvancedSettings';
import type { AzimuthKey, ElevationKey, DistanceKey } from '../types';
import { generateMultipleAngles } from '../services/CameraAngleGenerator';
import { enhanceImage } from '../services/ImageEnhancer';
import WorkflowWizard, { WorkflowStep } from './shared/WorkflowWizard';
import { playVideoCompleteIfEnabled } from '../utils/sonicLogos';
import { downloadSingleImage, downloadImagesAsZip, type ImageDownloadItem } from '../utils/bulkDownload';
import EnhancePromptPopup from './shared/EnhancePromptPopup';
import AddAnglePopup from './AddAnglePopup';
import FullscreenMediaViewer from './shared/FullscreenMediaViewer';
import { trackDownload } from '../utils/analytics';
import { ensureDataUrl } from '../utils/imageUtils';

interface AngleReviewPanelProps {
  onClose: () => void;
  onApply: () => void;
  isGenerating: boolean;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  onWorkflowStepClick?: (step: WorkflowStep) => void;
  onRequireAuth?: () => void;
  onOutOfCredits?: () => void;
}

const AngleReviewPanel: React.FC<AngleReviewPanelProps> = ({
  onClose,
  onApply,
  isGenerating,
  onConfirmDestructiveAction,
  onWorkflowStepClick,
  onRequireAuth,
  onOutOfCredits
}) => {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, isAuthenticated, hasUsedFreeGeneration } = state;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [isEnhancingAll, setIsEnhancingAll] = useState(false);
  const [enhanceAllProgress, setEnhanceAllProgress] = useState<{ current: number; total: number } | null>(null);

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Mobile reorder menu state (shows arrows instead of drag on touch devices)
  const [reorderMenuId, setReorderMenuId] = useState<string | null>(null);

  // Close reorder menu when clicking outside
  useEffect(() => {
    if (!reorderMenuId) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.reorder-menu') && !target.closest('.review-card-drag-handle')) {
        setReorderMenuId(null);
      }
    };

    // Slight delay to avoid immediately closing from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchend', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchend', handleClickOutside);
    };
  }, [reorderMenuId]);

  // Popup state
  const [showEnhancePopup, setShowEnhancePopup] = useState(false);
  const [pendingEnhanceWaypoint, setPendingEnhanceWaypoint] = useState<Waypoint | null>(null);
  const [isEnhanceAllMode, setIsEnhanceAllMode] = useState(false);

  // Add angle popup state
  const [showAddAnglePopup, setShowAddAnglePopup] = useState(false);
  const [insertAfterIndex, setInsertAfterIndex] = useState(-1);

  // Fullscreen image viewer state - track waypoint ID to support version navigation
  const [fullscreenWaypointId, setFullscreenWaypointId] = useState<string | null>(null);

  // Reference image selection for regeneration (waypointId -> 'original' | otherWaypointId)
  const [referenceSelections, setReferenceSelections] = useState<Record<string, string>>({});
  // Ref to track current selections for use in memoized callbacks
  const referenceSelectionsRef = useRef(referenceSelections);
  referenceSelectionsRef.current = referenceSelections;

  // Tooltip visibility state (waypointId or null)
  const [visibleTooltip, setVisibleTooltip] = useState<string | null>(null);

  // Angle overrides for regeneration (waypointId -> {azimuth, elevation, distance})
  interface AngleOverride {
    azimuth?: AzimuthKey;
    elevation?: ElevationKey;
    distance?: DistanceKey;
  }
  const [angleOverrides, setAngleOverrides] = useState<Record<string, AngleOverride>>({});
  // Ref to track current overrides for use in memoized callbacks
  const angleOverridesRef = useRef(angleOverrides);
  angleOverridesRef.current = angleOverrides;

  // Get effective angle values (override or original) - uses ref for latest values
  const getEffectiveAngle = useCallback((waypoint: Waypoint) => ({
    azimuth: angleOverridesRef.current[waypoint.id]?.azimuth ?? waypoint.azimuth,
    elevation: angleOverridesRef.current[waypoint.id]?.elevation ?? waypoint.elevation,
    distance: angleOverridesRef.current[waypoint.id]?.distance ?? waypoint.distance
  }), []);

  // Check if angle has been modified from original
  const isAngleModified = (waypoint: Waypoint) => {
    const override = angleOverrides[waypoint.id];
    if (!override) return false;
    return (
      (override.azimuth && override.azimuth !== waypoint.azimuth) ||
      (override.elevation && override.elevation !== waypoint.elevation) ||
      (override.distance && override.distance !== waypoint.distance)
    );
  };

  const waypoints = currentProject?.waypoints || [];

  // Ref to track current waypoints for use in memoized callbacks
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;

  // Get the reference image URL for a waypoint (uses refs for latest values)
  const getReferenceImageUrl = useCallback((waypointId: string): string | undefined => {
    const selection = referenceSelectionsRef.current[waypointId] || 'original';
    if (selection === 'original') {
      return currentProject?.sourceImageUrl;
    }
    // Find the referenced waypoint and use its currently selected version
    const refWaypoint = waypointsRef.current.find(wp => wp.id === selection);
    return refWaypoint?.imageUrl;
  }, [currentProject?.sourceImageUrl]);

  // Get available reference options for a waypoint (excludes itself)
  const getReferenceOptions = useCallback((waypointId: string) => {
    const options: { id: string; label: string }[] = [
      { id: 'original', label: 'Original Photo' }
    ];

    waypoints.forEach((wp, index) => {
      // Skip the current waypoint and any without ready images
      if (wp.id === waypointId || wp.status !== 'ready' || !wp.imageUrl) return;

      const label = wp.isOriginal
        ? `Step ${index + 1}: Original`
        : `Step ${index + 1}: ${getAzimuthConfig(wp.azimuth).label}`;
      options.push({ id: wp.id, label });
    });

    return options;
  }, [waypoints]);

  // Count statuses
  const readyCount = waypoints.filter(wp => wp.status === 'ready').length;
  const generatingCount = waypoints.filter(wp => wp.status === 'generating').length;
  const failedCount = waypoints.filter(wp => wp.status === 'failed').length;

  // Workflow step
  const completedSteps: ('upload' | 'define-angles' | 'render-angles' | 'render-videos' | 'export')[] = ['upload', 'define-angles'];

  // Execute redo for a single waypoint (called after confirmation)
  const executeRedo = useCallback(async (waypoint: Waypoint) => {
    if (!currentProject?.sourceImageUrl || waypoint.isOriginal) return;

    // Get the reference image (either original or another generated angle)
    const rawReferenceUrl = getReferenceImageUrl(waypoint.id) || currentProject.sourceImageUrl;

    // Convert blob URLs to data URLs so the backend can access them
    const referenceImageUrl = await ensureDataUrl(rawReferenceUrl);

    // Get effective angle values (with any overrides applied)
    const effectiveAngles = getEffectiveAngle(waypoint);
    const waypointWithOverrides: Waypoint = {
      ...waypoint,
      azimuth: effectiveAngles.azimuth,
      elevation: effectiveAngles.elevation,
      distance: effectiveAngles.distance
    };

    // Update waypoint with new angles and generating status
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: {
        id: waypoint.id,
        updates: {
          status: 'generating',
          progress: 0,
          error: undefined,
          azimuth: effectiveAngles.azimuth,
          elevation: effectiveAngles.elevation,
          distance: effectiveAngles.distance
        }
      }
    });

    // Clear the override since we're applying it
    setAngleOverrides(prev => {
      const next = { ...prev };
      delete next[waypoint.id];
      return next;
    });

    try {
      await generateMultipleAngles(
        referenceImageUrl,
        [waypointWithOverrides],
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
          onWaypointComplete: (waypointId, result) => {
            dispatch({
              type: 'ADD_WAYPOINT_VERSION',
              payload: { waypointId, imageUrl: result.imageUrl }
            });
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: {
                id: waypointId,
                updates: {
                  status: 'ready',
                  progress: 100,
                  error: undefined,
                  sdkProjectId: result.sdkProjectId,
                  sdkJobId: result.sdkJobId,
                  // Reset enhancement state on regenerate
                  enhanced: false,
                  enhancing: false,
                  enhancementProgress: 0,
                  originalImageUrl: undefined,
                  enhancedImageUrl: undefined,
                  canUndoEnhance: false,
                  canRedoEnhance: false
                }
              }
            });
            // Play sound when single angle completes
            playVideoCompleteIfEnabled();
          },
          onWaypointError: (waypointId, error) => {
            dispatch({
              type: 'UPDATE_WAYPOINT',
              payload: { id: waypointId, updates: { status: 'failed', error: error.message, progress: 0, imageUrl: undefined } }
            });
            showToast({ message: 'Regeneration failed', type: 'error' });
          },
          onOutOfCredits: () => {
            onOutOfCredits?.();
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
  }, [currentProject, dispatch, showToast, onOutOfCredits]);

  // Handle redo button click - confirms if work would be lost
  const handleRedo = useCallback((waypoint: Waypoint) => {
    if (waypoint.isOriginal) return;

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

    // Use confirmation callback if provided, otherwise execute directly
    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-angles', () => executeRedo(waypoint));
    } else {
      executeRedo(waypoint);
    }
  }, [onConfirmDestructiveAction, executeRedo, isAuthenticated, hasUsedFreeGeneration, onRequireAuth, dispatch]);

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

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, waypointId: string) => {
    setDraggedId(waypointId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', waypointId);
    // Add a slight delay to allow the drag image to be set
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.classList.add('dragging');
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.classList.remove('dragging');
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, waypointId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && waypointId !== draggedId) {
      setDragOverId(waypointId);
    }
  }, [draggedId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedWaypointId = e.dataTransfer.getData('text/plain');

    if (!draggedWaypointId || draggedWaypointId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Calculate new order
    const currentOrder = waypoints.map(wp => wp.id);
    const draggedIndex = currentOrder.indexOf(draggedWaypointId);
    const targetIndex = currentOrder.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at target position
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedWaypointId);

    dispatch({ type: 'REORDER_WAYPOINTS', payload: newOrder });
    setDraggedId(null);
    setDragOverId(null);
  }, [waypoints, dispatch]);

  // Mobile reorder handlers (shows arrows instead of dragging)
  const handleReorderMenuToggle = useCallback((waypointId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderMenuId(prev => prev === waypointId ? null : waypointId);
  }, []);

  const handleMoveEarlier = useCallback((waypointId: string) => {
    const currentIndex = waypoints.findIndex(wp => wp.id === waypointId);
    if (currentIndex <= 0) return;

    const newOrder = waypoints.map(wp => wp.id);
    // Swap with previous
    [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];

    dispatch({ type: 'REORDER_WAYPOINTS', payload: newOrder });
    // Keep menu open so user can continue moving
  }, [waypoints, dispatch]);

  const handleMoveLater = useCallback((waypointId: string) => {
    const currentIndex = waypoints.findIndex(wp => wp.id === waypointId);
    if (currentIndex < 0 || currentIndex >= waypoints.length - 1) return;

    const newOrder = waypoints.map(wp => wp.id);
    // Swap with next
    [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];

    dispatch({ type: 'REORDER_WAYPOINTS', payload: newOrder });
    // Keep menu open so user can continue moving
  }, [waypoints, dispatch]);

  // Delete waypoint handler
  const handleDeleteWaypoint = useCallback((waypointId: string) => {
    // Prevent deleting if we'd have fewer than 2 waypoints
    if (waypoints.length <= 2) {
      showToast({ message: 'Minimum 2 angles required', type: 'error' });
      return;
    }

    dispatch({ type: 'REMOVE_WAYPOINT', payload: waypointId });
    showToast({ message: 'Angle removed', type: 'success' });
  }, [waypoints, dispatch, showToast]);

  // Add angle handlers
  const handleAddAngleClick = useCallback((afterIndex: number) => {
    setInsertAfterIndex(afterIndex);
    setShowAddAnglePopup(true);
  }, []);

  const handleInsertAngle = useCallback((waypoint: Waypoint) => {
    dispatch({
      type: 'INSERT_WAYPOINT',
      payload: { afterIndex: insertAfterIndex, waypoint }
    });
    showToast({ message: 'Angle added', type: 'success' });
    setShowAddAnglePopup(false);
  }, [dispatch, insertAfterIndex, showToast]);

  const handleInsertAngles = useCallback((waypoints: Waypoint[]) => {
    dispatch({
      type: 'INSERT_WAYPOINTS',
      payload: { afterIndex: insertAfterIndex, waypoints }
    });
    showToast({
      message: `${waypoints.length} angles added`,
      type: 'success'
    });
    setShowAddAnglePopup(false);
  }, [dispatch, insertAfterIndex, showToast]);

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
        trackDownload(1, 'image', 'jpg');
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
        trackDownload(images.length, 'image', 'zip');
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

  // Show enhance popup for single image
  const handleEnhanceClick = useCallback((waypoint: Waypoint) => {
    if (!waypoint.imageUrl || !currentProject) return;

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

    setPendingEnhanceWaypoint(waypoint);
    setIsEnhanceAllMode(false);
    setShowEnhancePopup(true);
  }, [currentProject, isAuthenticated, hasUsedFreeGeneration, onRequireAuth, dispatch]);

  // Show enhance popup for all images
  const handleEnhanceAllClick = useCallback(() => {
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

    setIsEnhanceAllMode(true);
    setPendingEnhanceWaypoint(null);
    setShowEnhancePopup(true);
  }, [isAuthenticated, hasUsedFreeGeneration, onRequireAuth, dispatch]);

  // Execute enhancement with custom prompt
  const executeEnhance = useCallback(async (waypoint: Waypoint, prompt: string) => {
    if (!waypoint.imageUrl || !currentProject) return;

    setEnhancingId(waypoint.id);

    // Store original image for undo functionality
    dispatch({
      type: 'UPDATE_WAYPOINT',
      payload: {
        id: waypoint.id,
        updates: {
          enhancing: true,
          enhancementProgress: 0,
          originalImageUrl: waypoint.originalImageUrl || waypoint.imageUrl
        }
      }
    });

    try {
      // Get enhance steps based on current photo quality setting
      const advancedSettings = getAdvancedSettings();
      const enhanceSteps = getEnhanceSteps(advancedSettings.photoQuality);

      const enhancedUrl = await enhanceImage({
        imageUrl: waypoint.imageUrl,
        width: currentProject.sourceImageDimensions.width,
        height: currentProject.sourceImageDimensions.height,
        tokenType: currentProject.settings.tokenType,
        prompt,
        steps: enhanceSteps,
        onProgress: (progress) => {
          dispatch({
            type: 'UPDATE_WAYPOINT',
            payload: { id: waypoint.id, updates: { enhancementProgress: progress } }
          });
        },
        onComplete: (imageUrl) => {
          dispatch({
            type: 'ADD_WAYPOINT_VERSION',
            payload: { waypointId: waypoint.id, imageUrl }
          });
          dispatch({
            type: 'UPDATE_WAYPOINT',
            payload: {
              id: waypoint.id,
              updates: {
                enhancing: false,
                enhanced: true,
                enhancementProgress: 100,
                enhancedImageUrl: imageUrl,
                canUndoEnhance: true,
                canRedoEnhance: false
              }
            }
          });
        },
        onError: (error) => {
          dispatch({
            type: 'UPDATE_WAYPOINT',
            payload: {
              id: waypoint.id,
              updates: {
                enhancing: false,
                enhancementProgress: 0,
                error: error.message
              }
            }
          });
        }
      });

      if (!enhancedUrl) {
        dispatch({
          type: 'UPDATE_WAYPOINT',
          payload: {
            id: waypoint.id,
            updates: { enhancing: false, enhancementProgress: 0 }
          }
        });
      }
      return !!enhancedUrl;
    } catch {
      dispatch({
        type: 'UPDATE_WAYPOINT',
        payload: {
          id: waypoint.id,
          updates: { enhancing: false, enhancementProgress: 0 }
        }
      });
      return false;
    } finally {
      setEnhancingId(null);
    }
  }, [currentProject, dispatch]);

  // Handle enhance popup confirmation
  const handleEnhanceConfirm = useCallback(async (prompt: string) => {
    if (isEnhanceAllMode) {
      // Enhance all ready waypoints
      const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl && !wp.enhancing);
      if (readyWaypoints.length === 0) {
        showToast({ message: 'No images to enhance', type: 'error' });
        return;
      }

      setIsEnhancingAll(true);
      setEnhanceAllProgress({ current: 0, total: readyWaypoints.length });

      // Track completed count for progress updates
      let completedCount = 0;
      const updateProgress = () => {
        completedCount++;
        setEnhanceAllProgress({ current: completedCount, total: readyWaypoints.length });
      };

      // Run ALL enhancements in parallel for maximum dePIN network throughput
      const results = await Promise.all(
        readyWaypoints.map(async (wp) => {
          const success = await executeEnhance(wp, prompt);
          updateProgress();
          return success;
        })
      );

      const successCount = results.filter(Boolean).length;

      setIsEnhancingAll(false);
      setEnhanceAllProgress(null);

      if (successCount === readyWaypoints.length) {
        showToast({ message: `All ${successCount} images enhanced`, type: 'success' });
      } else if (successCount > 0) {
        showToast({ message: `${successCount} of ${readyWaypoints.length} images enhanced`, type: 'warning' });
      } else {
        showToast({ message: 'Enhancement failed', type: 'error' });
      }
      playVideoCompleteIfEnabled();
    } else if (pendingEnhanceWaypoint) {
      // Enhance single waypoint
      const success = await executeEnhance(pendingEnhanceWaypoint, prompt);
      if (success) {
        playVideoCompleteIfEnabled();
      } else {
        showToast({ message: 'Enhancement failed', type: 'error' });
      }
    }
  }, [isEnhanceAllMode, pendingEnhanceWaypoint, waypoints, executeEnhance, showToast]);

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
          onStepClick={onWorkflowStepClick}
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
          const isDragging = draggedId === waypoint.id;
          const isDragOver = dragOverId === waypoint.id;
          return (
            <React.Fragment key={waypoint.id}>
              <div
                className={`review-card-clean ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, waypoint.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, waypoint.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, waypoint.id)}
              >
              {/* Card Header */}
              <div className="review-card-top">
                <div className="review-card-top-left">
                  <div
                    className={`review-card-drag-handle ${reorderMenuId === waypoint.id ? 'menu-open' : ''}`}
                    title="Reorder"
                    onClick={(e) => handleReorderMenuToggle(waypoint.id, e)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                    {/* Mobile Reorder Menu */}
                    {reorderMenuId === waypoint.id && (
                      <div className="reorder-menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="reorder-btn"
                          onClick={(e) => { e.stopPropagation(); handleMoveEarlier(waypoint.id); }}
                          disabled={index === 0}
                          title="Move earlier"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <span className="reorder-label">Move</span>
                        <button
                          className="reorder-btn"
                          onClick={(e) => { e.stopPropagation(); handleMoveLater(waypoint.id); }}
                          disabled={index === waypoints.length - 1}
                          title="Move later"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="review-card-step-num">Step {index + 1}</span>
                  {waypoint.isOriginal && <span className="review-card-orig-tag">Original</span>}
                </div>
                {/* Reference selector for non-original waypoints */}
                {!waypoint.isOriginal && (
                  <div className="review-card-reference">
                    <label className="reference-label">
                      Reference:
                      <button
                        type="button"
                        className="reference-info-btn"
                        onClick={() => setVisibleTooltip(visibleTooltip === waypoint.id ? null : waypoint.id)}
                        aria-label="What is reference image?"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
                          <circle cx="12" cy="12" r="10" strokeWidth="2" />
                          <path strokeLinecap="round" strokeWidth="2.5" d="M12 16v-5" />
                          <circle cx="12" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                    </label>
                    <select
                      className="reference-select"
                      value={referenceSelections[waypoint.id] || 'original'}
                      onChange={(e) => setReferenceSelections(prev => ({
                        ...prev,
                        [waypoint.id]: e.target.value
                      }))}
                    >
                      {getReferenceOptions(waypoint.id).map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                    {visibleTooltip === waypoint.id && (
                      <div className="reference-tooltip-bubble" onClick={() => setVisibleTooltip(null)}>
                        <div className="tooltip-arrow" />
                        <p>Select which image to use as the reference when regenerating. Using another generated angle can help maintain consistent details across similar views.</p><br/><p>Just keep in mind your angle will be relative to the subject in the new image. </p>
                      </div>
                    )}
                  </div>
                )}
                {/* Delete button */}
                <button
                  className="review-card-delete-btn"
                  onClick={() => handleDeleteWaypoint(waypoint.id)}
                  title={waypoints.length <= 2 ? 'Minimum 2 angles required' : 'Remove this angle'}
                  disabled={waypoints.length <= 2}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Image - Expands to fill available vertical space */}
              <div
                className={`review-card-img ${waypoint.status === 'ready' && waypoint.imageUrl ? 'clickable' : ''}`}
                onClick={() => {
                  if (waypoint.status === 'ready' && waypoint.imageUrl) {
                    setFullscreenWaypointId(waypoint.id);
                  }
                }}
              >
                {waypoint.imageUrl ? (
                  <img src={waypoint.imageUrl} alt={`Step ${index + 1}`} loading="lazy" />
                ) : (
                  <img
                    src={getReferenceImageUrl(waypoint.id) || currentProject?.sourceImageUrl}
                    alt={`Step ${index + 1}`}
                    className={waypoint.status === 'generating' ? 'dimmed' : 'pending-preview'}
                    loading="lazy"
                  />
                )}

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
                  <>
                    <div className="review-card-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </>
                )}
              </div>

              {/* Info Section - Fixed Height */}
              <div className="review-card-info">
                {waypoint.isOriginal ? (
                  <div className="review-card-angle">Original Image</div>
                ) : (
                  <div className="review-card-angle-selectors">
                    <select
                      className="angle-select"
                      value={angleOverrides[waypoint.id]?.azimuth ?? waypoint.azimuth}
                      onChange={(e) => setAngleOverrides(prev => ({
                        ...prev,
                        [waypoint.id]: { ...prev[waypoint.id], azimuth: e.target.value as AzimuthKey }
                      }))}
                    >
                      {AZIMUTHS.map(az => (
                        <option key={az.key} value={az.key}>{az.label}</option>
                      ))}
                    </select>
                    <span className="angle-separator">·</span>
                    <select
                      className="angle-select"
                      value={angleOverrides[waypoint.id]?.elevation ?? waypoint.elevation}
                      onChange={(e) => setAngleOverrides(prev => ({
                        ...prev,
                        [waypoint.id]: { ...prev[waypoint.id], elevation: e.target.value as ElevationKey }
                      }))}
                    >
                      {ELEVATIONS.map(el => (
                        <option key={el.key} value={el.key}>{el.label}</option>
                      ))}
                    </select>
                    <span className="angle-separator">·</span>
                    <select
                      className="angle-select"
                      value={angleOverrides[waypoint.id]?.distance ?? waypoint.distance}
                      onChange={(e) => setAngleOverrides(prev => ({
                        ...prev,
                        [waypoint.id]: { ...prev[waypoint.id], distance: e.target.value as DistanceKey }
                      }))}
                    >
                      {DISTANCES.map(d => (
                        <option key={d.key} value={d.key}>{d.label}</option>
                      ))}
                    </select>
                    {isAngleModified(waypoint) && (
                      <span className="angle-modified-indicator" title="Angle changed - click Regenerate to apply">*</span>
                    )}
                  </div>
                )}

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

                  {/* Enhance Button - Always allows enhancing, versions are tracked */}
                  <button
                    className={`review-card-btn enhance ${waypoint.status !== 'ready' || !waypoint.imageUrl ? 'invisible' : ''} ${waypoint.enhancing || enhancingId === waypoint.id ? 'loading' : ''}`}
                    onClick={() => handleEnhanceClick(waypoint)}
                    disabled={waypoint.status !== 'ready' || !waypoint.imageUrl || waypoint.enhancing || enhancingId === waypoint.id || isEnhancingAll}
                    title="Enhance image quality"
                  >
                    {waypoint.enhancing || enhancingId === waypoint.id ? (
                      <>
                        <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {Math.round(waypoint.enhancementProgress || 0)}%
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Enhance
                      </>
                    )}
                  </button>

                  {/* Regenerate Button - Always enabled to allow cancel & retry */}
                  <button
                    className={`review-card-btn regen ${waypoint.isOriginal ? 'invisible' : ''} ${waypoint.status === 'generating' ? 'loading' : ''}`}
                    onClick={() => handleRedo(waypoint)}
                    disabled={waypoint.isOriginal}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {waypoint.status === 'generating' ? 'Restart' : 'Regenerate'}
                  </button>
                </div>
              </div>
              </div>
              {/* Add button after each card */}
              <button
                className="review-add-angle-btn"
                onClick={() => handleAddAngleClick(index)}
                title="Add angle after"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </React.Fragment>
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

          {/* Enhance All Button */}
          <button
            className={`btn btn-enhance ${readyCount === 0 || isEnhancingAll ? 'btn-disabled' : ''}`}
            onClick={handleEnhanceAllClick}
            disabled={readyCount === 0 || isEnhancingAll || generatingCount > 0}
          >
            {isEnhancingAll ? (
              <>
                <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {enhanceAllProgress ? `${enhanceAllProgress.current}/${enhanceAllProgress.total}` : 'Enhancing...'}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Enhance All
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

      {/* Enhance Prompt Popup */}
      <EnhancePromptPopup
        isOpen={showEnhancePopup}
        onClose={() => {
          setShowEnhancePopup(false);
          setPendingEnhanceWaypoint(null);
          setIsEnhanceAllMode(false);
        }}
        onConfirm={handleEnhanceConfirm}
        title={isEnhanceAllMode ? 'Enhance All Images' : 'Enhance Image'}
        description={isEnhanceAllMode
          ? 'Customize the enhancement prompt. This will be applied to all ready images.'
          : 'Customize the enhancement prompt to control how your image is enhanced.'}
        imageCount={isEnhanceAllMode
          ? waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl && !wp.enhancing).length
          : 1}
        tokenType={currentProject?.settings.tokenType || 'spark'}
      />

      {/* Add Angle Popup */}
      <AddAnglePopup
        isOpen={showAddAnglePopup}
        onClose={() => setShowAddAnglePopup(false)}
        insertAfterIndex={insertAfterIndex}
        sourceImageDimensions={currentProject?.sourceImageDimensions || { width: 896, height: 1152 }}
        onInsertAngle={handleInsertAngle}
        onInsertAngles={handleInsertAngles}
      />

      {/* Fullscreen Image Viewer with Version Navigation */}
      {fullscreenWaypointId && (() => {
        const fullscreenWaypoint = waypoints.find(wp => wp.id === fullscreenWaypointId);
        if (!fullscreenWaypoint?.imageUrl) return null;
        const versionInfo = getVersionInfo(fullscreenWaypoint);

        // Looping version navigation
        const handleFullscreenPrev = () => {
          if (!fullscreenWaypoint.imageHistory || fullscreenWaypoint.imageHistory.length <= 1) return;
          const currentIdx = fullscreenWaypoint.currentImageIndex ?? fullscreenWaypoint.imageHistory.length - 1;
          const newIdx = currentIdx > 0 ? currentIdx - 1 : fullscreenWaypoint.imageHistory.length - 1;
          dispatch({ type: 'SELECT_WAYPOINT_VERSION', payload: { waypointId: fullscreenWaypoint.id, index: newIdx } });
        };

        const handleFullscreenNext = () => {
          if (!fullscreenWaypoint.imageHistory || fullscreenWaypoint.imageHistory.length <= 1) return;
          const currentIdx = fullscreenWaypoint.currentImageIndex ?? fullscreenWaypoint.imageHistory.length - 1;
          const newIdx = currentIdx < fullscreenWaypoint.imageHistory.length - 1 ? currentIdx + 1 : 0;
          dispatch({ type: 'SELECT_WAYPOINT_VERSION', payload: { waypointId: fullscreenWaypoint.id, index: newIdx } });
        };

        return (
          <FullscreenMediaViewer
            type="image"
            src={fullscreenWaypoint.imageUrl}
            onClose={() => setFullscreenWaypointId(null)}
            versionInfo={versionInfo}
            onPrevVersion={handleFullscreenPrev}
            onNextVersion={handleFullscreenNext}
            loop
          />
        );
      })()}
    </div>
  );
};

export default AngleReviewPanel;
