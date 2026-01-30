/**
 * Transition Generator Service
 *
 * Generates video transitions between camera angle images.
 * Uses the backend API for video generation via SSE progress tracking.
 */

import { api } from './api';
import type { Segment, GenerationProgressEvent, TransitionVersion } from '../types';
import {
  VIDEO_QUALITY_PRESETS,
  calculateVideoFrames,
  calculateVideoDimensions,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';
import { v4 as uuidv4 } from 'uuid';

export interface GenerateTransitionOptions {
  segment: Segment;
  fromImageUrl: string;
  toImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  resolution?: VideoResolution;
  quality?: VideoQualityPreset;
  duration?: number;
  tokenType?: 'spark' | 'sogni';
  sourceWidth?: number;
  sourceHeight?: number;
  onProgress?: (progress: number, workerName?: string) => void;
  onComplete?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Prepare image for sending to backend
 * For data URLs: convert to base64 string
 * For HTTP URLs: pass through (backend will fetch server-side, avoiding CORS)
 */
function prepareImageForBackend(imageUrl: string): string {
  // For HTTP URLs, pass them directly to backend (backend fetches server-side)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // For data URLs, pass them as-is (backend can handle data URLs)
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  // For other formats, assume it's already base64
  return imageUrl;
}

/**
 * Generate a single video transition between two images
 */
export async function generateTransition(options: GenerateTransitionOptions): Promise<string | null> {
  const {
    segment,
    fromImageUrl,
    toImageUrl,
    prompt,
    negativePrompt = '',
    resolution = '480p',
    quality = 'fast',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 480,
    sourceHeight = 640,
    onProgress,
    onComplete,
    onError
  } = options;

  try {
    // Prepare images for backend (URLs passed through, backend fetches server-side)
    const fromImage = prepareImageForBackend(fromImageUrl);
    const toImage = prepareImageForBackend(toImageUrl);

    // Get quality config
    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];

    // Calculate video dimensions preserving aspect ratio
    const videoDimensions = calculateVideoDimensions(sourceWidth, sourceHeight, resolution);

    // Calculate frames from duration
    const frames = calculateVideoFrames(duration);

    console.log(`[TransitionGenerator] Video dimensions: ${videoDimensions.width}x${videoDimensions.height} (source: ${sourceWidth}x${sourceHeight})`);

    // Start generation via API (backend fetches URLs server-side)
    const { projectId } = await api.generateTransition({
      referenceImage: fromImage,
      referenceImageEnd: toImage,
      prompt,
      negativePrompt,
      width: videoDimensions.width,
      height: videoDimensions.height,
      frames,
      steps: qualityConfig.steps,
      model: qualityConfig.model,
      tokenType
    });

    console.log(`[TransitionGenerator] Started project ${projectId} for segment ${segment.id}`);

    // Subscribe to progress events
    return new Promise((resolve) => {
      let resultUrl: string | null = null;

      const unsubscribe = api.subscribeToProgress(
        projectId,
        (event: GenerationProgressEvent) => {
          console.log(`[TransitionGenerator] Event for segment ${segment.id}:`, event.type);

          switch (event.type) {
            case 'connected':
              console.log(`[TransitionGenerator] SSE connected for segment ${segment.id}`);
              break;

            case 'progress':
              if (event.progress !== undefined) {
                const progressPct = event.progress * 100;
                onProgress?.(progressPct, event.workerName);
              }
              break;

            case 'jobCompleted':
              if (event.resultUrl) {
                resultUrl = event.resultUrl;
                onComplete?.(resultUrl);
              }
              break;

            case 'completed':
              if (event.resultUrl && !resultUrl) {
                resultUrl = event.resultUrl;
                onComplete?.(resultUrl);
              }
              // Also check for videoUrls array
              if (!resultUrl && event.imageUrls && event.imageUrls.length > 0) {
                resultUrl = event.imageUrls[0];
                onComplete?.(resultUrl);
              }
              unsubscribe();
              if (!resultUrl) {
                onError?.(new Error('Generation completed but no video URL received'));
              }
              resolve(resultUrl);
              break;

            case 'error':
              console.error(`[TransitionGenerator] Error for segment ${segment.id}:`, event.error);
              unsubscribe();
              const error = new Error(event.error || 'Generation failed');
              onError?.(error);
              resolve(null);
              break;
          }
        },
        (error) => {
          console.error(`[TransitionGenerator] SSE error for segment ${segment.id}:`, error);
          onError?.(error);
          resolve(null);
        }
      );
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Generation failed');
    onError?.(err);
    return null;
  }
}

/**
 * Generate multiple transitions in parallel
 */
export async function generateMultipleTransitions(
  segments: Segment[],
  waypointImages: Map<string, string>, // waypointId -> imageUrl
  options: {
    prompt: string;
    negativePrompt?: string;
    resolution?: VideoResolution;
    quality?: VideoQualityPreset;
    duration?: number;
    tokenType?: 'spark' | 'sogni';
    sourceWidth?: number;
    sourceHeight?: number;
    onSegmentStart?: (segmentId: string) => void;
    onSegmentProgress?: (segmentId: string, progress: number, workerName?: string) => void;
    onSegmentComplete?: (segmentId: string, videoUrl: string, version: TransitionVersion) => void;
    onSegmentError?: (segmentId: string, error: Error) => void;
    onAllComplete?: () => void;
    concurrency?: number;
  }
): Promise<Map<string, string | null>> {
  const {
    prompt,
    negativePrompt = '',
    resolution = '480p',
    quality = 'fast',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 480,
    sourceHeight = 640,
    onSegmentStart,
    onSegmentProgress,
    onSegmentComplete,
    onSegmentError,
    onAllComplete,
    concurrency = 2
  } = options;

  const results = new Map<string, string | null>();
  const pending = [...segments];
  const inFlight = new Set<string>();

  const processNext = async (): Promise<void> => {
    if (pending.length === 0) return;

    const segment = pending.shift()!;
    inFlight.add(segment.id);
    onSegmentStart?.(segment.id);

    const fromImageUrl = waypointImages.get(segment.fromWaypointId);
    const toImageUrl = waypointImages.get(segment.toWaypointId);

    if (!fromImageUrl || !toImageUrl) {
      const error = new Error('Missing waypoint images');
      results.set(segment.id, null);
      inFlight.delete(segment.id);
      onSegmentError?.(segment.id, error);
      if (pending.length > 0) await processNext();
      return;
    }

    const videoUrl = await generateTransition({
      segment,
      fromImageUrl,
      toImageUrl,
      prompt,
      negativePrompt,
      resolution,
      quality,
      duration,
      tokenType,
      sourceWidth,
      sourceHeight,
      onProgress: (progress, workerName) => {
        onSegmentProgress?.(segment.id, progress, workerName);
      },
      onComplete: (url) => {
        const version: TransitionVersion = {
          id: uuidv4(),
          videoUrl: url,
          createdAt: Date.now(),
          isSelected: true
        };
        onSegmentComplete?.(segment.id, url, version);
      },
      onError: (error) => {
        onSegmentError?.(segment.id, error);
      }
    });

    results.set(segment.id, videoUrl);
    inFlight.delete(segment.id);

    if (pending.length > 0) {
      await processNext();
    }
  };

  // Start initial batch
  const initialBatch = Math.min(concurrency, segments.length);
  const promises = [];

  for (let i = 0; i < initialBatch; i++) {
    promises.push(processNext());
  }

  await Promise.all(promises);
  onAllComplete?.();

  return results;
}

export default {
  generateTransition,
  generateMultipleTransitions
};
