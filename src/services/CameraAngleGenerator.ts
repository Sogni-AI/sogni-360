/**
 * Camera Angle Generator Service
 *
 * Generates images from different camera angles using the Multiple Angles LoRA.
 * Simplified version for Sogni 360 that uses the backend API.
 */

import { api } from './api';
import type { Waypoint, GenerationProgressEvent } from '../types';
import { CAMERA_ANGLE_LORA } from '../constants/cameraAngleSettings';
import { getAdvancedSettings } from '../hooks/useAdvancedSettings';

// Retry configuration
// No delay needed between retries - each request goes to a different worker in the dePIN network
const MAX_ATTEMPTS = 3;

/**
 * Check if an error is an insufficient funds error
 */
function isInsufficientFundsError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('insufficient') ||
    message.includes('debit error') ||
    (message.includes('funds') && !message.includes('refund'))
  );
}

/**
 * Check if an error is non-retryable (e.g., insufficient credits)
 */
function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    isInsufficientFundsError(error) ||
    message.includes('credits') ||
    message.includes('balance') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  );
}

export interface GenerateAngleResult {
  imageUrl: string;
  sdkProjectId?: string;
  sdkJobId?: string;
}

export interface GenerateAngleOptions {
  sourceImageUrl: string;
  waypoint: Waypoint;
  imageWidth: number;
  imageHeight: number;
  tokenType?: 'spark' | 'sogni';
  loraStrength?: number;
  onProgress?: (progress: number, workerName?: string) => void;
  onComplete?: (result: GenerateAngleResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Generates an image from a different camera angle using the backend API
 */
export async function generateCameraAngle(options: GenerateAngleOptions): Promise<GenerateAngleResult | null> {
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
    // Get current image quality settings
    const advancedSettings = getAdvancedSettings();
    console.log(`[Generator] Using image settings: model=${advancedSettings.imageModel}, steps=${advancedSettings.imageSteps}, guidance=${advancedSettings.imageGuidance}`);

    // Start generation
    const { projectId } = await api.generateAngle({
      contextImage: sourceImageUrl,
      azimuth: waypoint.azimuth,
      elevation: waypoint.elevation,
      distance: waypoint.distance,
      width: imageWidth,
      height: imageHeight,
      tokenType,
      loraStrength,
      // Pass image quality settings
      imageModel: advancedSettings.imageModel,
      imageSteps: advancedSettings.imageSteps,
      imageGuidance: advancedSettings.imageGuidance
    });

    // Subscribe to progress events
    console.log(`[Generator] Subscribing to progress for project ${projectId}, waypoint ${waypoint.id}`);
    return new Promise((resolve) => {
      let result: GenerateAngleResult | null = null;

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
                result = {
                  imageUrl: event.resultUrl,
                  sdkProjectId: event.sdkProjectId,
                  sdkJobId: event.sdkJobId
                };
                onComplete?.(result);
              } else {
                console.warn(`[Generator] jobCompleted but no resultUrl for waypoint ${waypoint.id}`);
              }
              break;

            case 'completed':
              // Check if resultUrl is in the completed event itself (backend may send it here)
              if (event.resultUrl && !result) {
                result = {
                  imageUrl: event.resultUrl,
                  sdkProjectId: event.sdkProjectId,
                  sdkJobId: event.sdkJobId
                };
                console.log(`[Generator] Got resultUrl from completed event for waypoint ${waypoint.id}:`, result.imageUrl);
                onComplete?.(result);
              }
              // Also check for imageUrls array (backend sends this for project completion)
              if (!result && event.imageUrls && event.imageUrls.length > 0) {
                result = {
                  imageUrl: event.imageUrls[0],
                  sdkProjectId: event.sdkProjectId,
                  sdkJobId: event.sdkJobId
                };
                console.log(`[Generator] Got resultUrl from imageUrls array for waypoint ${waypoint.id}:`, result.imageUrl);
                onComplete?.(result);
              }
              console.log(`[Generator] Project completed for waypoint ${waypoint.id}, resultUrl:`, result?.imageUrl);
              unsubscribe();
              if (!result) {
                console.error(`[Generator] Completed but no resultUrl! Event data:`, event);
                onError?.(new Error('Generation completed but no image URL received'));
              }
              resolve(result);
              break;

            case 'error':
              // Backend sends error message in 'message' field, not 'error'
              const errorMessage = event.message || event.error || 'Generation failed';
              console.error(`[Generator] Error for waypoint ${waypoint.id}:`, errorMessage);
              unsubscribe();
              const error = new Error(errorMessage);
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
    onWaypointComplete?: (waypointId: string, result: GenerateAngleResult) => void;
    onWaypointError?: (waypointId: string, error: Error) => void;
    onOutOfCredits?: () => void;
    onAllComplete?: () => void;
  } = {}
): Promise<Map<string, GenerateAngleResult | null>> {
  const {
    tokenType = 'spark',
    loraStrength,
    onWaypointStart,
    onWaypointProgress,
    onWaypointComplete,
    onWaypointError,
    onOutOfCredits,
    onAllComplete
  } = options;

  // Track if we've already called onOutOfCredits to avoid multiple popups
  let hasCalledOutOfCredits = false;

  const results = new Map<string, GenerateAngleResult | null>();

  // Process a single waypoint with automatic retry logic
  const processWaypoint = async (waypoint: Waypoint): Promise<void> => {
    onWaypointStart?.(waypoint.id);

    // If this is an "original" waypoint, use the source image directly
    if (waypoint.isOriginal) {
      console.log(`[Generator] Waypoint ${waypoint.id} is original, using source image`);
      const result: GenerateAngleResult = { imageUrl: sourceImageUrl };
      results.set(waypoint.id, result);
      onWaypointProgress?.(waypoint.id, 100);
      onWaypointComplete?.(waypoint.id, result);
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

        const result = await generateCameraAngle({
          sourceImageUrl,
          waypoint,
          imageWidth,
          imageHeight,
          tokenType,
          loraStrength,
          onProgress: (progress) => {
            onWaypointProgress?.(waypoint.id, progress);
          },
          onComplete: (r) => {
            onWaypointComplete?.(waypoint.id, r);
          },
          onError: (error) => {
            // Don't call onWaypointError here - we'll handle it after all retries
            lastError = error;
          }
        });

        if (result) {
          // Success!
          results.set(waypoint.id, result);
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

          // Call onOutOfCredits callback if this is an insufficient funds error
          if (isInsufficientFundsError(lastError) && !hasCalledOutOfCredits) {
            hasCalledOutOfCredits = true;
            onOutOfCredits?.();
          }
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
      // Provide user-friendly error message for insufficient funds
      const userFriendlyError = isInsufficientFundsError(lastError)
        ? new Error('Insufficient credits')
        : lastError;
      onWaypointError?.(waypoint.id, userFriendlyError);
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
