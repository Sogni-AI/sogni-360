/**
 * Video Cache
 *
 * IndexedDB-based storage for caching stitched videos.
 * Persists videos across page refreshes so users don't need to re-stitch.
 */

const DB_NAME = 'sogni360-video-cache';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

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

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

interface CachedVideo {
  projectId: string;
  blob: Blob;
  createdAt: number;
  videoUrls?: string[]; // URLs used to create this stitched video
}

/**
 * Save a stitched video blob to the cache
 */
export async function saveStitchedVideo(projectId: string, blob: Blob, videoUrls?: string[]): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const cachedVideo: CachedVideo = {
      projectId,
      blob,
      createdAt: Date.now(),
      videoUrls
    };

    const request = store.put(cachedVideo);

    request.onerror = () => {
      console.error('[VideoCache] Failed to save video:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[VideoCache] Saved video for project:', projectId);
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
 */
export async function loadStitchedVideo(projectId: string, currentVideoUrls?: string[]): Promise<Blob | null> {
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
