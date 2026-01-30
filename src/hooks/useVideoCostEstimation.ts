/**
 * Hook for estimating video generation costs
 *
 * Uses the Sogni video job estimate REST endpoint to get cost estimates
 * before starting video generation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  VIDEO_QUALITY_PRESETS,
  VIDEO_CONFIG,
  calculateVideoDimensions,
  calculateVideoFrames,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';

interface VideoCostEstimationParams {
  /** Width of the source image */
  imageWidth?: number;
  /** Height of the source image */
  imageHeight?: number;
  /** Video resolution preset */
  resolution?: VideoResolution;
  /** Video quality preset */
  quality?: VideoQualityPreset;
  /** Video duration in seconds */
  duration?: number;
  /** Frames per second (default: 16) */
  fps?: number;
  /** Whether estimation is enabled */
  enabled?: boolean;
  /** Number of jobs to request (for batch estimation) */
  jobCount?: number;
  /** Token type for pricing */
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

/**
 * Get video job cost estimate from the Sogni API
 */
async function fetchVideoCostEstimate(
  tokenType: string,
  modelId: string,
  width: number,
  height: number,
  frames: number,
  fps: number,
  steps: number,
  jobCount: number = 1
): Promise<VideoEstimateResponse> {
  const url = `https://socket.sogni.ai/api/v1/job-video/estimate/${tokenType}/${encodeURIComponent(modelId)}/${width}/${height}/${frames}/${fps}/${steps}/${jobCount}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get video cost estimate: ${response.statusText}`);
  }

  return response.json() as Promise<VideoEstimateResponse>;
}

/**
 * Hook to estimate video generation cost before submitting
 */
export function useVideoCostEstimation(params: VideoCostEstimationParams): VideoCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const lastParamsRef = useRef<string>('');

  const {
    imageWidth,
    imageHeight,
    resolution = '720p',
    quality = 'fast',
    duration = VIDEO_CONFIG.defaultDuration,
    fps = VIDEO_CONFIG.defaultFps,
    enabled = true,
    jobCount = 1,
    tokenType = 'spark'
  } = params;

  const frames = calculateVideoFrames(duration);

  const fetchCost = useCallback(async () => {
    if (!enabled || !imageWidth || !imageHeight) {
      setCost(null);
      setCostInUSD(null);
      setError(null);
      setLoading(false);
      lastParamsRef.current = '';
      return;
    }

    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    if (!qualityConfig) {
      setError(new Error(`Invalid quality preset: ${quality}`));
      setLoading(false);
      return;
    }

    const dimensions = calculateVideoDimensions(imageWidth, imageHeight, resolution);

    const paramsHash = JSON.stringify({
      tokenType,
      modelId: qualityConfig.model,
      width: dimensions.width,
      height: dimensions.height,
      frames,
      fps,
      steps: qualityConfig.steps,
      jobCount,
      enabled
    });

    if (paramsHash === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = paramsHash;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchVideoCostEstimate(
        tokenType,
        qualityConfig.model,
        dimensions.width,
        dimensions.height,
        frames,
        fps,
        qualityConfig.steps,
        jobCount
      );

      if (result?.quote?.project) {
        const project = result.quote.project;

        const tokenCostRaw = tokenType === 'spark'
          ? project.costInSpark
          : project.costInSogni;

        const tokenCost = typeof tokenCostRaw === 'string'
          ? parseFloat(tokenCostRaw)
          : tokenCostRaw;

        if (tokenCost !== undefined && !isNaN(tokenCost)) {
          setCost(tokenCost);
        } else {
          setCost(null);
        }

        const usdCostRaw = project.costInUSD;
        const usdCost = typeof usdCostRaw === 'string'
          ? parseFloat(usdCostRaw)
          : usdCostRaw;

        if (usdCost !== undefined && !isNaN(usdCost)) {
          setCostInUSD(usdCost);
        } else {
          setCostInUSD(null);
        }
      } else {
        setCost(null);
        setCostInUSD(null);
      }

      setLoading(false);
    } catch (err) {
      console.warn('[VideoCostEstimation] Cost estimation failed:', err);
      setError(err as Error);
      setCost(null);
      setCostInUSD(null);
      setLoading(false);
    }
  }, [enabled, imageWidth, imageHeight, resolution, quality, frames, fps, tokenType, jobCount]);

  useEffect(() => {
    void fetchCost();
  }, [fetchCost]);

  const formattedCost = cost !== null ? cost.toFixed(2) : '—';
  const formattedUSD = costInUSD !== null ? `$${costInUSD.toFixed(2)}` : '—';

  const refetch = () => {
    lastParamsRef.current = '';
    void fetchCost();
  };

  return {
    loading,
    cost,
    costInUSD,
    error,
    formattedCost,
    formattedUSD,
    refetch
  };
}

export default useVideoCostEstimation;
