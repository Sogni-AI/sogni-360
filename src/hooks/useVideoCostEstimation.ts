/**
 * Hook for estimating video generation costs
 *
 * Uses the Sogni video job estimate REST endpoint to get cost estimates
 * before starting video generation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DEFAULT_VIDEO_SETTINGS,
  getVideoQualityConfig,
  getVideoModelConfig,
  calculateVideoDimensions,
  calculateVideoFrames,
  type VideoQualityPreset,
  type VideoResolution,
  type VideoModelFamily
} from '../constants/videoSettings';
import { getAdvancedSettings } from './useAdvancedSettings';

interface VideoCostEstimationParams {
  imageWidth?: number;
  imageHeight?: number;
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  duration?: number;
  fps?: number;
  enabled?: boolean;
  jobCount?: number;
  tokenType?: 'spark' | 'sogni';
}

interface VideoCostEstimationResult {
  loading: boolean;
  cost: number | null;
  costInUSD: number | null;
  error: Error | null;
  formattedCost: string;
  formattedUSD: string;
  refetch: () => void;
}

interface VideoEstimateResponse {
  quote: {
    project: {
      costInSpark?: number | string;
      costInSogni?: number | string;
      costInUSD?: number | string;
    };
  };
}

export function useVideoCostEstimation(params: VideoCostEstimationParams): VideoCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const lastParamsRef = useRef<string>('');
  const fetchIdRef = useRef(0); // Guard against stale fetch responses

  const {
    imageWidth,
    imageHeight,
    resolution = '720p',
    quality = DEFAULT_VIDEO_SETTINGS.quality,
    duration = DEFAULT_VIDEO_SETTINGS.duration,
    fps: fpsProp,
    enabled = true,
    jobCount = 1,
    tokenType = 'spark'
  } = params;

  // Model-family-aware calculation — all derived in the same render
  const modelFamily: VideoModelFamily = getAdvancedSettings().videoModel;
  const modelConfig = getVideoModelConfig(modelFamily);
  const fps = fpsProp ?? modelConfig.fps;
  const frames = calculateVideoFrames(duration, modelFamily);

  const fetchCost = useCallback(async () => {
    if (!enabled || !imageWidth || !imageHeight) {
      setCost(null);
      setCostInUSD(null);
      setError(null);
      setLoading(false);
      lastParamsRef.current = '';
      return;
    }

    const qualityConfig = getVideoQualityConfig(quality, modelFamily);
    if (!qualityConfig) {
      setError(new Error(`Invalid quality preset: ${quality}`));
      setLoading(false);
      return;
    }

    const dimensions = calculateVideoDimensions(imageWidth, imageHeight, resolution, modelFamily);

    const paramsHash = JSON.stringify({
      tokenType, modelFamily,
      modelId: qualityConfig.model,
      width: dimensions.width, height: dimensions.height,
      frames, fps,
      steps: qualityConfig.steps,
      jobCount, enabled
    });

    if (paramsHash === lastParamsRef.current) return;
    lastParamsRef.current = paramsHash;

    // Increment fetch ID so stale responses are ignored
    const currentFetchId = ++fetchIdRef.current;

    setLoading(true);
    setError(null);

    const url = `https://socket.sogni.ai/api/v1/job-video/estimate/${tokenType}/${encodeURIComponent(qualityConfig.model)}/${dimensions.width}/${dimensions.height}/${frames}/${fps}/${qualityConfig.steps}/${jobCount}`;
    console.log(`[VideoCostEstimation] ${modelFamily} → ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      // Ignore result if a newer fetch has been started
      if (currentFetchId !== fetchIdRef.current) return;

      const result = (await response.json()) as VideoEstimateResponse;

      if (result?.quote?.project) {
        const project = result.quote.project;
        const tokenCostRaw = tokenType === 'spark' ? project.costInSpark : project.costInSogni;
        const tokenCost = typeof tokenCostRaw === 'string' ? parseFloat(tokenCostRaw) : tokenCostRaw;
        setCost(tokenCost !== undefined && !isNaN(tokenCost) ? tokenCost : null);

        const usdCostRaw = project.costInUSD;
        const usdCost = typeof usdCostRaw === 'string' ? parseFloat(usdCostRaw) : usdCostRaw;
        setCostInUSD(usdCost !== undefined && !isNaN(usdCost) ? usdCost : null);
      } else {
        setCost(null);
        setCostInUSD(null);
      }
      setLoading(false);
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.warn('[VideoCostEstimation] Failed:', err);
      setError(err as Error);
      setCost(null);
      setCostInUSD(null);
      setLoading(false);
    }
  }, [enabled, imageWidth, imageHeight, resolution, quality, frames, fps, tokenType, jobCount, modelFamily]);

  useEffect(() => {
    void fetchCost();
  }, [fetchCost]);

  const formattedCost = cost !== null ? cost.toFixed(2) : '—';
  const formattedUSD = costInUSD !== null ? `$${costInUSD.toFixed(2)}` : '—';

  const refetch = () => {
    lastParamsRef.current = '';
    void fetchCost();
  };

  return { loading, cost, costInUSD, error, formattedCost, formattedUSD, refetch };
}

export default useVideoCostEstimation;
