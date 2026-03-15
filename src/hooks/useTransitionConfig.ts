/**
 * useTransitionConfig — State management + generation logic for TransitionConfigPanel.
 * Extracted to comply with the 300-line file limit.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import type { Segment, MusicSelection } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_VIDEO_SETTINGS,
  getVideoModelConfig,
  getValidResolutions,
  VideoQualityPreset,
  VideoResolution,
} from '../constants/videoSettings';
import { useAdvancedSettings } from './useAdvancedSettings';
import { warmUpAudio } from '../utils/sonicLogos';
import { useVideoCostEstimation } from './useVideoCostEstimation';
import { useWallet } from './useWallet';
import { useTransitionPrompts } from './useTransitionPrompts';
import type { WorkflowStep } from '../components/shared/WorkflowWizard';

export interface TransitionGenerationSettings {
  resolution: VideoResolution;
  quality: VideoQualityPreset;
  duration: number;
  transitionPrompt: string;
  musicSelection?: MusicSelection;
  usePerSegmentPrompts?: boolean;
  perSegmentPrompts?: Record<string, string>;
}

interface UseTransitionConfigParams {
  onStartGeneration: (segments: Segment[], settings: TransitionGenerationSettings) => void;
  onConfirmDestructiveAction?: (actionStep: WorkflowStep, onConfirm: () => void) => void;
  onRequireAuth?: () => void;
}

export function useTransitionConfig({
  onStartGeneration,
  onConfirmDestructiveAction,
  onRequireAuth,
}: UseTransitionConfigParams) {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const { currentProject, isAuthenticated, hasUsedFreeGeneration } = state;
  const { tokenType } = useWallet();
  const { settings: advancedSettings } = useAdvancedSettings();

  const videoModel = advancedSettings.videoModel;
  const isLtx = videoModel === 'ltx2.3';

  // ── Waypoints & transition count (needed before reconciliation) ──────
  const waypoints = currentProject?.waypoints || [];
  const readyWaypoints = waypoints.filter(wp => wp.status === 'ready' && wp.imageUrl);
  const transitionCount = readyWaypoints.length >= 2 ? readyWaypoints.length : 0;

  // ── Settings change detection ───────────────────────────────────────
  const existingSegments = currentProject?.segments || [];
  const hasGeneratedVideos = existingSegments.some(s => s.status === 'ready' || s.status === 'generating');

  // ── Segment reconciliation (before prompts hook for correct IDs) ────
  const { reconciledSegments, pendingCount, allReady, hasModelMismatch } = useMemo(() => {
    if (transitionCount === 0) return { reconciledSegments: [] as Segment[], pendingCount: 0, allReady: false, hasModelMismatch: false };
    const existingByPair = new Map<string, Segment>();
    for (const seg of existingSegments) {
      existingByPair.set(`${seg.fromWaypointId}->${seg.toWaypointId}`, seg);
    }
    const reconciled: Segment[] = [];
    let pending = 0;
    let modelMismatch = false;
    for (let i = 0; i < readyWaypoints.length; i++) {
      const fromWp = readyWaypoints[i];
      const toWp = readyWaypoints[(i + 1) % readyWaypoints.length];
      const key = `${fromWp.id}->${toWp.id}`;
      const existing = existingByPair.get(key);
      const segModelMismatch = existing?.status === 'ready'
        && (existing.videoModel || 'wan2.2') !== videoModel;
      if (segModelMismatch) modelMismatch = true;
      if (existing && existing.status === 'ready' && !segModelMismatch) {
        reconciled.push(existing);
      } else {
        pending++;
        reconciled.push(existing || {
          id: uuidv4(),
          fromWaypointId: fromWp.id,
          toWaypointId: toWp.id,
          status: 'pending' as const,
          versions: []
        });
      }
    }
    return { reconciledSegments: reconciled, pendingCount: pending, allReady: pending === 0, hasModelMismatch: modelMismatch };
  }, [transitionCount, readyWaypoints, existingSegments, videoModel]);
  const modelChangedWarning = hasModelMismatch && hasGeneratedVideos;

  // ── Transition prompts (uses reconciledSegments for correct IDs) ────
  const promptsHook = useTransitionPrompts({
    savedPrompt: currentProject?.settings.transitionPrompt,
    segments: reconciledSegments,
    waypoints,
    videoModel,
  });
  const { transitionPrompt, promptMode, perSegmentPrompts } = promptsHook;

  // ── Resolution ─────────────────────────────────────────────────────────
  const validResolutions = useMemo(() => getValidResolutions(videoModel), [videoModel]);
  const [resolution, setResolution] = useState<VideoResolution>(() => {
    const saved = (currentProject?.settings.videoResolution as VideoResolution) || DEFAULT_VIDEO_SETTINGS.resolution;
    return validResolutions.includes(saved) ? saved : validResolutions[validResolutions.length - 1];
  });

  // ── Duration ───────────────────────────────────────────────────────────
  const [duration, setDuration] = useState(
    currentProject?.settings.transitionDuration || 1.5
  );
  const durationOptions = useMemo(() => {
    const modelConfig = getVideoModelConfig(videoModel);
    const options = [];
    for (let d = modelConfig.minDuration; d <= modelConfig.maxDuration; d += modelConfig.durationStep) {
      options.push(d);
    }
    return options;
  }, [videoModel]);

  const totalSeconds = transitionCount * duration;

  // ── Quality ────────────────────────────────────────────────────────────
  const savedQuality: VideoQualityPreset = isLtx
    ? 'balanced'
    : ((currentProject?.settings.transitionQuality as VideoQualityPreset) || advancedSettings.videoQuality);
  const [wanQuality, setWanQuality] = useState<VideoQualityPreset>(savedQuality);
  const effectiveQuality = isLtx ? 'balanced' : wanQuality;

  // ── Music ──────────────────────────────────────────────────────────────
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [musicSelection, setMusicSelection] = useState<MusicSelection | null>(
    currentProject?.settings.musicSelection || null
  );

  // ── Settings popup ─────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // ── Settings change tracking ───────────────────────────────────────────
  const initialResolution = useRef(resolution);
  const initialDuration = useRef(duration);
  const settingsChanged = resolution !== initialResolution.current
    || duration !== initialDuration.current;

  // ── Cost estimation ────────────────────────────────────────────────────
  const costEstimation = useVideoCostEstimation({
    imageWidth: currentProject?.sourceImageDimensions?.width,
    imageHeight: currentProject?.sourceImageDimensions?.height,
    resolution, quality: effectiveQuality, duration,
    jobCount: pendingCount, tokenType, enabled: pendingCount > 0
  });
  const regenCostEstimation = useVideoCostEstimation({
    imageWidth: currentProject?.sourceImageDimensions?.width,
    imageHeight: currentProject?.sourceImageDimensions?.height,
    resolution, quality: effectiveQuality, duration,
    jobCount: transitionCount, tokenType, enabled: allReady && transitionCount > 0
  });

  // ── Generation execution (shared) ─────────────────────────────────────
  const executeGeneration = useCallback((forceRegenAll: boolean) => {
    warmUpAudio();
    initialResolution.current = resolution;
    initialDuration.current = duration;

    const usePerSeg = promptMode === 'each';
    const settings: TransitionGenerationSettings = {
      resolution, quality: effectiveQuality, duration, transitionPrompt,
      musicSelection: musicSelection || undefined,
      usePerSegmentPrompts: usePerSeg,
      perSegmentPrompts: usePerSeg ? perSegmentPrompts : undefined,
    };
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        transitionPrompt, videoResolution: resolution,
        transitionDuration: duration, transitionQuality: effectiveQuality,
        musicSelection: musicSelection || undefined
      }
    });

    // Reconciliation already marks model-mismatched segments as pending,
    // so only force-reset remaining ready segments when regen-all or settings changed.
    const shouldReset = forceRegenAll || (settingsChanged && hasGeneratedVideos);
    const finalSegments = shouldReset
      ? reconciledSegments.map(s => ({
          ...s, status: 'pending' as const,
          videoUrl: undefined, progress: undefined, error: undefined
        }))
      : reconciledSegments;

    dispatch({ type: 'SET_SEGMENTS', payload: finalSegments });
    onStartGeneration(finalSegments, settings);
  }, [reconciledSegments, transitionPrompt, resolution, duration, effectiveQuality,
      musicSelection, dispatch, onStartGeneration, settingsChanged, hasGeneratedVideos, promptMode, perSegmentPrompts]);

  const withAuthGate = useCallback((skipWhenAllReady: boolean, action: () => void) => {
    if (readyWaypoints.length < 2) {
      showToast({ message: 'Need at least 2 ready angles to create transitions', type: 'warning' });
      return;
    }
    if (!skipWhenAllReady || !allReady) {
      if (!isAuthenticated && hasUsedFreeGeneration) {
        if (onRequireAuth) onRequireAuth();
        return;
      }
      if (!isAuthenticated && !hasUsedFreeGeneration) {
        dispatch({ type: 'SET_HAS_USED_FREE_GENERATION', payload: true });
      }
    }
    if (onConfirmDestructiveAction) {
      onConfirmDestructiveAction('render-videos', action);
    } else {
      action();
    }
  }, [readyWaypoints.length, allReady, isAuthenticated, hasUsedFreeGeneration,
      onRequireAuth, dispatch, showToast, onConfirmDestructiveAction]);

  const handleStartGeneration = useCallback(
    () => withAuthGate(true, () => executeGeneration(false)),
    [withAuthGate, executeGeneration]
  );

  const handleRegenerateAll = useCallback(
    () => withAuthGate(false, () => executeGeneration(true)),
    [withAuthGate, executeGeneration]
  );

  return {
    videoModel, isLtx,
    prompts: promptsHook,
    validResolutions, resolution, setResolution,
    duration, setDuration, durationOptions,
    wanQuality, setWanQuality, effectiveQuality,
    musicSelection, setMusicSelection, showMusicSelector, setShowMusicSelector,
    showSettings, setShowSettings,
    reconciledSegments, pendingCount, allReady,
    transitionCount, readyWaypoints, totalSeconds,
    settingsChanged, modelChangedWarning,
    costLoading: costEstimation.loading,
    formattedCost: costEstimation.formattedCost,
    formattedUSD: costEstimation.formattedUSD,
    regenCostLoading: regenCostEstimation.loading,
    regenFormattedCost: regenCostEstimation.formattedCost,
    regenFormattedUSD: regenCostEstimation.formattedUSD,
    tokenType,
    handleStartGeneration, handleRegenerateAll,
  };
}
