/**
 * Transition Generator Service
 *
 * Generates video transitions between camera angle images.
 *
 * Supports two modes:
 * 1. Frontend SDK mode: When user is logged in via frontend SDK, jobs go directly
 *    to Sogni without proxying through the backend (faster, uses user's wallet)
 * 2. Backend proxy mode: Falls back to backend API when in demo mode
 */

import { api } from './api';
import { isFrontendMode, getSogniClient } from './frontend';
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
import { fetchS3AsBlob } from '../utils/s3FetchWithFallback';
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

export interface GenerateTransitionResult {
  videoUrl: string;
  sdkProjectId?: string;
  sdkJobId?: string;
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
  onComplete?: (result: GenerateTransitionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Convert image URL to Blob for SDK (InputMedia type)
 * For S3 URLs, uses fetchS3AsBlob which handles CORS fallback automatically
 */
async function imageUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
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
    const binaryString = atob(url);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }
}

/**
 * Generate transition using frontend SDK directly (no backend proxy)
 */
async function generateWithFrontendSDK(
  options: GenerateTransitionOptions
): Promise<GenerateTransitionResult | null> {
  // Get default negative prompt from advanced settings
  const advancedSettings = getAdvancedSettings();

  const {
    segment,
    fromImageUrl,
    toImageUrl,
    prompt,
    negativePrompt = advancedSettings.videoNegativePrompt,
    resolution = DEFAULT_VIDEO_SETTINGS.resolution,
    quality = DEFAULT_VIDEO_SETTINGS.quality,
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,
    sourceHeight = 1024,
    onProgress,
    onComplete,
    onError
  } = options;

  const client = getSogniClient();
  if (!client) {
    throw new Error('Frontend SDK client not available');
  }

  // Get quality config
  const qualityConfig = VIDEO_QUALITY_PRESETS[quality];

  // Calculate video dimensions preserving aspect ratio
  const videoDimensions = calculateVideoDimensions(sourceWidth, sourceHeight, resolution);

  // Calculate frames at 16fps base rate (worker interpolates to target fps)
  const frames = calculateVideoFrames(duration);

  console.log(`[TransitionGenerator-SDK] Video: ${videoDimensions.width}x${videoDimensions.height}`);
  console.log(`[TransitionGenerator-SDK] Frames: ${frames} (at 16fps base rate)`);
  console.log(`[TransitionGenerator-SDK] Output FPS: ${DEFAULT_VIDEO_SETTINGS.fps} (worker will interpolate from 16fps to ${DEFAULT_VIDEO_SETTINGS.fps}fps)`);

  // Convert images to blobs
  const [fromBlob, toBlob] = await Promise.all([
    imageUrlToBlob(fromImageUrl),
    imageUrlToBlob(toImageUrl)
  ]);

  // Create project options matching backend implementation
  // Use shift and guidance values from quality config (model-specific optimal values)
  const projectOptions = {
    type: 'video' as const,
    modelId: qualityConfig.model,
    positivePrompt: prompt,
    negativePrompt: negativePrompt,
    stylePrompt: '', // Required by SDK
    sizePreset: 'custom' as const,
    width: videoDimensions.width,
    height: videoDimensions.height,
    steps: qualityConfig.steps,
    shift: qualityConfig.shift,
    guidance: qualityConfig.guidance,
    frames: frames,
    fps: DEFAULT_VIDEO_SETTINGS.fps, // Output video FPS (32fps for smooth playback)
    numberOfMedia: 1,
    numberOfPreviews: 3,
    sampler: 'euler' as const,
    scheduler: 'simple' as const,
    disableNSFWFilter: true,
    outputFormat: 'mp4' as const,
    tokenType: tokenType,
    referenceImage: fromBlob,
    referenceImageEnd: toBlob
  };

  // Log full project options for debugging (mask binary data)
  console.log('[TransitionGenerator-SDK] Full project options:', JSON.stringify({
    ...projectOptions,
    referenceImage: `[Blob ${fromBlob.size} bytes]`,
    referenceImageEnd: `[Blob ${toBlob.size} bytes]`
  }, null, 2));

  // Create project
  const project = await client.projects.create(projectOptions);
  console.log(`[TransitionGenerator-SDK] Project created: ${project.id}`);

  return new Promise((resolve) => {
    let projectFinished = false;
    let result: GenerateTransitionResult | null = null;
    const sentJobCompletions = new Set<string>();

    // Job event handler for progress
    const jobHandler = (event: any) => {
      if (event.projectId !== project.id) return;

      console.log(`[TransitionGenerator-SDK] Event for segment ${segment.id}:`, event.type);

      switch (event.type) {
        case 'started':
        case 'initiating':
          break;

        case 'progress':
          if (event.step && event.stepCount) {
            const progress = (event.step / event.stepCount) * 100;
            onProgress?.(progress, event.workerName || 'Worker');
          }
          break;

        case 'completed':
        case 'jobCompleted':
          if (event.jobId && !sentJobCompletions.has(event.jobId) && event.resultUrl) {
            sentJobCompletions.add(event.jobId);
            result = {
              videoUrl: event.resultUrl,
              sdkProjectId: event.projectId,
              sdkJobId: event.jobId
            };
            console.log(`[TransitionGenerator-SDK] Job completed with URL:`, result.videoUrl);
            onComplete?.(result);
          }
          break;
      }
    };

    // Register job handler
    client.projects.on('job', jobHandler);

    // Handle project completion
    project.on('completed', (videoUrls: string[]) => {
      console.log(`[TransitionGenerator-SDK] Project completed, videos:`, videoUrls?.length);
      if (projectFinished) return;
      projectFinished = true;

      client.projects.off('job', jobHandler);

      if (!result && videoUrls && videoUrls.length > 0) {
        result = {
          videoUrl: videoUrls[0],
          sdkProjectId: project.id
        };
        onComplete?.(result);
      }

      if (!result) {
        console.error(`[TransitionGenerator-SDK] Completed but no result URL!`);
        onError?.(new Error('Generation completed but no video URL received'));
      }

      resolve(result);
    });

    // Handle project failure
    project.on('failed', (errorData: { message?: string; code?: number }) => {
      const errorMessage = errorData?.message || 'Generation failed';
      console.error(`[TransitionGenerator-SDK] Project failed:`, errorMessage, 'code:', errorData?.code);
      if (projectFinished) return;
      projectFinished = true;

      client.projects.off('job', jobHandler);
      onError?.(new Error(errorMessage));
      resolve(null);
    });

    // Timeout after 15 minutes (video generation takes longer)
    setTimeout(() => {
      if (!projectFinished) {
        projectFinished = true;
        client.projects.off('job', jobHandler);
        onError?.(new Error('Video project timeout after 15 minutes'));
        resolve(null);
      }
    }, 15 * 60 * 1000);
  });
}

/**
 * Generate transition using backend API (proxy mode)
 */
async function generateWithBackendAPI(
  options: GenerateTransitionOptions
): Promise<GenerateTransitionResult | null> {
  // Get default negative prompt from advanced settings
  const advancedSettings = getAdvancedSettings();

  const {
    segment,
    fromImageUrl,
    toImageUrl,
    prompt,
    negativePrompt = advancedSettings.videoNegativePrompt,
    resolution = DEFAULT_VIDEO_SETTINGS.resolution,
    quality = DEFAULT_VIDEO_SETTINGS.quality,
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,
    sourceHeight = 1024,
    onProgress,
    onComplete,
    onError
  } = options;

  // Get quality config
  const qualityConfig = VIDEO_QUALITY_PRESETS[quality];

  // Calculate video dimensions preserving aspect ratio
  const videoDimensions = calculateVideoDimensions(sourceWidth, sourceHeight, resolution);

  // Calculate frames at 16fps base rate (worker interpolates to target fps)
  const frames = calculateVideoFrames(duration);

  console.log(`[TransitionGenerator-API] Video: ${videoDimensions.width}x${videoDimensions.height}`);
  console.log(`[TransitionGenerator-API] Frames: ${frames} (at 16fps base rate)`);
  console.log(`[TransitionGenerator-API] Output FPS: ${DEFAULT_VIDEO_SETTINGS.fps} (worker will interpolate from 16fps to ${DEFAULT_VIDEO_SETTINGS.fps}fps)`);

  // Start generation via API
  // Pass shift and guidance from quality config (model-specific optimal values)
  const { projectId } = await api.generateTransition({
    referenceImage: fromImageUrl,
    referenceImageEnd: toImageUrl,
    prompt,
    negativePrompt,
    width: videoDimensions.width,
    height: videoDimensions.height,
    frames,
    fps: DEFAULT_VIDEO_SETTINGS.fps, // Output video FPS (32fps for smooth playback)
    steps: qualityConfig.steps,
    shift: qualityConfig.shift,
    guidance: qualityConfig.guidance,
    model: qualityConfig.model,
    tokenType
  });

  console.log(`[TransitionGenerator-API] Started project ${projectId} for segment ${segment.id}`);

  // Subscribe to progress events
  return new Promise((resolve) => {
    let result: GenerateTransitionResult | null = null;

    const unsubscribe = api.subscribeToProgress(
      projectId,
      (event: GenerationProgressEvent) => {
        console.log(`[TransitionGenerator-API] Event for segment ${segment.id}:`, event.type);

        switch (event.type) {
          case 'connected':
            console.log(`[TransitionGenerator-API] SSE connected for segment ${segment.id}`);
            break;

          case 'progress':
            if (event.progress !== undefined) {
              const progressPct = event.progress * 100;
              onProgress?.(progressPct, event.workerName);
            }
            break;

          case 'jobCompleted':
            if (event.resultUrl) {
              result = {
                videoUrl: event.resultUrl,
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            break;

          case 'completed':
            if (event.resultUrl && !result) {
              result = {
                videoUrl: event.resultUrl,
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            if (!result && event.imageUrls && event.imageUrls.length > 0) {
              result = {
                videoUrl: event.imageUrls[0],
                sdkProjectId: event.sdkProjectId,
                sdkJobId: event.sdkJobId
              };
              onComplete?.(result);
            }
            unsubscribe();
            if (!result) {
              onError?.(new Error('Generation completed but no video URL received'));
            }
            resolve(result);
            break;

          case 'error':
            // Backend sends error message in 'message' field, not 'error'
            const errorMessage = event.message || event.error || 'Generation failed';
            console.error(`[TransitionGenerator-API] Error for segment ${segment.id}:`, errorMessage);
            unsubscribe();
            onError?.(new Error(errorMessage));
            resolve(null);
            break;
        }
      },
      (error) => {
        console.error(`[TransitionGenerator-API] SSE error for segment ${segment.id}:`, error);
        onError?.(error);
        resolve(null);
      }
    );
  });
}

/**
 * Generate a single video transition between two images.
 * Automatically routes to frontend SDK or backend API based on auth mode.
 */
export async function generateTransition(options: GenerateTransitionOptions): Promise<GenerateTransitionResult | null> {
  const useFrontendSDK = isFrontendMode();

  console.log(`[TransitionGenerator] Mode: ${useFrontendSDK ? 'Frontend SDK (direct)' : 'Backend API (proxy)'}`);

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
    onSegmentComplete?: (segmentId: string, result: GenerateTransitionResult, version: TransitionVersion) => void;
    onSegmentError?: (segmentId: string, error: Error) => void;
    onOutOfCredits?: () => void;
    onAllComplete?: () => void;
  }
): Promise<Map<string, GenerateTransitionResult | null>> {
  // Get default negative prompt from advanced settings
  const advancedSettings = getAdvancedSettings();

  const {
    prompt,
    negativePrompt = advancedSettings.videoNegativePrompt,
    resolution = DEFAULT_VIDEO_SETTINGS.resolution,
    quality = DEFAULT_VIDEO_SETTINGS.quality,
    duration = 1.5,
    tokenType = 'spark',
    sourceWidth = 1024,
    sourceHeight = 1024,
    onSegmentStart,
    onSegmentProgress,
    onSegmentComplete,
    onSegmentError,
    onOutOfCredits,
    onAllComplete
  } = options;

  // Log which mode we're using
  const useFrontendSDK = isFrontendMode();
  console.log(`[TransitionGenerator] Starting ${segments.length} transition generations using ${useFrontendSDK ? 'Frontend SDK (direct to Sogni)' : 'Backend API (proxy)'}`);

  // Track if we've already called onOutOfCredits to avoid multiple popups
  let hasCalledOutOfCredits = false;

  const results = new Map<string, GenerateTransitionResult | null>();

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

        const result = await generateTransition({
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
          onComplete: (r) => {
            const version: TransitionVersion = {
              id: uuidv4(),
              videoUrl: r.videoUrl,
              createdAt: Date.now(),
              isSelected: true,
              sdkProjectId: r.sdkProjectId,
              sdkJobId: r.sdkJobId
            };
            onSegmentComplete?.(segment.id, r, version);
          },
          onError: (error) => {
            // Don't call onSegmentError here - we'll handle it after all retries
            lastError = error;
          }
        });

        if (result) {
          // Success!
          results.set(segment.id, result);
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
      // Provide user-friendly error message for insufficient funds
      const userFriendlyError = isInsufficientFundsError(lastError)
        ? new Error('Insufficient credits')
        : lastError;
      onSegmentError?.(segment.id, userFriendlyError);
    }
  };

  // Fire ALL requests simultaneously - the dePIN network handles concurrency
  await Promise.all(segments.map(processSegment));

  onAllComplete?.();

  return results;
}

export default {
  generateTransition,
  generateMultipleTransitions
};
