/**
 * Video Blob Cache
 *
 * Shared cache for preloaded video blob URLs with LRU eviction.
 * Used by both useTransitionNavigation (preloading) and TransitionVideoCard (display).
 *
 * This cache ensures that:
 * 1. Videos are fetched once and reused everywhere
 * 2. Data URLs are converted to blob URLs for reliable <video> playback
 * 3. S3 URLs are fetched while still valid and cached as blob URLs
 * 4. Memory is managed via LRU eviction when cache exceeds max size
 */

import { API_URL } from '../config/urls';

// Maximum number of videos to keep in cache (prevents memory issues with many segments)
const MAX_CACHE_SIZE = 8;

// Cache entry with last access time for LRU eviction
interface CacheEntry {
  blobUrl: string;
  lastAccess: number;
}

// Cache for preloaded video blob URLs (module-level singleton)
// Keys are original URLs (data URLs, S3 URLs, etc.)
// Values are cache entries with blob URLs and access times
const videoBlobCache = new Map<string, CacheEntry>();

// Track URLs currently being fetched to avoid duplicate requests
const videoFetchInProgress = new Set<string>();

// Track URLs that permanently failed (e.g., expired S3 URLs)
const videoFetchFailed = new Set<string>();

/**
 * Evict least recently used entries if cache is too large
 */
function evictIfNeeded(): void {
  if (videoBlobCache.size <= MAX_CACHE_SIZE) return;

  // Sort by last access time (oldest first)
  const entries = Array.from(videoBlobCache.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

  // Evict oldest entries until we're at max size
  const toEvict = entries.slice(0, videoBlobCache.size - MAX_CACHE_SIZE);
  for (const [url, entry] of toEvict) {
    URL.revokeObjectURL(entry.blobUrl);
    videoBlobCache.delete(url);
  }
}

/**
 * Check if a URL is already cached
 */
export function hasCachedBlobUrl(originalUrl: string): boolean {
  return videoBlobCache.has(originalUrl);
}

/**
 * Get cached blob URL for an original URL (updates access time for LRU)
 */
export function getCachedBlobUrl(originalUrl: string): string | undefined {
  const entry = videoBlobCache.get(originalUrl);
  if (entry) {
    // Update access time for LRU
    entry.lastAccess = Date.now();
    return entry.blobUrl;
  }
  return undefined;
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
  // Already cached - return and update access time
  const existing = videoBlobCache.get(originalUrl);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing.blobUrl;
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
      const cached = videoBlobCache.get(originalUrl);
      if (cached) {
        cached.lastAccess = Date.now();
        return cached.blobUrl;
      }
      if (videoFetchFailed.has(originalUrl)) {
        return undefined;
      }
      if (!videoFetchInProgress.has(originalUrl)) {
        break;
      }
    }
    const cached = videoBlobCache.get(originalUrl);
    return cached?.blobUrl;
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
      videoBlobCache.set(originalUrl, { blobUrl, lastAccess: Date.now() });
      evictIfNeeded();
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
  for (const entry of videoBlobCache.values()) {
    URL.revokeObjectURL(entry.blobUrl);
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
  const entry = videoBlobCache.get(originalUrl);
  if (entry) {
    entry.lastAccess = Date.now();
    return entry.blobUrl;
  }
  return originalUrl;
}
