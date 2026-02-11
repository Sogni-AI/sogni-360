/**
 * Local Projects Database
 *
 * IndexedDB-based storage for Sogni 360 projects.
 * Allows users to save, load, and resume projects locally.
 */

import type { Sogni360Project, LocalProject, Waypoint, Segment, TransitionVersion } from '../types';
import { API_URL } from '../config/urls';

const DB_NAME = 'sogni360-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * Check if URL is a remote URL that needs to be converted to data URL
 * Remote URLs include blob: URLs and S3 URLs (which expire after 24 hours)
 */
function isRemoteUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return false; // Already a data URL
  if (url.startsWith('blob:')) return true;
  // S3 URL patterns
  if (url.includes('s3.amazonaws.com')) return true;
  if (url.includes('s3-accelerate.amazonaws.com')) return true;
  if (url.includes('complete-images-production')) return true;
  if (url.includes('complete-images-staging')) return true;
  return false;
}

/**
 * Check if URL is an S3 URL that needs proxy for CORS
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
 * Get proxied URL for S3 resources to bypass CORS
 */
function getProxiedUrl(url: string): string {
  return `${API_URL}/api/sogni/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Convert any remote URL (blob or S3) to a data URL for persistence
 * Uses proxy for S3 URLs to bypass CORS restrictions
 */
async function remoteUrlToDataUrl(url: string): Promise<string> {
  let response: Response;

  // For S3 URLs, try direct fetch first, fall back to proxy
  if (isS3Url(url)) {
    try {
      response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      // Direct fetch failed (likely CORS), use proxy
      const proxyUrl = getProxiedUrl(url);
      response = await fetch(proxyUrl, { credentials: 'include' });
      if (!response.ok) throw new Error(`Proxy fetch failed: HTTP ${response.status}`);
    }
  } else {
    // For blob URLs, fetch directly
    response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a single URL to data URL if it's remote, with error handling
 */
async function convertUrlIfRemote(url: string | undefined, context: string): Promise<string | undefined> {
  if (!url || !isRemoteUrl(url)) return url;

  try {
    const dataUrl = await remoteUrlToDataUrl(url);
    console.log(`[LocalDB] Converted ${context} to data URL`);
    return dataUrl;
  } catch (error) {
    console.warn(`[LocalDB] Failed to convert ${context}:`, error);
    return undefined;
  }
}

/**
 * Convert an array of URLs to data URLs if they're remote
 */
async function convertUrlArrayIfRemote(urls: string[] | undefined, context: string): Promise<string[] | undefined> {
  if (!urls || urls.length === 0) return urls;

  const converted: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (isRemoteUrl(url)) {
      try {
        const dataUrl = await remoteUrlToDataUrl(url);
        converted.push(dataUrl);
        console.log(`[LocalDB] Converted ${context}[${i}] to data URL`);
      } catch (error) {
        console.warn(`[LocalDB] Failed to convert ${context}[${i}]:`, error);
        // Skip failed conversions
      }
    } else {
      converted.push(url);
    }
  }
  return converted.length > 0 ? converted : undefined;
}

/**
 * Process a waypoint's image URLs, converting remote URLs to data URLs for persistence
 */
async function processWaypointForStorage(waypoint: Waypoint): Promise<Waypoint> {
  const processed = { ...waypoint };

  // Convert main imageUrl
  if (isRemoteUrl(processed.imageUrl || '')) {
    const converted = await convertUrlIfRemote(processed.imageUrl, `waypoint ${waypoint.id} imageUrl`);
    if (converted) {
      processed.imageUrl = converted;
    } else {
      processed.imageUrl = undefined;
      processed.status = 'pending';
    }
  }

  // Convert imageHistory
  processed.imageHistory = await convertUrlArrayIfRemote(
    processed.imageHistory,
    `waypoint ${waypoint.id} imageHistory`
  );

  // Update currentImageIndex if history was truncated
  if (processed.imageHistory && processed.currentImageIndex !== undefined) {
    processed.currentImageIndex = Math.min(processed.currentImageIndex, processed.imageHistory.length - 1);
  }

  // Convert originalImageUrl (for enhancement undo)
  processed.originalImageUrl = await convertUrlIfRemote(
    processed.originalImageUrl,
    `waypoint ${waypoint.id} originalImageUrl`
  );

  // Convert enhancedImageUrl (for enhancement redo)
  processed.enhancedImageUrl = await convertUrlIfRemote(
    processed.enhancedImageUrl,
    `waypoint ${waypoint.id} enhancedImageUrl`
  );

  return processed;
}

/**
 * Process a segment's video URLs, converting remote URLs to data URLs for persistence
 */
async function processSegmentForStorage(segment: Segment): Promise<Segment> {
  const processed = { ...segment };

  // Convert main videoUrl
  if (isRemoteUrl(processed.videoUrl || '')) {
    const converted = await convertUrlIfRemote(processed.videoUrl, `segment ${segment.id} videoUrl`);
    if (converted) {
      processed.videoUrl = converted;
    } else {
      processed.videoUrl = undefined;
      processed.status = 'pending';
    }
  }

  // Convert version URLs
  if (processed.versions && processed.versions.length > 0) {
    const convertedVersions: TransitionVersion[] = [];
    for (let i = 0; i < processed.versions.length; i++) {
      const version = processed.versions[i];
      if (isRemoteUrl(version.videoUrl)) {
        const converted = await convertUrlIfRemote(version.videoUrl, `segment ${segment.id} version[${i}]`);
        if (converted) {
          convertedVersions.push({ ...version, videoUrl: converted });
        }
        // Skip versions that fail to convert
      } else {
        convertedVersions.push(version);
      }
    }
    processed.versions = convertedVersions.length > 0 ? convertedVersions : undefined;

    // Update currentVersionIndex if versions were truncated
    if (processed.versions && processed.currentVersionIndex !== undefined) {
      processed.currentVersionIndex = Math.min(processed.currentVersionIndex, processed.versions.length - 1);
    }
  }

  return processed;
}

// App schema version - INCREMENT THIS when making breaking changes to invalidate saved state
// This is separate from DB_VERSION which is for IndexedDB schema migrations
export const APP_SCHEMA_VERSION = 4;
const SCHEMA_VERSION_KEY = 'sogni360-schema-version';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Save a project to IndexedDB
 * Blob URLs are converted to data URLs so they persist across page reloads
 */
export async function saveProject(project: Sogni360Project): Promise<void> {
  const db = await openDB();

  // Process waypoints to convert remote URLs to data URLs
  const processedWaypoints = await Promise.all(
    project.waypoints.map(wp => processWaypointForStorage(wp))
  );

  // Process segments to convert remote URLs to data URLs
  const processedSegments = await Promise.all(
    project.segments.map(seg => processSegmentForStorage(seg))
  );

  // Convert source image URL if remote
  const processedSourceImageUrl = await convertUrlIfRemote(
    project.sourceImageUrl,
    'sourceImageUrl'
  ) || project.sourceImageUrl;

  // Clear finalLoopUrl blob URLs — the stitched video is too large for data URL conversion
  // and blob URLs may already be GC'd. The stitched video is cached separately in videoCache.ts.
  const processedFinalLoopUrl = project.finalLoopUrl?.startsWith('blob:')
    ? undefined
    : project.finalLoopUrl;

  // Create a clean copy of the project with processed URLs
  const cleanProject: Sogni360Project = {
    ...project,
    sourceImageUrl: processedSourceImageUrl,
    waypoints: processedWaypoints,
    segments: processedSegments,
    finalLoopUrl: processedFinalLoopUrl
  };

  // Get thumbnail URL: prefer a generated angle over the original uploaded image,
  // since generated angles are more representative of the 360 experience.
  // Fallback chain: first generated ready waypoint → first ready waypoint → source image
  const generatedWaypoint = cleanProject.waypoints.find(wp => wp.imageUrl && wp.status === 'ready' && !wp.isOriginal);
  const anyReadyWaypoint = cleanProject.waypoints.find(wp => wp.imageUrl && wp.status === 'ready');
  const thumbnailUrl = generatedWaypoint?.imageUrl || anyReadyWaypoint?.imageUrl || cleanProject.sourceImageUrl;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const localProject: LocalProject = {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: Date.now(),
      thumbnailUrl,
      project: cleanProject
    };

    const request = store.put(localProject);

    request.onerror = () => {
      console.error('Failed to save project:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Sanitize a loaded project by clearing stale blob URLs and resetting in-progress states
 * Blob URLs don't persist across page reloads, so they need to be cleared
 * "generating" states need to be reset since progress is lost on refresh
 */
function sanitizeLoadedProject(project: Sogni360Project): Sogni360Project {
  const sanitized = { ...project };

  // Clear finalLoopUrl if it's a blob URL (won't work after page reload)
  if (sanitized.finalLoopUrl?.startsWith('blob:')) {
    console.log('[LocalDB] Clearing stale blob URL for finalLoopUrl');
    sanitized.finalLoopUrl = undefined;
  }

  // Reset waypoints that were stuck in "generating" state or have stale blob URLs
  // If they have a valid image, mark as ready; otherwise mark as pending
  sanitized.waypoints = sanitized.waypoints.map(wp => {
    let updated = { ...wp };

    // Clear stale blob URLs (they don't persist across page reloads)
    if (updated.imageUrl?.startsWith('blob:')) {
      console.log(`[LocalDB] Clearing stale blob URL for waypoint ${wp.id}`);
      updated.imageUrl = undefined;
      updated.status = 'pending';
    }

    // Clear stale blob URLs from imageHistory
    if (updated.imageHistory && updated.imageHistory.length > 0) {
      const validHistory = updated.imageHistory.filter(url => !url.startsWith('blob:'));
      if (validHistory.length !== updated.imageHistory.length) {
        console.log(`[LocalDB] Clearing stale blob URLs from imageHistory for waypoint ${wp.id}`);
        updated.imageHistory = validHistory.length > 0 ? validHistory : undefined;
        updated.currentImageIndex = validHistory.length > 0 ? Math.min(updated.currentImageIndex || 0, validHistory.length - 1) : undefined;
      }
    }

    // Reset stuck generating state
    if (updated.status === 'generating' || updated.enhancing) {
      console.log(`[LocalDB] Resetting stuck waypoint ${wp.id} from generating state`);
      updated = {
        ...updated,
        status: updated.imageUrl ? 'ready' : 'pending',
        progress: 0,
        enhancing: false,
        enhancementProgress: 0
      };
    }

    return updated;
  });

  // Reset segments that were stuck in "generating" state
  // If they have a video, mark as ready; otherwise mark as pending
  sanitized.segments = sanitized.segments.map(seg => {
    if (seg.status === 'generating') {
      console.log(`[LocalDB] Resetting stuck segment ${seg.id} from generating state`);
      return {
        ...seg,
        status: seg.videoUrl ? 'ready' : 'pending',
        progress: 0
      };
    }
    return seg;
  });

  // Reset project status if it was stuck in a generating state
  if (sanitized.status === 'generating-angles' || sanitized.status === 'generating-transitions') {
    console.log(`[LocalDB] Resetting stuck project status from ${sanitized.status}`);
    sanitized.status = 'draft';
  }

  // Note: S3 presigned URLs in waypoints/segments may also be expired,
  // but we now have infrastructure to refresh them using SDK IDs when needed.
  // The refresh happens at download/fetch time via the /refresh-url endpoint.

  return sanitized;
}

/**
 * Load a project from IndexedDB
 */
export async function loadProject(id: string): Promise<Sogni360Project | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => {
      console.error('Failed to load project:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const result = request.result as LocalProject | undefined;
      const project = result?.project || null;
      // Sanitize the loaded project to clear stale blob URLs
      resolve(project ? sanitizeLoadedProject(project) : null);
    };
  });
}

/**
 * Rename a project in IndexedDB
 */
export async function renameProject(id: string, newName: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onerror = () => {
      console.error('Failed to get project for rename:', getRequest.error);
      reject(getRequest.error);
    };

    getRequest.onsuccess = () => {
      const localProject = getRequest.result as LocalProject | undefined;
      if (!localProject) {
        reject(new Error('Project not found'));
        return;
      }

      // Update the name in both LocalProject and nested Sogni360Project
      localProject.name = newName;
      localProject.project.name = newName;
      localProject.updatedAt = Date.now();

      const putRequest = store.put(localProject);
      putRequest.onerror = () => {
        console.error('Failed to save renamed project:', putRequest.error);
        reject(putRequest.error);
      };
      putRequest.onsuccess = () => {
        console.log('[LocalDB] Renamed project:', id, '→', newName);
        resolve();
      };
    };
  });
}

/**
 * Delete a project from IndexedDB
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => {
      console.error('Failed to delete project:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * List all projects from IndexedDB
 */
export async function listProjects(): Promise<LocalProject[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev'); // Sort by most recent

    const projects: LocalProject[] = [];

    request.onerror = () => {
      console.error('Failed to list projects:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        projects.push(cursor.value as LocalProject);
        cursor.continue();
      } else {
        resolve(projects);
      }
    };
  });
}

/**
 * Get the count of stored projects
 */
export async function getProjectCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onerror = () => {
      console.error('Failed to count projects:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

/**
 * Clear all projects from IndexedDB
 */
export async function clearAllProjects(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => {
      console.error('Failed to clear projects:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

// ===== Current Project Tracking =====

const CURRENT_PROJECT_KEY = 'sogni360-current-project-id';
const COOKIE_NAME = 'sogni360_project';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Set a cookie
 */
function setCookie(name: string, value: string, maxAge: number = COOKIE_MAX_AGE): void {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Lax`;
}

/**
 * Get a cookie value
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Delete a cookie
 */
function deleteCookie(name: string): void {
  document.cookie = `${name}=;max-age=0;path=/`;
}

/**
 * Save the current project ID to localStorage and cookie
 */
export function setCurrentProjectId(projectId: string | null): void {
  if (projectId) {
    localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
    setCookie(COOKIE_NAME, projectId);
    console.log('[LocalDB] Set current project ID:', projectId);
  } else {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
    deleteCookie(COOKIE_NAME);
    console.log('[LocalDB] Cleared current project ID');
  }
}

/**
 * Get the current project ID from localStorage or cookie
 */
export function getCurrentProjectId(): string | null {
  // Try localStorage first, then cookie as fallback
  const fromStorage = localStorage.getItem(CURRENT_PROJECT_KEY);
  if (fromStorage) return fromStorage;

  const fromCookie = getCookie(COOKIE_NAME);
  if (fromCookie) {
    // Sync back to localStorage
    localStorage.setItem(CURRENT_PROJECT_KEY, fromCookie);
    return fromCookie;
  }

  return null;
}

/**
 * Check if saved schema version matches current - if not, clear all data
 */
async function checkSchemaVersion(): Promise<boolean> {
  const savedVersion = localStorage.getItem(SCHEMA_VERSION_KEY);
  const savedVersionNum = savedVersion ? parseInt(savedVersion, 10) : 0;

  if (savedVersionNum !== APP_SCHEMA_VERSION) {
    console.log(`[LocalDB] Schema version mismatch: saved=${savedVersionNum}, current=${APP_SCHEMA_VERSION}`);
    console.log('[LocalDB] Clearing all saved projects due to schema change');

    // Clear all saved data
    try {
      await clearAllProjects();
    } catch (e) {
      console.warn('[LocalDB] Failed to clear projects:', e);
    }

    // Clear localStorage items
    localStorage.removeItem(CURRENT_PROJECT_KEY);
    deleteCookie(COOKIE_NAME);

    // Save new version
    localStorage.setItem(SCHEMA_VERSION_KEY, String(APP_SCHEMA_VERSION));

    return false; // Indicates data was cleared
  }

  return true; // Schema is current
}

/**
 * Get the most recent project (for auto-restore)
 */
export async function getMostRecentProject(): Promise<Sogni360Project | null> {
  // Check schema version first - may clear all data if version mismatch
  const schemaValid = await checkSchemaVersion();
  if (!schemaValid) {
    console.log('[LocalDB] Schema was invalid, returning null for fresh start');
    return null;
  }

  // First try to get the explicitly set current project
  const currentId = getCurrentProjectId();
  if (currentId) {
    const project = await loadProject(currentId);
    if (project) {
      console.log('[LocalDB] Restored current project:', currentId);
      return project;
    }
  }

  // Fall back to most recently updated project
  const projects = await listProjects();
  if (projects.length > 0) {
    const mostRecent = projects[0]; // Already sorted by updatedAt desc
    setCurrentProjectId(mostRecent.id);
    console.log('[LocalDB] Restored most recent project:', mostRecent.id);
    // Sanitize the loaded project to clear stale blob URLs
    return sanitizeLoadedProject(mostRecent.project);
  }

  return null;
}

/**
 * Save project and set it as current
 */
export async function saveCurrentProject(project: Sogni360Project): Promise<void> {
  await saveProject(project);
  setCurrentProjectId(project.id);
}

/**
 * Duplicate a project with a new name
 * Returns the new project with a fresh ID
 */
export async function duplicateProject(
  project: Sogni360Project,
  newName: string
): Promise<Sogni360Project> {
  const newProject: Sogni360Project = {
    ...project,
    id: crypto.randomUUID(),
    name: newName,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await saveProject(newProject);
  console.log('[LocalDB] Duplicated project:', project.id, '→', newProject.id);
  return newProject;
}

export default {
  saveProject,
  loadProject,
  deleteProject,
  renameProject,
  listProjects,
  getProjectCount,
  clearAllProjects,
  setCurrentProjectId,
  getCurrentProjectId,
  getMostRecentProject,
  saveCurrentProject,
  duplicateProject
};
