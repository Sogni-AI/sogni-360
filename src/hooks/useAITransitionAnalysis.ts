/**
 * useAITransitionAnalysis — Manages the async lifecycle of LLM-based
 * transition prompt analysis, including progress tracking and cancellation.
 */

import { useState, useCallback, useRef } from 'react';
import type { Segment } from '../types';
import {
  analyzeMultipleTransitions,
  type AnalyzeTransitionResult,
} from '../services/AITransitionAnalyzer';
import { getDefaultTransitionPrompt } from '../constants/transitionPromptPresets';

export interface AnalysisProgress {
  completed: number;
  total: number;
}

export function useAITransitionAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({ completed: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Analyze all segments' image pairs via the VLM.
   * Calls onSegmentPromptReady for each segment as its prompt becomes available.
   * Returns after all segments are analyzed (or cancelled).
   */
  const analyzeSegments = useCallback(async (
    segments: Segment[],
    waypointImages: Map<string, string>,
    onSegmentPromptReady: (segmentId: string, prompt: string) => void,
    videoModel?: string,
  ): Promise<boolean> => {
    // Build analysis requests from segments
    const requests = segments
      .map((seg) => {
        const fromImageUrl = waypointImages.get(seg.fromWaypointId);
        const toImageUrl = waypointImages.get(seg.toWaypointId);
        if (!fromImageUrl || !toImageUrl) return null;
        return {
          segmentId: seg.id,
          fromImageUrl,
          toImageUrl,
          videoModel,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (requests.length === 0) return false;

    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setAnalysisProgress({ completed: 0, total: requests.length });

    let completedCount = 0;

    try {
      await analyzeMultipleTransitions(
        requests,
        (segmentId: string, result: AnalyzeTransitionResult) => {
          completedCount++;
          setAnalysisProgress({ completed: completedCount, total: requests.length });
          onSegmentPromptReady(segmentId, result.prompt);
        },
        (segmentId: string, error: Error) => {
          completedCount++;
          setAnalysisProgress({ completed: completedCount, total: requests.length });
          console.warn(`[useAITransitionAnalysis] Segment ${segmentId} analysis failed, using fallback:`, error.message);
          // Deliver the default fallback prompt for failed segments
          onSegmentPromptReady(segmentId, getDefaultTransitionPrompt());
        },
        controller.signal,
      );

      return !controller.signal.aborted;
    } finally {
      setIsAnalyzing(false);
      abortRef.current = null;
    }
  }, []);

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    isAnalyzing,
    analysisProgress,
    analyzeSegments,
    cancelAnalysis,
  };
}
