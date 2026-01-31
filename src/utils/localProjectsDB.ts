/**
 * Local Projects Database
 *
 * IndexedDB-based storage for Sogni 360 projects.
 * Allows users to save, load, and resume projects locally.
 */

import type { Sogni360Project, LocalProject, Waypoint } from '../types';

const DB_NAME = 'sogni360-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * Convert a blob URL to a data URL (base64)
 * This allows the image data to persist in IndexedDB across page reloads
 */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Process a waypoint's image URLs, converting blob URLs to data URLs for persistence
 */
async function processWaypointForStorage(waypoint: Waypoint): Promise<Waypoint> {
  const processed = { ...waypoint };

  // Convert main imageUrl if it's a blob URL
  if (processed.imageUrl?.startsWith('blob:')) {
    try {
      processed.imageUrl = await blobUrlToDataUrl(processed.imageUrl);
    } catch (e) {
      console.warn('[LocalDB] Failed to convert blob URL to data URL:', e);
      // Clear the blob URL since it won't work after reload anyway
      processed.imageUrl = undefined;
      processed.status = 'pending';
    }
  }

  // Convert imageHistory blob URLs if present
  if (processed.imageHistory && processed.imageHistory.length > 0) {
    const convertedHistory: string[] = [];
    for (const url of processed.imageHistory) {
      if (url.startsWith('blob:')) {
        try {
          convertedHistory.push(await blobUrlToDataUrl(url));
        } catch (e) {
          console.warn('[LocalDB] Failed to convert history blob URL:', e);
          // Skip failed conversions
        }
      } else {
        convertedHistory.push(url);
      }
    }
    processed.imageHistory = convertedHistory;
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

  // Process waypoints to convert blob URLs to data URLs
  const processedWaypoints = await Promise.all(
    project.waypoints.map(wp => processWaypointForStorage(wp))
  );

  // Create a clean copy of the project with processed waypoints
  const cleanProject: Sogni360Project = {
    ...project,
    waypoints: processedWaypoints,
    // Don't save blob URLs for final loop - they won't work after page reload
    finalLoopUrl: project.finalLoopUrl?.startsWith('blob:')
      ? undefined
      : project.finalLoopUrl
  };

  // Get thumbnail URL (prefer first ready waypoint with image, fall back to source)
  const thumbnailWaypoint = cleanProject.waypoints.find(wp => wp.imageUrl && wp.status === 'ready');
  const thumbnailUrl = thumbnailWaypoint?.imageUrl || cleanProject.sourceImageUrl;

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
