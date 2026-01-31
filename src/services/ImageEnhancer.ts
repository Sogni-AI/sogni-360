/**
 * Image Enhancer Service
 *
 * Enhances images using Z-Image Turbo.
 *
 * Supports two modes:
 * 1. Frontend SDK mode: When user is logged in via frontend SDK, jobs go directly
 *    to Sogni without proxying through the backend (faster, uses user's wallet)
 * 2. Backend proxy mode: Falls back to backend API when in demo mode
 */

import { api } from './api';
import { isFrontendMode, getSogniClient } from './frontend';
import type { GenerationProgressEvent } from '../types';
import { fetchS3AsBlob } from '../utils/s3FetchWithFallback';

export interface EnhanceImageOptions {
  imageUrl: string;
  width: number;
  height: number;
  tokenType?: 'spark' | 'sogni';
  prompt?: string;
  onProgress?: (progress: number) => void;
  onComplete?: (imageUrl: string) => void;
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
 * Enhance using frontend SDK directly (no backend proxy)
 */
async function enhanceWithFrontendSDK(options: EnhanceImageOptions): Promise<string | null> {
  const {
    imageUrl,
    width,
    height,
    tokenType = 'spark',
    prompt = '(Extra detailed and contrasty portrait) Portrait masterpiece',
    onProgress,
    onComplete,
    onError
  } = options;

  const client = getSogniClient();
  if (!client) {
    throw new Error('Frontend SDK client not available');
  }

  console.log(`[Enhancer-SDK] Enhancing image at ${width}x${height}`);

  // Convert source image to blob
  const imageBlob = await imageUrlToBlob(imageUrl);

  // Create project options matching backend implementation
  const projectOptions = {
    type: 'image' as const,
    modelId: 'z_image_turbo_bf16',
    positivePrompt: prompt,
    negativePrompt: '',
    stylePrompt: '',
    sizePreset: 'custom' as const,
    width: width,
    height: height,
    steps: 6,
    guidance: 3.5,
    numberOfMedia: 1,
    numberOfPreviews: 5,
    sampler: 'euler' as const,
    scheduler: 'simple' as const,
    disableNSFWFilter: true,
    outputFormat: 'jpg' as const,
    tokenType: tokenType,
    startingImage: imageBlob,
    startingImageStrength: 0.75
  };

  // Create project
  const project = await client.projects.create(projectOptions);
  console.log(`[Enhancer-SDK] Project created: ${project.id}`);

  return new Promise((resolve) => {
    let projectFinished = false;
    let resultUrl: string | null = null;
    const sentJobCompletions = new Set<string>();

    // Job event handler for progress
    const jobHandler = (event: any) => {
      if (event.projectId !== project.id) return;

      console.log(`[Enhancer-SDK] Event:`, event.type);

      switch (event.type) {
        case 'progress':
          if (event.step && event.stepCount) {
            const progress = (event.step / event.stepCount) * 100;
            onProgress?.(progress);
          }
          break;

        case 'completed':
        case 'jobCompleted':
          if (event.jobId && !sentJobCompletions.has(event.jobId) && event.resultUrl) {
            sentJobCompletions.add(event.jobId);
            resultUrl = event.resultUrl;
            console.log(`[Enhancer-SDK] Job completed with URL:`, resultUrl);
            if (resultUrl) {
              onComplete?.(resultUrl);
            }
          }
          break;
      }
    };

    // Register job handler
    client.projects.on('job', jobHandler);

    // Handle project completion
    project.on('completed', (imageUrls: string[]) => {
      console.log(`[Enhancer-SDK] Project completed, images:`, imageUrls?.length);
      if (projectFinished) return;
      projectFinished = true;

      client.projects.off('job', jobHandler);

      if (!resultUrl && imageUrls && imageUrls.length > 0) {
        resultUrl = imageUrls[0];
        onComplete?.(resultUrl);
      }

      if (!resultUrl) {
        console.error(`[Enhancer-SDK] Completed but no result URL!`);
        onError?.(new Error('Enhancement completed but no image URL received'));
      }

      resolve(resultUrl);
    });

    // Handle project failure
    project.on('failed', (errorData: { message?: string; code?: number }) => {
      const errorMessage = errorData?.message || 'Enhancement failed';
      console.error(`[Enhancer-SDK] Project failed:`, errorMessage, 'code:', errorData?.code);
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
        onError?.(new Error('Enhancement timeout after 10 minutes'));
        resolve(null);
      }
    }, 10 * 60 * 1000);
  });
}

/**
 * Enhance using backend API (proxy mode)
 */
async function enhanceWithBackendAPI(options: EnhanceImageOptions): Promise<string | null> {
  const {
    imageUrl,
    width,
    height,
    tokenType = 'spark',
    prompt,
    onProgress,
    onComplete,
    onError
  } = options;

  // Start enhancement via backend
  const { projectId } = await api.enhanceImage({
    sourceImage: imageUrl,
    width,
    height,
    tokenType,
    prompt
  });

  console.log(`[Enhancer-API] Subscribing to progress for project ${projectId}`);

  return new Promise((resolve) => {
    let resultUrl: string | null = null;

    const unsubscribe = api.subscribeToProgress(
      projectId,
      (event: GenerationProgressEvent) => {
        console.log(`[Enhancer-API] Event:`, event.type);

        switch (event.type) {
          case 'connected':
            console.log(`[Enhancer-API] SSE connected`);
            break;

          case 'progress':
            if (event.progress !== undefined) {
              const progressPct = event.progress * 100;
              onProgress?.(progressPct);
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
            if (!resultUrl && event.imageUrls && event.imageUrls.length > 0) {
              resultUrl = event.imageUrls[0];
              onComplete?.(resultUrl);
            }
            unsubscribe();
            if (!resultUrl) {
              onError?.(new Error('Enhancement completed but no image URL received'));
            }
            resolve(resultUrl);
            break;

          case 'error':
            // Backend sends error message in 'message' field, not 'error'
            const errorMessage = event.message || event.error || 'Enhancement failed';
            console.error(`[Enhancer-API] Error:`, errorMessage);
            unsubscribe();
            onError?.(new Error(errorMessage));
            resolve(null);
            break;
        }
      },
      (error) => {
        console.error(`[Enhancer-API] SSE error:`, error);
        onError?.(error);
        resolve(null);
      }
    );
  });
}

/**
 * Enhance a single image using Z-Image Turbo.
 * Automatically routes to frontend SDK or backend API based on auth mode.
 */
export async function enhanceImage(options: EnhanceImageOptions): Promise<string | null> {
  const useFrontendSDK = isFrontendMode();

  console.log(`[Enhancer] Mode: ${useFrontendSDK ? 'Frontend SDK (direct)' : 'Backend API (proxy)'}`);

  try {
    if (useFrontendSDK) {
      return await enhanceWithFrontendSDK(options);
    } else {
      return await enhanceWithBackendAPI(options);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Enhancement failed');
    options.onError?.(err);
    return null;
  }
}

export default {
  enhanceImage
};
