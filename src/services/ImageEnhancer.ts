/**
 * Image Enhancer Service
 *
 * Enhances images using Z-Image Turbo via the backend API.
 * Used to improve the quality of generated camera angle images.
 */

import { api } from './api';
import type { GenerationProgressEvent } from '../types';

export interface EnhanceImageOptions {
  imageUrl: string;
  width: number;
  height: number;
  tokenType?: 'spark' | 'sogni';
  prompt?: string; // Custom enhancement prompt
  onProgress?: (progress: number) => void;
  onComplete?: (imageUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Enhance a single image using Z-Image Turbo
 */
export async function enhanceImage(options: EnhanceImageOptions): Promise<string | null> {
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

  try {
    // Start enhancement
    const { projectId } = await api.enhanceImage({
      sourceImage: imageUrl,
      width,
      height,
      tokenType,
      prompt
    });

    // Subscribe to progress events
    console.log(`[Enhancer] Subscribing to progress for project ${projectId}`);
    return new Promise((resolve) => {
      let resultUrl: string | null = null;

      const unsubscribe = api.subscribeToProgress(
        projectId,
        (event: GenerationProgressEvent) => {
          console.log(`[Enhancer] Event:`, event.type, event);

          switch (event.type) {
            case 'connected':
              console.log(`[Enhancer] SSE connected`);
              break;

            case 'progress':
              if (event.progress !== undefined) {
                const progressPct = event.progress * 100;
                console.log(`[Enhancer] Progress: ${progressPct.toFixed(0)}%`);
                onProgress?.(progressPct);
              }
              break;

            case 'jobCompleted':
              console.log(`[Enhancer] Job completed, resultUrl:`, event.resultUrl);
              if (event.resultUrl) {
                resultUrl = event.resultUrl;
                onComplete?.(resultUrl);
              }
              break;

            case 'completed':
              if (event.resultUrl && !resultUrl) {
                resultUrl = event.resultUrl;
                console.log(`[Enhancer] Got resultUrl from completed event:`, resultUrl);
                onComplete?.(resultUrl);
              }
              if (!resultUrl && event.imageUrls && event.imageUrls.length > 0) {
                resultUrl = event.imageUrls[0];
                console.log(`[Enhancer] Got resultUrl from imageUrls array:`, resultUrl);
                onComplete?.(resultUrl);
              }
              console.log(`[Enhancer] Project completed, resultUrl:`, resultUrl);
              unsubscribe();
              if (!resultUrl) {
                console.error(`[Enhancer] Completed but no resultUrl! Event data:`, event);
                onError?.(new Error('Enhancement completed but no image URL received'));
              }
              resolve(resultUrl);
              break;

            case 'error':
              console.error(`[Enhancer] Error:`, event.error);
              unsubscribe();
              const error = new Error(event.error || 'Enhancement failed');
              onError?.(error);
              resolve(null);
              break;

            default:
              console.log(`[Enhancer] Unhandled event type: ${event.type}`);
          }
        },
        (error) => {
          console.error(`[Enhancer] SSE error:`, error);
          onError?.(error);
          resolve(null);
        }
      );
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Enhancement failed');
    onError?.(err);
    return null;
  }
}

export default {
  enhanceImage
};
