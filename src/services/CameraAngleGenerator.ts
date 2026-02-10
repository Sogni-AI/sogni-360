/**
 * Camera Angle Generator Service
 *
 * Generates images from different camera angles using the Multiple Angles LoRA.
 *
 * Supports two modes:
 * 1. Frontend SDK mode: When user is logged in via frontend SDK, jobs go directly
 *    to Sogni without proxying through the backend (faster, uses user's wallet)
 * 2. Backend proxy mode: Falls back to backend API when in demo mode
 */

import { api } from './api';
import { isFrontendMode, getSogniClient } from './frontend';
import type { Waypoint, GenerationProgressEvent } from '../types';
import {
  CAMERA_ANGLE_LORA,
  buildCameraAnglePrompt,
  getModelSamplerScheduler,
} from '../constants/cameraAngleSettings';
import { getAdvancedSettings } from '../hooks/useAdvancedSettings';
import { fetchS3AsBlob } from '../utils/s3FetchWithFallback';

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
 * Convert image URL to Blob for SDK (InputMedia type)
 * For S3 URLs, uses fetchS3AsBlob which handles CORS fallback automatically
 */
async function imageUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    // Data URL - extract base64 and convert
    const [header, base64Data] = url.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } else if (url.startsWith('http')) {
    // Use S3 fetch with automatic CORS fallback for HTTP URLs
    return fetchS3AsBlob(url);
  } else if (url.startsWith('blob:')) {
    // Blob URLs can be fetched directly
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    return response.blob();
  } else {
    // Assume base64 string (default to jpeg)
    const binaryString = atob(url);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }
}

/**
 * Generate using frontend SDK directly (no backend proxy)
 */
async function generateWithFrontendSDK(
  options: GenerateAngleOptions
): Promise<GenerateAngleResult | null> {
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

  const client = getSogniClient();
  if (!client) {
    throw new Error('Frontend SDK client not available');
  }

  // Get current image quality settings
  const advancedSettings = getAdvancedSettings();
  console.log(`[Generator-SDK] Using image settings: model=${advancedSettings.imageModel}, steps=${advancedSettings.imageSteps}, guidance=${advancedSettings.imageGuidance}, format=${advancedSettings.outputFormat}`);

  // Build the camera angle prompt
  const prompt = buildCameraAnglePrompt(
    waypoint.azimuth,
    waypoint.elevation,
    waypoint.distance
  );
  console.log(`[Generator-SDK] Prompt: ${prompt}`);

  // Convert source image to blob (SDK expects InputMedia: File | Buffer | Blob)
  const contextImageBlob = await imageUrlToBlob(sourceImageUrl);

  // Get model-specific sampler/scheduler (standard model uses dpmpp_2m/beta to reduce moire)
  const { sampler, scheduler } = getModelSamplerScheduler(advancedSettings.imageModel);

  // Create project options matching backend implementation
  const projectOptions = {
    type: 'image' as const,
    modelId: advancedSettings.imageModel,
    positivePrompt: prompt,
    negativePrompt: '',
    stylePrompt: '', // Required by SDK
    sizePreset: 'custom' as const,
    width: imageWidth,
    height: imageHeight,
    steps: advancedSettings.imageSteps,
    guidance: advancedSettings.imageGuidance,
    numberOfMedia: 1,
    numberOfPreviews: 5,
    sampler,
    scheduler,
    disableNSFWFilter: true,
    outputFormat: advancedSettings.outputFormat as 'jpg' | 'png',
    tokenType: tokenType,
    contextImages: [contextImageBlob],
    loras: [...CAMERA_ANGLE_LORA.loras],
    loraStrengths: [loraStrength]
  };

  // Create project
  const project = await client.projects.create(projectOptions);
  console.log(`[Generator-SDK] Project created: ${project.id}`);

  return new Promise((resolve) => {
    let projectFinished = false;
    let result: GenerateAngleResult | null = null;
    const sentJobCompletions = new Set<string>();
    let cachedWorkerName: string | undefined; // Cache worker name from started/initiating

    // Job event handler for progress
    const jobHandler = (event: any) => {
      if (event.projectId !== project.id) return;

      console.log(`[Generator-SDK] Event for waypoint ${waypoint.id}:`, event.type);

      switch (event.type) {
        case 'started':
        case 'initiating':
          if (event.workerName) cachedWorkerName = event.workerName;
          onProgress?.(0, cachedWorkerName);
          break;

        case 'progress':
          if (event.step && event.stepCount) {
            const progress = (event.step / event.stepCount) * 100;
            onProgress?.(progress, cachedWorkerName);
          }
          break;

        case 'completed':
        case 'jobCompleted':
          if (event.jobId && !sentJobCompletions.has(event.jobId) && event.resultUrl) {
            sentJobCompletions.add(event.jobId);
            result = {
              imageUrl: event.resultUrl,
              sdkProjectId: event.projectId,
              sdkJobId: event.jobId
            };
            console.log(`[Generator-SDK] Job completed with URL:`, result.imageUrl);
            onComplete?.(result);
          }
          break;
      }
    };

    // Register job handler
    client.projects.on('job', jobHandler);

    // Handle project completion
    project.on('completed', (imageUrls: string[]) => {
      console.log(`[Generator-SDK] Project completed, images:`, imageUrls?.length);
      if (projectFinished) return;
      projectFinished = true;

      client.projects.off('job', jobHandler);

      if (!result && imageUrls && imageUrls.length > 0) {
        result = {
          imageUrl: imageUrls[0],
          sdkProjectId: project.id
        };
        onComplete?.(result);
      }

      if (!result) {
        console.error(`[Generator-SDK] Completed but no result URL!`);
        onError?.(new Error('Generation completed but no image URL received'));
      }

      resolve(result);
    });

    // Handle project failure
    project.on('failed', (errorData: { message?: string; code?: number }) => {
      const errorMessage = errorData?.message || 'Generation failed';
      console.error(`[Generator-SDK] Project failed:`, errorMessage, 'code:', errorData?.code);
      if (projectFinished) return;
      projectFinished = true;

      client.projects.off('job', jobHandler);
      onError?.(new Error(errorMessage));
      resolve(null);
    });

    // Timeout after 10 minutes
    setTimeout(() => {
      if (!projectFinished) {
        projectFinished = true;
        client.projects.off('job', jobHandler);
        onError?.(new Error('Project timeout after 10 minutes'));
        resolve(null);
      }
    }, 10 * 60 * 1000);
  });
}

/**
 * Generate using backend API (proxy mode)
 */
async function generateWithBackendAPI(
  options: GenerateAngleOptions
): Promise<GenerateAngleResult | null> {
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

  // Get current image quality settings
  const advancedSettings = getAdvancedSettings();
  console.log(`[Generator-API] Using image settings: model=${advancedSettings.imageModel}, steps=${advancedSettings.imageSteps}, guidance=${advancedSettings.imageGuidance}, format=${advancedSettings.outputFormat}`);

  // Start generation via backend
  const { projectId } = await api.generateAngle({
    contextImage: sourceImageUrl,
    azimuth: waypoint.azimuth,
    elevation: waypoint.elevation,
    distance: waypoint.distance,
    width: imageWidth,
    height: imageHeight,
    tokenType,
    loraStrength,
    imageModel: advancedSettings.imageModel,
    imageSteps: advancedSettings.imageSteps,
    imageGuidance: advancedSettings.imageGuidance,
    outputFormat: advancedSettings.outputFormat
  });

  // Subscribe to progress events via SSE
  console.log(`[Generator-API] Subscribing to progress for project ${projectId}`);
  return new Promise((resolve) => {
    let result: GenerateAngleResult | null = null;
    let cachedWorkerName: string | undefined; // Cache worker name from started/initiating

    const unsubscribe = api.subscribeToProgress(
      projectId,
      (event: GenerationProgressEvent) => {
        console.log(`[Generator-API] Event for waypoint ${waypoint.id}:`, event.type);

        switch (event.type) {
          case 'connected':
            console.log(`[Generator-API] SSE connected for waypoint ${waypoint.id}`);
            break;

          case 'started':
          case 'initiating':
            if (event.workerName) cachedWorkerName = event.workerName;
            onProgress?.(0, cachedWorkerName);
            break;

          case 'progress':
            if (event.progress !== undefined) {
              if (event.workerName) cachedWorkerName = event.workerName;
              const progressPct = event.progress * 100;
              onProgress?.(progressPct, cachedWorkerName);
            }
            break;

          case 'jobCompleted':
            if (event.resultUrl) {
              result = {
                imageUrl: event.resultUrl,
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            break;

          case 'completed':
            if (event.resultUrl && !result) {
              result = {
                imageUrl: event.resultUrl,
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            if (!result && event.imageUrls && event.imageUrls.length > 0) {
              result = {
                imageUrl: event.imageUrls[0],
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            unsubscribe();
            if (!result) {
              onError?.(new Error('Generation completed but no image URL received'));
            }
            resolve(result);
            break;

          case 'error':
            const errorMessage = event.message || event.error || 'Generation failed';
            console.error(`[Generator-API] Error for waypoint ${waypoint.id}:`, errorMessage);
            unsubscribe();
            onError?.(new Error(errorMessage));
            resolve(null);
            break;
        }
      },
      (error) => {
        console.error(`[Generator-API] SSE error for waypoint ${waypoint.id}:`, error);
        onError?.(error);
        resolve(null);
      }
    );
  });
}

/**
 * Generates an image from a different camera angle.
 * Automatically routes to frontend SDK or backend API based on auth mode.
 */
export async function generateCameraAngle(options: GenerateAngleOptions): Promise<GenerateAngleResult | null> {
  const useFrontendSDK = isFrontendMode();

  console.log(`[Generator] Mode: ${useFrontendSDK ? 'Frontend SDK (direct)' : 'Backend API (proxy)'}`);

  try {
    if (useFrontendSDK) {
      return await generateWithFrontendSDK(options);
    } else {
      return await generateWithBackendAPI(options);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Generation failed');
    options.onError?.(err);
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
    onWaypointProgress?: (waypointId: string, progress: number, workerName?: string) => void;
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

  // Log which mode we're using
  const useFrontendSDK = isFrontendMode();
  console.log(`[Generator] Starting ${waypoints.length} angle generations using ${useFrontendSDK ? 'Frontend SDK (direct to Sogni)' : 'Backend API (proxy)'}`);

  // Track if we've already called onOutOfCredits to avoid multiple popups
  let hasCalledOutOfCredits = false;

  const results = new Map<string, GenerateAngleResult | null>();

  // Process a single waypoint with automatic retry logic
  const processWaypoint = async (waypoint: Waypoint): Promise<void> => {
    onWaypointStart?.(waypoint.id);

    // If this is an "original" waypoint, use its own imageUrl (could be a custom uploaded image)
    // Only fall back to sourceImageUrl if no custom image was set
    if (waypoint.isOriginal) {
      const imageUrl = waypoint.imageUrl || sourceImageUrl;
      console.log(`[Generator] Waypoint ${waypoint.id} is original, using ${waypoint.imageUrl ? 'custom uploaded image' : 'source image'}`);
      const result: GenerateAngleResult = { imageUrl };
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
          onProgress: (progress, workerName) => {
            onWaypointProgress?.(waypoint.id, progress, workerName);
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
  await Promise.all(waypoints.map(processWaypoint));

  onAllComplete?.();

  return results;
}

export default {
  generateCameraAngle,
  generateMultipleAngles
};
