/**
 * Video Blob Cache
 *
 * Shared cache for preloaded video blob URLs.
 * Used by both useTransitionNavigation (preloading) and TransitionVideoCard (display).
 *
 * This cache ensures that:
 * 1. Videos are fetched once and reused everywhere
 * 2. Data URLs are converted to blob URLs for reliable <video> playback
 * 3. S3 URLs are fetched while still valid and cached as blob URLs
 */

import { API_URL } from '../config/urls';

// Cache for preloaded video blob URLs (module-level singleton)
// Keys are original URLs (data URLs, S3 URLs, etc.)
// Values are blob URLs created from URL.createObjectURL()
const videoBlobCache = new Map<string, string>();

// Track URLs currently being fetched to avoid duplicate requests
const videoFetchInProgress = new Set<string>();

// Track URLs that permanently failed (e.g., expired S3 URLs)
const videoFetchFailed = new Set<string>();

/**
 * Check if a URL is already cached
 */
export function hasCachedBlobUrl(originalUrl: string): boolean {
  return videoBlobCache.has(originalUrl);
}

/**
 * Get cached blob URL for an original URL
 */
export function getCachedBlobUrl(originalUrl: string): string | undefined {
  return videoBlobCache.get(originalUrl);
}

/**
 * Check if URL fetch is in progress
 */
export function isFetchInProgress(originalUrl: string): boolean {
  return videoFetchInProgress.has(originalUrl);
}

/**
 * Check if URL fetch has permanently failed
 */
export function hasFetchFailed(originalUrl: string): boolean {
  return videoFetchFailed.has(originalUrl);
}

/**
 * Check if a URL is a data URL
 */
function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Check if a URL is an S3 URL
 */
function isS3Url(url: string): boolean {
  const s3Patterns = [
    's3.amazonaws.com',
    's3-accelerate.amazonaws.com',
    'complete-images-production',
    'complete-images-staging'
  ];
  return s3Patterns.some(pattern => url.includes(pattern));
}

/**
 * Get proxied URL for S3 resources
 */
function getProxiedUrl(url: string): string {
  return `${API_URL}/api/sogni/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Preload a video URL and cache as blob URL
 * Returns the blob URL on success, or undefined on failure
 */
export async function preloadVideo(originalUrl: string): Promise<string | undefined> {
  // Already cached
  if (videoBlobCache.has(originalUrl)) {
    return videoBlobCache.get(originalUrl);
  }

  // Already failed
  if (videoFetchFailed.has(originalUrl)) {
    return undefined;
  }

  // Already in progress - wait for it
  if (videoFetchInProgress.has(originalUrl)) {
    // Simple polling wait (could be improved with proper promise sharing)
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (videoBlobCache.has(originalUrl)) {
        return videoBlobCache.get(originalUrl);
      }
      if (videoFetchFailed.has(originalUrl)) {
        return undefined;
      }
      if (!videoFetchInProgress.has(originalUrl)) {
        break;
      }
    }
    return videoBlobCache.get(originalUrl);
  }

  videoFetchInProgress.add(originalUrl);

  try {
    let blob: Blob | null = null;

    // Handle data URLs - convert directly to blob
    if (isDataUrl(originalUrl)) {
      const response = await fetch(originalUrl);
      if (response.ok) {
        blob = await response.blob();
      }
    }
    // Handle S3 URLs - try direct, then proxy
    else if (isS3Url(originalUrl)) {
      try {
        const response = await fetch(originalUrl);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch {
        // Direct fetch failed, try proxy
      }

      if (!blob) {
        try {
          const proxyUrl = getProxiedUrl(originalUrl);
          const proxyResponse = await fetch(proxyUrl, { credentials: 'include' });
          if (proxyResponse.ok) {
            blob = await proxyResponse.blob();
          }
        } catch {
          // Proxy also failed
        }
      }
    }
    // Handle other URLs (blob URLs, etc.)
    else {
      try {
        const response = await fetch(originalUrl);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch {
        // Fetch failed
      }
    }

    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      videoBlobCache.set(originalUrl, blobUrl);
      return blobUrl;
    } else {
      videoFetchFailed.add(originalUrl);
      return undefined;
    }
  } catch (error) {
    console.warn('[videoBlobCache] Failed to preload video:', originalUrl, error);
    videoFetchFailed.add(originalUrl);
    return undefined;
  } finally {
    videoFetchInProgress.delete(originalUrl);
  }
}

/**
 * Preload multiple video URLs in parallel
 */
export async function preloadVideos(urls: string[]): Promise<void> {
  await Promise.all(urls.map(url => preloadVideo(url)));
}

/**
 * Clear the cache (useful for cleanup)
 */
export function clearVideoCache(): void {
  // Revoke all blob URLs to free memory
  for (const blobUrl of videoBlobCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  videoBlobCache.clear();
  videoFetchInProgress.clear();
  videoFetchFailed.clear();
}

/**
 * Get the best URL to use for a video
 * Returns blob URL if cached, otherwise original URL
 */
export function getVideoUrl(originalUrl: string): string {
  return videoBlobCache.get(originalUrl) || originalUrl;
}
