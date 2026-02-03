/**
 * Demo Projects Configuration
 *
 * Demo projects are pre-built showcases that appear in the "My Projects" list.
 * They are lazily loaded from S3 only when the user opens them.
 *
 * Storage: Only metadata is stored locally until user opens a demo.
 * When opened, the full project ZIP is downloaded and imported to IndexedDB.
 */

export interface DemoProjectManifest {
  /** Unique identifier for the demo project (used to track which have been downloaded) */
  id: string;
  /** Display name shown in the project list */
  name: string;
  /** Short description shown below the name */
  description: string;
  /** S3 URL for the thumbnail image (small, loaded for list display) */
  thumbnailUrl: string;
  /** S3 URL for the full project ZIP (only downloaded when user opens) */
  projectZipUrl: string;
  /** Number of waypoints/angles in the project */
  waypointCount: number;
  /** Number of video segments in the project */
  segmentCount: number;
  /** Size of the ZIP file in bytes (for display) */
  zipSizeBytes: number;
  /** Whether this demo should be featured at the top */
  featured?: boolean;
}

/**
 * R2 bucket base URL for demo projects
 * Uses Cloudflare R2 with public access for fast global CDN delivery
 */
const DEMO_BASE_URL = 'https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/sogni-360-demos';

/**
 * Available demo projects
 *
 * To add a new demo:
 * 1. Export the project from the app as a .s360.zip file
 * 2. Upload to S3: the ZIP and a thumbnail image (first waypoint or source)
 * 3. Add an entry here with the S3 URLs
 */
export const DEMO_PROJECTS: DemoProjectManifest[] = [
  {
    id: 'demo-mid-west-van-travel',
    name: 'Mid-West Van Travel Video',
    description: 'Demo Travel Edit For IG Reels /  TikTok',
    thumbnailUrl: `${DEMO_BASE_URL}/demo-mid-west-van-travel/thumbnail.jpg`,
    projectZipUrl: `${DEMO_BASE_URL}/demo-mid-west-van-travel/mid-west-van-travel-demo.s360.zip`,
    waypointCount: 27,
    segmentCount: 27,
    zipSizeBytes: 75_032_486,
    featured: true
  },
  {
    id: 'demo-orbital-portrait-rosie',
    name: 'Orbital Portrait - Rosie',
    description: 'Demo Orbital Portrait: Rosie',
    thumbnailUrl: `${DEMO_BASE_URL}/demo-orbital-portrait-rosie/thumbnail.jpg`,
    projectZipUrl: `${DEMO_BASE_URL}/demo-orbital-portrait-rosie/orbital-portrait-rosie.s360.zip`,
    waypointCount: 4,
    segmentCount: 4,
    zipSizeBytes: 4_973_611,
    featured: true
  }
  // Add more demo projects using: local-scripts/demo-uploader/upload-demo.js
];

/**
 * LocalStorage key for tracking which demo projects have been downloaded
 */
const DOWNLOADED_DEMOS_KEY = 'sogni360-downloaded-demos';

/**
 * Get the set of demo IDs that have been downloaded
 */
export function getDownloadedDemoIds(): Set<string> {
  try {
    const stored = localStorage.getItem(DOWNLOADED_DEMOS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Mark a demo as downloaded
 */
export function markDemoAsDownloaded(demoId: string): void {
  const downloaded = getDownloadedDemoIds();
  downloaded.add(demoId);
  localStorage.setItem(DOWNLOADED_DEMOS_KEY, JSON.stringify([...downloaded]));
}

/**
 * Check if a demo has been downloaded
 */
export function isDemoDownloaded(demoId: string): boolean {
  return getDownloadedDemoIds().has(demoId);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default DEMO_PROJECTS;
