/**
 * Camera Angle Generator Service
 *
 * Generates images from different camera angles using the Multiple Angles LoRA.
 * Simplified version for Sogni 360 that uses the backend API.
 */

import { api } from './api';
import type { Waypoint, GenerationProgressEvent } from '../types';
import { CAMERA_ANGLE_LORA } from '../constants/cameraAngleSettings';

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

export interface GenerateAngleOptions {
  sourceImageUrl: string;
  waypoint: Waypoint;
  imageWidth: number;
  imageHeight: number;
  tokenType?: 'spark' | 'sogni';
  loraStrength?: number;
  onProgress?: (progress: number, workerName?: string) => void;
  onComplete?: (imageUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Generates an image from a different camera angle using the backend API
 */
export async function generateCameraAngle(options: GenerateAngleOptions): Promise<string | null> {
  const {
    sourceImageUrl,
    waypoint,
    imageWidth,
    imageHeight,
    tokenType = 'spark',
    loraStrength = CAMERA_ANGLE_LORA.defaultStrength,
    onProgress,
    onComplete,
    onError
  } = options;

  try {
    // Start generation
    const { projectId } = await api.generateAngle({
      contextImage: sourceImageUrl,
      azimuth: waypoint.azimuth,
      elevation: waypoint.elevation,
      distance: waypoint.distance,
      width: imageWidth,
      height: imageHeight,
      tokenType,
      loraStrength
    });

    // Subscribe to progress events
    console.log(`[Generator] Subscribing to progress for project ${projectId}, waypoint ${waypoint.id}`);
    return new Promise((resolve) => {
      let resultUrl: string | null = null;

      const unsubscribe = api.subscribeToProgress(
        projectId,
        (event: GenerationProgressEvent) => {
          console.log(`[Generator] Event for waypoint ${waypoint.id}:`, event.type, event);

          switch (event.type) {
            case 'connected':
              console.log(`[Generator] SSE connected for waypoint ${waypoint.id}`);
              break;

            case 'progress':
              if (event.progress !== undefined) {
                const progressPct = event.progress * 100;
                console.log(`[Generator] Progress for waypoint ${waypoint.id}: ${progressPct.toFixed(0)}%`);
                onProgress?.(progressPct, event.workerName);
              }
              break;

            case 'jobCompleted':
              console.log(`[Generator] Job completed for waypoint ${waypoint.id}, resultUrl:`, event.resultUrl);
              if (event.resultUrl) {
                resultUrl = event.resultUrl;
                onComplete?.(resultUrl);
              } else {
                console.warn(`[Generator] jobCompleted but no resultUrl for waypoint ${waypoint.id}`);
              }
              break;

            case 'completed':
              // Check if resultUrl is in the completed event itself (backend may send it here)
              if (event.resultUrl && !resultUrl) {
                resultUrl = event.resultUrl;
                console.log(`[Generator] Got resultUrl from completed event for waypoint ${waypoint.id}:`, resultUrl);
                onComplete?.(resultUrl);
              }
              // Also check for imageUrls array (backend sends this for project completion)
              if (!resultUrl && event.imageUrls && event.imageUrls.length > 0) {
                resultUrl = event.imageUrls[0];
                console.log(`[Generator] Got resultUrl from imageUrls array for waypoint ${waypoint.id}:`, resultUrl);
                onComplete?.(resultUrl);
              }
              console.log(`[Generator] Project completed for waypoint ${waypoint.id}, resultUrl:`, resultUrl);
              unsubscribe();
              if (!resultUrl) {
                console.error(`[Generator] Completed but no resultUrl! Event data:`, event);
                onError?.(new Error('Generation completed but no image URL received'));
              }
              resolve(resultUrl);
              break;

            case 'error':
              console.error(`[Generator] Error for waypoint ${waypoint.id}:`, event.error);
              unsubscribe();
              const error = new Error(event.error || 'Generation failed');
              onError?.(error);
              resolve(null);
              break;

            default:
              console.log(`[Generator] Unhandled event type: ${event.type}`);
          }
        },
        (error) => {
          console.error(`[Generator] SSE error for waypoint ${waypoint.id}:`, error);
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
 * Generate multiple camera angles in parallel
 *
 * All angles are submitted to the dePIN network simultaneously for maximum
 * throughput. The network handles load balancing across available workers.
 */
export async function generateMultipleAngles(
  sourceImageUrl: string,
  waypoints: Waypoint[],
  imageWidth: number,
  imageHeight: number,
  options: {
    tokenType?: 'spark' | 'sogni';
    loraStrength?: number;
    onWaypointStart?: (waypointId: string) => void;
    onWaypointProgress?: (waypointId: string, progress: number) => void;
    onWaypointComplete?: (waypointId: string, imageUrl: string) => void;
    onWaypointError?: (waypointId: string, error: Error) => void;
    onAllComplete?: () => void;
  } = {}
): Promise<Map<string, string | null>> {
  const {
    tokenType = 'spark',
    loraStrength,
    onWaypointStart,
    onWaypointProgress,
    onWaypointComplete,
    onWaypointError,
    onAllComplete
  } = options;

  const results = new Map<string, string | null>();

  // Process a single waypoint with automatic retry logic
  const processWaypoint = async (waypoint: Waypoint): Promise<void> => {
    onWaypointStart?.(waypoint.id);

    // If this is an "original" waypoint, use the source image directly
    if (waypoint.isOriginal) {
      console.log(`[Generator] Waypoint ${waypoint.id} is original, using source image`);
      results.set(waypoint.id, sourceImageUrl);
      onWaypointProgress?.(waypoint.id, 100);
      onWaypointComplete?.(waypoint.id, sourceImageUrl);
      return;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Generator] Waypoint ${waypoint.id} attempt ${attempt}/${MAX_ATTEMPTS}`);

        // Reset progress on retry attempts
        if (attempt > 1) {
          onWaypointProgress?.(waypoint.id, 0);
        }

        const imageUrl = await generateCameraAngle({
          sourceImageUrl,
          waypoint,
          imageWidth,
          imageHeight,
          tokenType,
          loraStrength,
          onProgress: (progress) => {
            onWaypointProgress?.(waypoint.id, progress);
          },
          onComplete: (url) => {
            onWaypointComplete?.(waypoint.id, url);
          },
          onError: (error) => {
            // Don't call onWaypointError here - we'll handle it after all retries
            lastError = error;
          }
        });

        if (imageUrl) {
          // Success!
          results.set(waypoint.id, imageUrl);
          if (attempt > 1) {
            console.log(`[Generator] Waypoint ${waypoint.id} succeeded on attempt ${attempt}`);
          }
          return;
        }

        // If we got null but no error, treat it as a failure
        if (!lastError) {
          lastError = new Error('Generation returned no image');
        }
        throw lastError;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-retryable errors (like insufficient credits)
        if (isNonRetryableError(lastError)) {
          console.error(`[Generator] Waypoint ${waypoint.id} failed with non-retryable error:`, lastError.message);
          break;
        }

        // If we have more attempts, retry immediately (no delay - different worker each time)
        if (attempt < MAX_ATTEMPTS) {
          console.warn(
            `[Generator] Waypoint ${waypoint.id} attempt ${attempt} failed: ${lastError.message}. ` +
            `Retrying immediately...`
          );
        } else {
          console.error(
            `[Generator] Waypoint ${waypoint.id} failed after ${MAX_ATTEMPTS} attempts:`,
            lastError.message
          );
        }
      }
    }

    // All attempts failed
    results.set(waypoint.id, null);
    if (lastError) {
      onWaypointError?.(waypoint.id, lastError);
    }
  };

  // Fire ALL requests simultaneously - the dePIN network handles concurrency
  console.log(`[Generator] Starting ${waypoints.length} angle generations in parallel`);
  await Promise.all(waypoints.map(processWaypoint));

  onAllComplete?.();

  return results;
}

export default {
  generateCameraAngle,
  generateMultipleAngles
};
