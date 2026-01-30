/**
 * Local Projects Database
 *
 * IndexedDB-based storage for Sogni 360 projects.
 * Allows users to save, load, and resume projects locally.
 */

import type { Sogni360Project, LocalProject } from '../types';

const DB_NAME = 'sogni360-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

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
 */
export async function saveProject(project: Sogni360Project): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const localProject: LocalProject = {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: Date.now(),
      thumbnailUrl: project.waypoints[0]?.imageUrl || project.sourceImageUrl,
      project
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
      resolve(result?.project || null);
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
    return mostRecent.project;
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
