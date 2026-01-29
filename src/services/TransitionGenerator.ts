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
  VIDEO_RESOLUTIONS,
  calculateVideoFrames,
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
  onProgress?: (progress: number, workerName?: string) => void;
  onComplete?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Convert an image URL to a Uint8Array buffer
 */
async function fetchImageAsBuffer(imageUrl: string): Promise<Uint8Array> {
  if (imageUrl.startsWith('data:')) {
    const base64Data = imageUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
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
    onProgress,
    onComplete,
    onError
  } = options;

  try {
    // Fetch images as buffers
    const [fromBuffer, toBuffer] = await Promise.all([
      fetchImageAsBuffer(fromImageUrl),
      fetchImageAsBuffer(toImageUrl)
    ]);

    // Get quality config
    const qualityConfig = VIDEO_QUALITY_PRESETS[quality];
    const resolutionConfig = VIDEO_RESOLUTIONS[resolution];

    // Calculate frames from duration
    const frames = calculateVideoFrames(duration);

    // Start generation via API
    const { projectId } = await api.generateTransition({
      referenceImage: fromBuffer,
      referenceImageEnd: toBuffer,
      prompt,
      negativePrompt,
      width: resolutionConfig.maxDimension,
      height: resolutionConfig.maxDimension,
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
