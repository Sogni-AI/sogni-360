/**
 * useTransitionRegenerate — Settings resolution, cost estimation, AI analysis,
 * and prompt management for the TransitionRegenerateModal.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  TRANSITION_PROMPT_PRESETS,
  getDefaultTransitionPrompt,
  findPresetByPrompt
} from '../constants/transitionPromptPresets';
import { useVideoCostEstimation } from './useVideoCostEstimation';
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_CONFIG,
  getVideoQualityConfig,
  getVideoModelConfig,
  calculateVideoDimensions,
} from '../constants/videoSettings';
import type { VideoQualityPreset, VideoResolution } from '../constants/videoSettings';
import { getAdvancedSettings } from './useAdvancedSettings';
import { isFrontendMode } from '../services/frontend';
import { analyzeTransition } from '../services/AITransitionAnalyzer';
import { useToast } from '../context/ToastContext';

interface UseTransitionRegenerateParams {
  currentPrompt?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  fromLabel: string;
  toLabel: string;
  imageWidth?: number;
  imageHeight?: number;
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  duration?: number;
  tokenType: 'spark' | 'sogni';
}

export function useTransitionRegenerate(params: UseTransitionRegenerateParams) {
  const { showToast } = useToast();
  const defaultPrompt = getDefaultTransitionPrompt();
  const [prompt, setPrompt] = useState(params.currentPrompt || defaultPrompt);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  // Cancel in-flight AI analysis on unmount
  useEffect(() => {
    return () => { analyzeAbortRef.current?.abort(); };
  }, []);

  // Resolve settings with defaults
  const effectiveResolution = params.resolution || DEFAULT_VIDEO_SETTINGS.resolution;
  const effectiveQuality = params.quality || DEFAULT_VIDEO_SETTINGS.quality;
  const effectiveDuration = params.duration || VIDEO_CONFIG.defaultDuration;
  const modelFamily = getAdvancedSettings().videoModel;
  const modelConfig = getVideoModelConfig(modelFamily);
  const effectiveFps = modelConfig.fps;
  const qualityConfig = getVideoQualityConfig(effectiveQuality, modelFamily);

  const videoDimensions = useMemo(() => {
    if (!params.imageWidth || !params.imageHeight) return null;
    return calculateVideoDimensions(params.imageWidth, params.imageHeight, effectiveResolution, modelFamily);
  }, [params.imageWidth, params.imageHeight, effectiveResolution, modelFamily]);

  const { loading: costLoading, formattedCost, formattedUSD } = useVideoCostEstimation({
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    resolution: params.resolution,
    quality: params.quality,
    duration: params.duration,
    jobCount: 1,
    tokenType: params.tokenType,
    enabled: !!(params.imageWidth && params.imageHeight)
  });

  const selectedPresetId = useMemo(() => {
    const preset = findPresetByPrompt(prompt);
    return preset?.id || 'custom';
  }, [prompt]);

  const handlePresetChange = useCallback((presetId: string) => {
    if (presetId === 'custom') return;
    const preset = TRANSITION_PROMPT_PRESETS.find(p => p.id === presetId);
    if (preset) setPrompt(preset.prompt);
  }, []);

  const handleResetPrompt = useCallback(() => {
    setPrompt(defaultPrompt);
  }, [defaultPrompt]);

  const visiblePresets = TRANSITION_PROMPT_PRESETS;

  const handleExpandWithAI = useCallback(async () => {
    if (!params.fromImageUrl || !params.toImageUrl) return;
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    setIsAnalyzingAI(true);
    try {
      const result = await analyzeTransition({
        fromImageUrl: params.fromImageUrl,
        toImageUrl: params.toImageUrl,
        fromLabel: params.fromLabel,
        toLabel: params.toLabel,
        currentPrompt: prompt,
        videoModel: modelFamily,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setPrompt(result.prompt);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Prompt expansion failed';
      showToast({ message: `AI expansion failed: ${message}`, type: 'error' });
    } finally {
      // Always reset loading state — even on abort, so UI doesn't get stuck
      setIsAnalyzingAI(false);
    }
  }, [params.fromImageUrl, params.toImageUrl, params.fromLabel, params.toLabel, prompt, modelFamily, showToast]);

  const showAIButton = isFrontendMode();

  return {
    prompt, setPrompt, isAnalyzingAI,
    effectiveDuration, effectiveFps, qualityConfig, videoDimensions,
    costLoading, formattedCost, formattedUSD,
    selectedPresetId, handlePresetChange, handleResetPrompt,
    visiblePresets, handleExpandWithAI, showAIButton,
  };
}
