import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Segment, Sogni360Project, MusicSelection } from '../types';
import { useApp } from '../context/AppContext';
import { useSogniAuth } from '../services/sogniAuth';
import SourceUploader from './SourceUploader';
import Sogni360Viewer from './Sogni360Viewer';
import WaypointEditor from './WaypointEditor';
import AngleReviewPanel from './AngleReviewPanel';
import CameraAngle3DControl from './shared/CameraAngle3DControl';
import WorkflowWizard, { computeWorkflowStep, WorkflowStep } from './shared/WorkflowWizard';
import TransitionConfigPanel, { TransitionGenerationSettings } from './TransitionConfigPanel';
import TransitionReviewPanel from './TransitionReviewPanel';
import FinalVideoPanel from './FinalVideoPanel';
import ProjectManagerModal from './ProjectManagerModal';
import WorkflowNavigationModal from './WorkflowNavigationModal';
import NewProjectConfirmModal from './NewProjectConfirmModal';
import ProjectNameModal, { generateProjectName } from './ProjectNameModal';
import AuthStatus, { AuthStatusRef } from './auth/AuthStatus';
import LoginPromptModal from './auth/LoginPromptModal';
import StripePurchase from './stripe/StripePurchase';
import PWAInstallPrompt from './shared/PWAInstallPrompt';
import OutOfCreditsPopup from './shared/OutOfCreditsPopup';
import SwitchCurrencyPopup from './shared/SwitchCurrencyPopup';
import DemoCoachmark from './shared/DemoCoachmark';
import { LiquidGlassPanel } from './shared/LiquidGlassPanel';
import { ApiProvider } from '../hooks/useSogniApi';
import { useWallet } from '../hooks/useWallet';
import useAutoHideUI from '../hooks/useAutoHideUI';
import { useTransitionNavigation } from '../hooks/useTransitionNavigation';
import { generateMultipleTransitions } from '../services/TransitionGenerator';
import { registerPendingCost, recordCompletion, discardPending } from '../services/billingHistoryService';
import { duplicateProject, getProjectCount } from '../utils/localProjectsDB';
import { playVideoCompleteIfEnabled, playSogniSignatureIfEnabled } from '../utils/sonicLogos';
import { DEFAULT_VIDEO_SETTINGS, VIDEO_QUALITY_PRESETS, calculateVideoDimensions, calculateVideoFrames } from '../constants/videoSettings';
import { getAzimuthConfig, getElevationConfig, getDistanceConfig } from '../constants/cameraAngleSettings';
import { isDemoProject, hasDemoCoachmarkBeenShown } from '../constants/demo-projects';
import { getOriginalLabel } from '../utils/waypointLabels';
import '../services/pwaInstaller'; // Initialize PWA installer service

// Type for pending destructive action that needs confirmation
interface PendingDestructiveAction {
  fromStep: WorkflowStep;
  toStep: WorkflowStep;
  callback: () => void;
}

const Sogni360Container: React.FC = () => {
  const { state, dispatch, setUIVisible, isRestoring, updateSegment, clearProject, loadProjectById } = useApp();
  const { nextWaypoint, previousWaypoint, isTransitionPlaying, targetWaypointIndex } = useTransitionNavigation();
  const { currentProject, showWaypointEditor, showAngleReview, currentWaypointIndex, showTransitionConfig, showTransitionReview, showFinalVideoPreview, showProjectManager, showLoginPrompt } = state;
  const hasAutoOpenedEditor = useRef(false);
  const authStatusRef = useRef<AuthStatusRef>(null);
  const [isTransitionGenerating, setIsTransitionGenerating] = useState(false);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<PendingDestructiveAction | null>(null);
  const [showNewProjectConfirm, setShowNewProjectConfirm] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showOutOfCredits, setShowOutOfCredits] = useState(false);
  const [showSwitchCurrency, setShowSwitchCurrency] = useState(false);
  const [showDemoCoachmark, setShowDemoCoachmark] = useState(false);
  const [demoProjectName, setDemoProjectName] = useState<string>('');
  const [projectCount, setProjectCount] = useState(0);

  // Auth state
  const { isAuthenticated, isLoading: authLoading, getSogniClient } = useSogniAuth();
  const sogniClient = getSogniClient();

  // Wallet state for balance display and payment method
  const { balances, tokenType, switchPaymentMethod } = useWallet();
  const currentBalance = balances?.[tokenType]?.net ? parseFloat(balances[tokenType].net) : undefined;

  // Get alternative currency info for switch prompt
  const alternativeCurrency = (tokenType === 'spark' ? 'sogni' : 'spark') as 'spark' | 'sogni';
  const alternativeBalance = balances?.[alternativeCurrency]?.net || '0';

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

  // Show project name modal when image is uploaded (and name is default)
  useEffect(() => {
    if (
      currentProject?.sourceImageUrl &&
      !showWaypointEditor &&
      !hasAutoOpenedEditor.current &&
      !isRestoring &&
      !showProjectNameModal &&
      currentProject.name === 'Untitled Project'
    ) {
      hasAutoOpenedEditor.current = true;
      setShowProjectNameModal(true);
    }
  }, [currentProject?.sourceImageUrl, currentProject?.name, showWaypointEditor, isRestoring, showProjectNameModal]);

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
  }, [isAuthenticated]); // dispatch is stable from useReducer

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
    // dispatch, nextWaypoint, previousWaypoint are stable functions
  }, [hasGeneratedImages, state.isPlaying, state.showWaypointEditor, state.showExportPanel, showWaypointEditor, isTransitionPlaying]);

  // Handle starting transition generation
  // Settings are passed directly to avoid React state timing issues
  const handleStartTransitionGeneration = useCallback(async (passedSegments?: Segment[], passedSettings?: TransitionGenerationSettings) => {
    if (!currentProject) return;

    // Use passed segments (from TransitionConfigPanel) or fall back to state
    const allSegments = passedSegments || currentProject.segments;
    if (allSegments.length === 0) return;

    // Filter to only segments that need generation (not already ready)
    const pendingSegments = allSegments.filter(s => s.status !== 'ready');

    // If everything is already ready, just navigate to review — no generation needed
    if (pendingSegments.length === 0) {
      dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false });
      dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
      return;
    }

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

    // Use passed settings directly (avoids race condition with state updates)
    // Fall back to project settings for redo operations
    const resolution = passedSettings?.resolution || currentProject.settings.videoResolution || DEFAULT_VIDEO_SETTINGS.resolution;
    const quality = passedSettings?.quality || (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'balanced';
    const duration = passedSettings?.duration || currentProject.settings.transitionDuration || 1.5;
    const prompt = passedSettings?.transitionPrompt || currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.';

    console.log('[Sogni360Container] Transition generation config:', {
      resolution,
      quality,
      duration,
      sourceWidth,
      sourceHeight,
      hasSourceDimensions: !!currentProject.sourceImageDimensions,
      passedSettings: !!passedSettings
    });

    if (!sourceWidth || !sourceHeight) {
      console.error('[Sogni360Container] WARNING: sourceImageDimensions is missing! Video will generate at wrong size.');
    }

    // Register pending billing costs for each segment
    const billingCorrelations = new Map<string, string>();
    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    const fps = DEFAULT_VIDEO_SETTINGS.fps;

    // Fetch per-segment video cost estimate (non-blocking, fallback to 0)
    let perSegCostToken = 0;
    let perSegCostUSD = 0;
    try {
      const dims = calculateVideoDimensions(sourceWidth || 1024, sourceHeight || 1024, resolution);
      const frames = calculateVideoFrames(duration);
      const estUrl = `https://socket.sogni.ai/api/v1/job-video/estimate/${tokenType}/${encodeURIComponent(qualityConfig.model)}/${dims.width}/${dims.height}/${frames}/${fps}/${qualityConfig.steps}/1`;
      const estResp = await fetch(estUrl);
      if (estResp.ok) {
        const estData = await estResp.json();
        const costRaw = tokenType === 'spark' ? estData?.quote?.project?.costInSpark : estData?.quote?.project?.costInSogni;
        perSegCostToken = typeof costRaw === 'string' ? parseFloat(costRaw) : (costRaw || 0);
        const usdRaw = estData?.quote?.project?.costInUSD;
        perSegCostUSD = typeof usdRaw === 'string' ? parseFloat(usdRaw) : (usdRaw || 0);
      }
    } catch {
      // Cost estimation failed — continue with 0
    }

    for (const seg of pendingSegments) {
      const cid = registerPendingCost(perSegCostToken, perSegCostUSD, tokenType, {
        type: 'video',
        projectName: currentProject.name,
        quality,
        resolution,
        duration,
        fps
      });
      billingCorrelations.set(seg.id, cid);
    }

    try {
      await generateMultipleTransitions(
        pendingSegments,
        waypointImages,
        {
          prompt,
          resolution,
          quality,
          duration,
          tokenType, // Use wallet's tokenType directly
          sourceWidth: sourceWidth || 1024,  // Default to 1024 if missing
          sourceHeight: sourceHeight || 1024,  // Default to 1024 if missing
          onSegmentStart: (segmentId) => {
            updateSegment(segmentId, { status: 'generating', progress: 0, prompt });
          },
          onSegmentProgress: (segmentId, progress, workerName) => {
            updateSegment(segmentId, { progress, workerName });
          },
          onSegmentComplete: (segmentId, result, version) => {
            updateSegment(segmentId, {
              status: 'ready',
              videoUrl: result.videoUrl,
              progress: 100,
              sdkProjectId: result.sdkProjectId,
              sdkJobId: result.sdkJobId
            });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId, version } });
            // Record billing
            const cid = billingCorrelations.get(segmentId);
            if (cid) void recordCompletion(cid);
            // Play sound when each transition completes
            playVideoCompleteIfEnabled();
          },
          onSegmentError: (segmentId, error) => {
            updateSegment(segmentId, { status: 'failed', error: error.message });
            // Discard billing for failed segment
            const cid = billingCorrelations.get(segmentId);
            if (cid) discardPending(cid);
          },
          onOutOfCredits: handleOutOfCredits,
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
  const handleRedoSegment = useCallback(async (segmentId: string, customPrompt?: string) => {
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

    // Use custom prompt if provided, otherwise fall back to segment's last prompt, then project settings
    const prompt = customPrompt || segment.prompt || currentProject.settings.transitionPrompt || 'Cinematic transition shot between starting and ending images. Smooth camera movement.';

    // Reset segment to generating and store the prompt used
    updateSegment(segmentId, { status: 'generating', progress: 0, prompt });

    // Get source dimensions - MUST use actual dimensions
    const redoSourceWidth = currentProject.sourceImageDimensions?.width;
    const redoSourceHeight = currentProject.sourceImageDimensions?.height;
    const redoResolution = currentProject.settings.videoResolution || DEFAULT_VIDEO_SETTINGS.resolution;
    const redoQuality = (currentProject.settings.transitionQuality as 'fast' | 'balanced' | 'quality' | 'pro') || 'balanced';
    const redoDuration = currentProject.settings.transitionDuration || 1.5;
    const redoFps = DEFAULT_VIDEO_SETTINGS.fps;

    console.log('[Sogni360Container] Redo transition config:', {
      resolution: redoResolution,
      sourceWidth: redoSourceWidth,
      sourceHeight: redoSourceHeight,
      prompt: prompt.substring(0, 50) + '...'
    });

    // Register pending billing cost for redo segment
    let redoCid: string | undefined;
    try {
      const redoQualityConfig = VIDEO_QUALITY_PRESETS[redoQuality];
      const redoDims = calculateVideoDimensions(redoSourceWidth || 1024, redoSourceHeight || 1024, redoResolution);
      const redoFrames = calculateVideoFrames(redoDuration);
      const estUrl = `https://socket.sogni.ai/api/v1/job-video/estimate/${tokenType}/${encodeURIComponent(redoQualityConfig.model)}/${redoDims.width}/${redoDims.height}/${redoFrames}/${redoFps}/${redoQualityConfig.steps}/1`;
      const estResp = await fetch(estUrl);
      if (estResp.ok) {
        const estData = await estResp.json();
        const costRaw = tokenType === 'spark' ? estData?.quote?.project?.costInSpark : estData?.quote?.project?.costInSogni;
        const usdRaw = estData?.quote?.project?.costInUSD;
        redoCid = registerPendingCost(
          typeof costRaw === 'string' ? parseFloat(costRaw) : (costRaw || 0),
          typeof usdRaw === 'string' ? parseFloat(usdRaw) : (usdRaw || 0),
          tokenType,
          { type: 'video', projectName: currentProject.name, quality: redoQuality, resolution: redoResolution, duration: redoDuration, fps: redoFps }
        );
      }
    } catch {
      // Cost estimation failed — continue with 0
      redoCid = registerPendingCost(0, 0, tokenType, {
        type: 'video', projectName: currentProject.name, quality: redoQuality, resolution: redoResolution, duration: redoDuration, fps: redoFps
      });
    }

    try {
      await generateMultipleTransitions(
        [segment],
        waypointImages,
        {
          prompt,
          resolution: redoResolution,
          quality: redoQuality,
          duration: redoDuration,
          tokenType, // Use wallet's tokenType directly
          sourceWidth: redoSourceWidth || 1024,
          sourceHeight: redoSourceHeight || 1024,
          onSegmentProgress: (segId, progress, workerName) => {
            updateSegment(segId, { progress, workerName });
          },
          onSegmentComplete: (segId, result, version) => {
            updateSegment(segId, {
              status: 'ready',
              videoUrl: result.videoUrl,
              progress: 100,
              sdkProjectId: result.sdkProjectId,
              sdkJobId: result.sdkJobId
            });
            dispatch({ type: 'ADD_SEGMENT_VERSION', payload: { segmentId: segId, version } });
            // Record billing
            if (redoCid) void recordCompletion(redoCid);
            // Play sound when redo transition completes
            playVideoCompleteIfEnabled();
          },
          onSegmentError: (segId, error) => {
            updateSegment(segId, { status: 'failed', error: error.message });
            if (redoCid) discardPending(redoCid);
          },
          onOutOfCredits: handleOutOfCredits
        }
      );
    } catch (error) {
      console.error('Redo segment error:', error);
      if (redoCid) discardPending(redoCid);
    }
  }, [currentProject, dispatch, updateSegment]);

  // Handle video stitching - plays ready segments in sequence
  const handleStitchVideos = useCallback(async () => {
    if (!currentProject) return;

    // Get only the ready segments with video URLs
    const readySegments = currentProject.segments.filter(s => s.status === 'ready' && s.videoUrl);
    const videoUrls = readySegments.map(s => s.videoUrl).filter(Boolean) as string[];

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

  // Handle music selection change - persist to project settings
  const handleMusicChange = useCallback((selection: MusicSelection | null) => {
    // Convert null to undefined for settings storage
    dispatch({ type: 'UPDATE_SETTINGS', payload: { musicSelection: selection ?? undefined } });
  }, [dispatch]);

  // Handle closing standalone angle review (accessed from timeline)
  const handleStandaloneAngleReviewClose = useCallback(() => {
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
  }, [dispatch]);

  // Handle applying from standalone angle review (proceed to transitions)
  const handleStandaloneAngleReviewApply = useCallback(() => {
    dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: false });
    dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: true });
    // If all transition videos are already ready, show review panel behind config
    const segments = currentProject?.segments || [];
    if (segments.length > 0 && segments.every(s => s.status === 'ready')) {
      dispatch({ type: 'SET_SHOW_TRANSITION_REVIEW', payload: true });
    }
  }, [dispatch, currentProject?.segments]);

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

  // Handle project name cancel - clear upload and go back to empty state
  const handleProjectNameCancel = useCallback(() => {
    setShowProjectNameModal(false);
    dispatch({ type: 'SET_PROJECT', payload: null });
  }, [dispatch]);

  // Handle loading a project
  const handleLoadProject = useCallback(async (projectId: string) => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
    await loadProjectById(projectId);
    hasAutoOpenedEditor.current = true; // Don't auto-open editor for loaded projects
  }, [loadProjectById, dispatch]);

  // Handle importing a project - load it directly into the app
  const handleImportProject = useCallback((project: Sogni360Project) => {
    dispatch({ type: 'SET_PROJECT', payload: project });
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
    hasAutoOpenedEditor.current = true; // Don't auto-open editor for imported projects

    // Show coachmark for demo projects if not already shown
    if (isDemoProject(project.id) && !hasDemoCoachmarkBeenShown()) {
      setDemoProjectName(project.name);
      setShowDemoCoachmark(true);
    }
  }, [dispatch]);

  // Handle closing project manager
  const handleCloseProjectManager = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: false });
  }, [dispatch]);

  // Handle auth requirement - show login prompt modal
  const handleRequireAuth = useCallback(() => {
    dispatch({ type: 'SET_SHOW_LOGIN_PROMPT', payload: true });
  }, [dispatch]);

  // Handle login prompt close
  const handleCloseLoginPrompt = useCallback(() => {
    dispatch({ type: 'SET_SHOW_LOGIN_PROMPT', payload: false });
  }, [dispatch]);

  // Handle login from login prompt
  const handleLoginFromPrompt = useCallback(() => {
    dispatch({ type: 'SET_SHOW_LOGIN_PROMPT', payload: false });
    // Open the auth status login modal
    authStatusRef.current?.openLoginModal();
  }, [dispatch]);

  // Handle opening project manager
  const handleOpenProjectManager = useCallback(() => {
    dispatch({ type: 'SET_SHOW_PROJECT_MANAGER', payload: true });
  }, [dispatch]);

  // Handle out of credits - check if alternative currency has balance, otherwise show out of credits popup
  const handleOutOfCredits = useCallback(() => {
    // Check if the alternative currency has a meaningful balance (> 1 to cover at least something)
    const altBalanceNum = parseFloat(alternativeBalance);
    if (altBalanceNum > 1) {
      // Show switch currency popup instead
      setShowSwitchCurrency(true);
    } else {
      // Show out of credits popup
      setShowOutOfCredits(true);
    }
  }, [alternativeBalance]);

  // Handle switching currency from the popup
  const handleSwitchCurrency = useCallback(() => {
    switchPaymentMethod(alternativeCurrency);
  }, [switchPaymentMethod, alternativeCurrency]);

  // Handle purchase from out of credits popup
  const handleOutOfCreditsPurchase = useCallback(() => {
    setShowOutOfCredits(false);
    setShowPurchaseModal(true);
  }, []);

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
        // For isOriginal waypoints: preserve their existing imageUrl (could be custom uploaded image)
        // For generated waypoints: clear imageUrl to force regeneration
        const resetWaypoints = currentProject.waypoints.map(wp => ({
          ...wp,
          status: (wp.isOriginal ? 'ready' : 'pending') as 'ready' | 'pending',
          imageUrl: wp.isOriginal ? wp.imageUrl : undefined,
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
          // Show review panel standalone (not wrapped in waypoint editor)
          dispatch({ type: 'SET_SHOW_ANGLE_REVIEW', payload: true });
        } else {
          // No generated images yet - need to configure and generate
          dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: true });
        }
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
            onImportProject={handleImportProject}
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
          <div className="global-wizard-bar-spacer" />
          <WorkflowWizard
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleWorkflowStepClick}
          />
        </div>
      )}

      {/* Project actions (auth + new/projects) - outside wizard bar stacking context so it stays above full-screen panels */}
      {currentProject && (
        <div className="project-actions-bar">
          <AuthStatus
            ref={authStatusRef}
            onPurchaseClick={() => setShowPurchaseModal(true)}
            textColor="#ffffff"
            currentProjectName={currentProject?.name}
          />
          {!showWaypointEditor && !showAngleReview && !showTransitionConfig && !showTransitionReview && !showFinalVideoPreview && (
            <div className="project-action-buttons">
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
          )}
        </div>
      )}

      {/* Main viewer */}
      <Sogni360Viewer />

      {/* 3D Camera Angle Indicator with Navigation - shows current angle position */}
      {currentWaypoint && !showWaypointEditor && (
        <div className="camera-angle-indicator-with-nav">
          {/* 3D Control */}
          <LiquidGlassPanel subtle cornerRadius={16}>
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
            {/* Angle label */}
            <div className="angle-label">
              {currentWaypoint.isOriginal ? (
                getOriginalLabel(waypoints, currentWaypoint.id)
              ) : (
                <>
                  {getAzimuthConfig(currentWaypoint.azimuth).label} · {getElevationConfig(currentWaypoint.elevation).label}
                  <br />
                  {getDistanceConfig(currentWaypoint.distance).label}
                </>
              )}
            </div>
            {/* Waypoint counter with inline navigation */}
            {hasGeneratedImages && (
              <div className="waypoint-nav-row">
                <button
                  className="nav-arrow-inline"
                  onClick={previousWaypoint}
                  disabled={isTransitionPlaying}
                  title="Previous (A / Left Arrow)"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="waypoint-counter">
                  {currentWaypointIndex + 1} / {waypoints.length}
                </div>
                <button
                  className="nav-arrow-inline"
                  onClick={nextWaypoint}
                  disabled={isTransitionPlaying}
                  title="Next (D / Right Arrow)"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
            {/* Auto-play checkbox - shown when sequence has playable transitions */}
            {hasGeneratedImages && currentProject?.segments?.some(s => s.status === 'ready' && s.videoUrl) && (
              <label className="autoplay-checkbox">
                <input
                  type="checkbox"
                  checked={state.isPlaying}
                  onChange={(e) => dispatch({ type: 'SET_PLAYING', payload: e.target.checked })}
                />
                <span className="autoplay-checkbox-label">Auto-play</span>
              </label>
            )}
            </div>
          </LiquidGlassPanel>
        </div>
      )}

      {/* Generating state overlay */}
      {isGenerating && !showWaypointEditor && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-[15]">
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
        <WaypointEditor
          onClose={() => dispatch({ type: 'SET_SHOW_WAYPOINT_EDITOR', payload: false })}
          onConfirmDestructiveAction={confirmDestructiveAction}
          onWorkflowStepClick={handleWorkflowStepClick}
          onRequireAuth={handleRequireAuth}
          onOutOfCredits={handleOutOfCredits}
        />
      )}

      {/* Standalone Angle Review Panel - shown when accessed from timeline (not from editor) */}
      {showAngleReview && !showWaypointEditor && (
        <div className="waypoint-editor-panel">
          <AngleReviewPanel
            onClose={handleStandaloneAngleReviewClose}
            onApply={handleStandaloneAngleReviewApply}
            isGenerating={false}
            onConfirmDestructiveAction={confirmDestructiveAction}
            onWorkflowStepClick={handleWorkflowStepClick}
            onRequireAuth={handleRequireAuth}
            onOutOfCredits={handleOutOfCredits}
          />
        </div>
      )}

      {/* Transition Config Panel */}
      {showTransitionConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/15">
          <TransitionConfigPanel
            onClose={() => dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: false })}
            onStartGeneration={handleStartTransitionGeneration}
            onConfirmDestructiveAction={confirmDestructiveAction}
            onRequireAuth={handleRequireAuth}
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
          onWorkflowStepClick={handleWorkflowStepClick}
          onRequireAuth={handleRequireAuth}
          onOpenTransitionConfig={() => dispatch({ type: 'SET_SHOW_TRANSITION_CONFIG', payload: true })}
        />
      )}

      {/* Final Video Preview Panel - plays stitched video with gapless playback */}
      {showFinalVideoPreview && currentProject?.segments && (
        <FinalVideoPanel
          projectId={currentProject.id}
          projectName={currentProject.name}
          videoUrls={currentProject.segments.filter(s => s.status === 'ready' && s.videoUrl).map(s => s.videoUrl) as string[]}
          stitchedVideoUrl={currentProject.finalLoopUrl}
          onClose={handleCloseFinalVideo}
          onBackToEditor={handleBackToEditor}
          onStitchComplete={(url) => {
            dispatch({ type: 'SET_FINAL_LOOP_URL', payload: url });
          }}
          initialMusicSelection={currentProject.settings.musicSelection}
          onMusicChange={handleMusicChange}
          onWorkflowStepClick={handleWorkflowStepClick}
        />
      )}

      {/* Project Manager Modal */}
      {showProjectManager && (
        <ProjectManagerModal
          onClose={handleCloseProjectManager}
          onLoadProject={handleLoadProject}
          onNewProject={handleNewProject}
          onImportProject={handleImportProject}
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

      {/* Out of Credits Popup */}
      <OutOfCreditsPopup
        isOpen={showOutOfCredits}
        onClose={() => setShowOutOfCredits(false)}
        onPurchase={handleOutOfCreditsPurchase}
      />

      {/* Switch Currency Popup - shown when out of credits but has balance in other currency */}
      <SwitchCurrencyPopup
        isOpen={showSwitchCurrency}
        onClose={() => setShowSwitchCurrency(false)}
        onSwitch={handleSwitchCurrency}
        currentCurrency={tokenType}
        alternativeCurrency={alternativeCurrency}
        alternativeBalance={alternativeBalance}
      />

      {/* Stripe Purchase Modal */}
      {showPurchaseModal && sogniClient && (
        <ApiProvider value={sogniClient}>
          <StripePurchase
            onClose={() => setShowPurchaseModal(false)}
            currentBalance={currentBalance}
          />
        </ApiProvider>
      )}

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Login Prompt Modal - shown when auth is required for generation */}
      <LoginPromptModal
        isOpen={showLoginPrompt}
        onClose={handleCloseLoginPrompt}
        onLogin={handleLoginFromPrompt}
        title="Sign in to Continue"
        message="You've used your free generation. Sign in or create an account to keep creating amazing 360° portraits!"
      />

      {/* Demo Coachmark - shown when user loads a demo project for the first time */}
      <DemoCoachmark
        isOpen={showDemoCoachmark}
        onClose={() => setShowDemoCoachmark(false)}
        demoName={demoProjectName}
      />
    </div>
  );
};

export default Sogni360Container;
