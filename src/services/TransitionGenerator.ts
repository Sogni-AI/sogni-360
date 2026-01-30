/**
 * Transition Generator Service
 *
 * Generates video transitions between camera angle images.
 * Uses the backend API for video generation via SSE progress tracking.
 * All transitions are submitted in parallel to leverage dePIN network concurrency.
 */

import { api } from './api';
import type { Segment, GenerationProgressEvent, TransitionVersion } from '../types';
import {
  VIDEO_QUALITY_PRESETS,
  calculateVideoFrames,
  calculateVideoDimensions,
  DEFAULT_VIDEO_SETTINGS,
  VideoQualityPreset,
  VideoResolution
} from '../constants/videoSettings';
import { v4 as uuidv4 } from 'uuid';

// Retry configuration
// No delay needed between retries - each request goes to a different worker in the dePIN network
const MAX_ATTEMPTS = 3;

/**
 * Check if an error is non-retryable (e.g., insufficient credits)
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('insufficient') ||
    message.includes('credits') ||
    message.includes('balance') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  );
}

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
    resolution = DEFAULT_VIDEO_SETTINGS.resolution,
    quality = 'fast',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,  // Default to 1024 for square images
    sourceHeight = 1024,
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
 *
 * All transitions are submitted to the dePIN network simultaneously for maximum
 * throughput. The network handles load balancing across available workers.
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
  }
): Promise<Map<string, string | null>> {
  const {
    prompt,
    negativePrompt = '',
    resolution = DEFAULT_VIDEO_SETTINGS.resolution,
    quality = 'fast',
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,  // Default to 1024 for square images
    sourceHeight = 1024,
    onSegmentStart,
    onSegmentProgress,
    onSegmentComplete,
    onSegmentError,
    onAllComplete
  } = options;

  const results = new Map<string, string | null>();

  // Process a single segment with automatic retry logic
  const processSegment = async (segment: Segment): Promise<void> => {
    onSegmentStart?.(segment.id);

    const fromImageUrl = waypointImages.get(segment.fromWaypointId);
    const toImageUrl = waypointImages.get(segment.toWaypointId);

    if (!fromImageUrl || !toImageUrl) {
      const error = new Error('Missing waypoint images');
      results.set(segment.id, null);
      onSegmentError?.(segment.id, error);
      return;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[TransitionGenerator] Segment ${segment.id} attempt ${attempt}/${MAX_ATTEMPTS}`);

        // Reset progress on retry attempts
        if (attempt > 1) {
          onSegmentProgress?.(segment.id, 0);
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
            // Don't call onSegmentError here - we'll handle it after all retries
            lastError = error;
          }
        });

        if (videoUrl) {
          // Success!
          results.set(segment.id, videoUrl);
          if (attempt > 1) {
            console.log(`[TransitionGenerator] Segment ${segment.id} succeeded on attempt ${attempt}`);
          }
          return;
        }

        // If we got null but no error, treat it as a failure
        if (!lastError) {
          lastError = new Error('Generation returned no video');
        }
        throw lastError;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-retryable errors (like insufficient credits)
        if (isNonRetryableError(lastError)) {
          console.error(`[TransitionGenerator] Segment ${segment.id} failed with non-retryable error:`, lastError.message);
          break;
        }

        // If we have more attempts, retry immediately (no delay - different worker each time)
        if (attempt < MAX_ATTEMPTS) {
          console.warn(
            `[TransitionGenerator] Segment ${segment.id} attempt ${attempt} failed: ${lastError.message}. ` +
            `Retrying immediately...`
          );
        } else {
          console.error(
            `[TransitionGenerator] Segment ${segment.id} failed after ${MAX_ATTEMPTS} attempts:`,
            lastError.message
          );
        }
      }
    }

    // All attempts failed
    results.set(segment.id, null);
    if (lastError) {
      onSegmentError?.(segment.id, lastError);
    }
  };

  // Fire ALL requests simultaneously - the dePIN network handles concurrency
  console.log(`[TransitionGenerator] Starting ${segments.length} transition generations in parallel`);
  await Promise.all(segments.map(processSegment));

  onAllComplete?.();

  return results;
}

export default {
  generateTransition,
  generateMultipleTransitions
};
