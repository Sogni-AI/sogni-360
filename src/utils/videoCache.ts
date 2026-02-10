/**
 * Video Cache
 *
 * IndexedDB-based storage for caching stitched videos.
 * Persists videos across page refreshes so users don't need to re-stitch.
 */

import type { MusicSelection } from '../types';

const DB_NAME = 'sogni360-video-cache';
const DB_VERSION = 3; // Bumped to invalidate broken stitched videos from cf84773
const STORE_NAME = 'videos';

/**
 * Generate a fingerprint string from music selection for cache validation.
 * Returns null if no music, otherwise a string combining key properties.
 */
export function getMusicFingerprint(music: MusicSelection | null | undefined): string | null {
  if (!music) return null;

  // For presets: use presetId or presetUrl
  // For uploads: use file name + size (file object won't persist, but name/size help identify)
  const identifier = music.type === 'preset'
    ? (music.presetId || music.presetUrl || 'preset')
    : (music.file ? `upload:${music.file.name}:${music.file.size}` : 'upload:unknown');

  // Include trimming info since same music with different trim = different output
  return `${music.type}|${identifier}|${music.startOffset}|${music.duration}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the IndexedDB database for video caching
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[VideoCache] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Delete existing store on version upgrade to purge stale/broken cached videos
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    };
  });

  return dbPromise;
}

interface CachedVideo {
  projectId: string;
  blob: Blob;
  createdAt: number;
  videoUrls?: string[]; // URLs used to create this stitched video
  musicFingerprint?: string | null; // Fingerprint of music used (null = no music)
}

/**
 * Save a stitched video blob to the cache
 * @param projectId - The project ID
 * @param blob - The video blob to cache
 * @param videoUrls - The source video URLs used to create this video
 * @param musicFingerprint - Fingerprint of music used (null = no music, undefined = don't track)
 */
export async function saveStitchedVideo(
  projectId: string,
  blob: Blob,
  videoUrls?: string[],
  musicFingerprint?: string | null
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const cachedVideo: CachedVideo = {
      projectId,
      blob,
      createdAt: Date.now(),
      videoUrls,
      musicFingerprint
    };

    const request = store.put(cachedVideo);

    request.onerror = () => {
      console.error('[VideoCache] Failed to save video:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const musicInfo = musicFingerprint ? ' (with music)' : ' (no music)';
      console.log('[VideoCache] Saved video for project:', projectId + musicInfo);
      resolve();
    };
  });
}

/**
 * Check if two arrays of URLs are equal
 */
function urlsMatch(urls1: string[] | undefined, urls2: string[] | undefined): boolean {
  if (!urls1 || !urls2) return false;
  if (urls1.length !== urls2.length) return false;
  return urls1.every((url, i) => url === urls2[i]);
}

/**
 * Load a cached stitched video blob
 * @param projectId - The project ID
 * @param currentVideoUrls - If provided, validates the cached video was created from these URLs
 * @param currentMusicFingerprint - If provided, validates the cached video has matching music
 */
export async function loadStitchedVideo(
  projectId: string,
  currentVideoUrls?: string[],
  currentMusicFingerprint?: string | null
): Promise<Blob | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(projectId);

    request.onerror = () => {
      console.error('[VideoCache] Failed to load video:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const result = request.result as CachedVideo | undefined;
      if (!result?.blob) {
        resolve(null);
        return;
      }

      // If currentVideoUrls provided, validate they match
      if (currentVideoUrls) {
        // If cached video doesn't have videoUrls stored (old cache), invalidate it
        if (!result.videoUrls) {
          console.log('[VideoCache] Cache invalidated: old cache without URL tracking');
          resolve(null);
          return;
        }
        if (!urlsMatch(currentVideoUrls, result.videoUrls)) {
          console.log('[VideoCache] Cache invalidated: video URLs have changed');
          resolve(null);
          return;
        }
      }

      // Validate music fingerprint matches (if tracking is enabled)
      // currentMusicFingerprint === undefined means "don't check music"
      // currentMusicFingerprint === null means "expect no music"
      // currentMusicFingerprint === "string" means "expect this specific music"
      if (currentMusicFingerprint !== undefined) {
        const cachedFingerprint = result.musicFingerprint;
        // Old cache entries won't have musicFingerprint - invalidate them
        if (cachedFingerprint === undefined) {
          console.log('[VideoCache] Cache invalidated: old cache without music tracking');
          resolve(null);
          return;
        }
        if (cachedFingerprint !== currentMusicFingerprint) {
          console.log('[VideoCache] Cache invalidated: music selection changed');
          resolve(null);
          return;
        }
      }

      const musicInfo = result.musicFingerprint ? ' (with music)' : ' (no music)';
      console.log('[VideoCache] Loaded cached video for project:', projectId + musicInfo);
      resolve(result.blob);
    };
  });
}

/**
 * Delete a cached video for a project
 */
export async function deleteStitchedVideo(projectId: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(projectId);

    request.onerror = () => {
      console.error('[VideoCache] Failed to delete video:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[VideoCache] Deleted video for project:', projectId);
      resolve();
    };
  });
}

/**
 * Clear all cached videos
 */
export async function clearVideoCache(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => {
      console.error('[VideoCache] Failed to clear cache:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[VideoCache] Cleared all cached videos');
      resolve();
    };
  });
}

/**
 * Get the total size of cached videos (for debugging/monitoring)
 */
export async function getCacheSize(): Promise<{ count: number; totalBytes: number }> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    let count = 0;
    let totalBytes = 0;

    request.onerror = () => {
      console.error('[VideoCache] Failed to get cache size:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const video = cursor.value as CachedVideo;
        count++;
        totalBytes += video.blob.size;
        cursor.continue();
      } else {
        resolve({ count, totalBytes });
      }
    };
  });
}
