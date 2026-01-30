/**
 * Hook for estimating image generation costs
 *
 * Uses the backend API to get cost estimates via the Sogni SDK's estimateCost method.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import {
  CAMERA_ANGLE_MODEL,
  CAMERA_ANGLE_DEFAULTS
} from '../constants/cameraAngleSettings';

interface ImageCostEstimationParams {
  /** Number of images to generate (default: 1) */
  imageCount?: number;
  /** Whether estimation is enabled */
  enabled?: boolean;
  /** Token type for pricing */
  tokenType?: 'spark' | 'sogni';
}

interface ImageCostEstimationResult {
  loading: boolean;
  cost: number | null;
  costInUSD: number | null;
  error: Error | null;
  formattedCost: string;
  formattedUSD: string;
  refetch: () => void;
}

/**
 * Hook to estimate image generation cost before submitting
 */
export function useImageCostEstimation(params: ImageCostEstimationParams): ImageCostEstimationResult {
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [costInUSD, setCostInUSD] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const lastParamsRef = useRef<string>('');

  const {
    imageCount = 1,
    enabled = true,
    tokenType = 'spark'
  } = params;

  const fetchCost = useCallback(async () => {
    if (!enabled || imageCount <= 0) {
      setCost(null);
      setCostInUSD(null);
      setError(null);
      setLoading(false);
      lastParamsRef.current = '';
      return;
    }

    const paramsHash = JSON.stringify({
      tokenType,
      model: CAMERA_ANGLE_MODEL,
      imageCount,
      stepCount: CAMERA_ANGLE_DEFAULTS.steps,
      enabled
    });

    if (paramsHash === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = paramsHash;

    setLoading(true);
    setError(null);

    try {
      const result = await api.estimateCost({
        model: CAMERA_ANGLE_MODEL,
        imageCount,
        stepCount: CAMERA_ANGLE_DEFAULTS.steps,
        tokenType
      });

      // Result contains token (spark/sogni amount) and usd cost from SDK
      if (result) {
        // Extract token cost
        if (result.token !== undefined && result.token !== null) {
          const tokenCost = typeof result.token === 'string' ? parseFloat(result.token) : result.token;
          if (!isNaN(tokenCost)) {
            setCost(tokenCost);
          } else {
            setCost(null);
          }
        } else {
          setCost(null);
        }

        // Extract USD cost from API response
        if (result.usd !== undefined && result.usd !== null) {
          const usdCost = typeof result.usd === 'string' ? parseFloat(result.usd) : result.usd;
          if (!isNaN(usdCost)) {
            setCostInUSD(usdCost);
          } else {
            setCostInUSD(null);
          }
        } else {
          setCostInUSD(null);
        }
      } else {
        setCost(null);
        setCostInUSD(null);
      }

      setLoading(false);
    } catch (err) {
      console.warn('[ImageCostEstimation] Cost estimation failed:', err);
      setError(err as Error);
      setCost(null);
      setCostInUSD(null);
      setLoading(false);
    }
  }, [enabled, imageCount, tokenType]);

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

export default useImageCostEstimation;
