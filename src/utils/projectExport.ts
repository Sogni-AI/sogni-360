/**
 * Project Export Utility
 *
 * Exports Sogni 360 projects as .s360.zip files.
 * Includes all images, videos, and metadata for portable sharing.
 */

import JSZip from 'jszip';
import { fetchWithRetry } from './fetchWithRetry';
import { API_URL } from '../config/urls';
import { APP_SCHEMA_VERSION } from './localProjectsDB';
import type { Sogni360Project, Waypoint, Segment, TransitionVersion } from '../types';

export interface ExportManifest {
  version: number;
  appSchemaVersion: number;
  exportedAt: number;
  projectId: string;
  projectName: string;
  assetCount: { images: number; videos: number };
  includesVersionHistory?: boolean;
}

export interface ExportProgressCallback {
  (current: number, total: number, message: string): void;
}

export interface ExportOptions {
  /** Include version history for images and video segments. Defaults to true. */
  includeVersionHistory?: boolean;
}

const EXPORT_FORMAT_VERSION = 1;

/**
 * Check if a URL is an S3 URL that needs proxy for CORS
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
 * Get the proxied URL for S3 resources
 */
function getProxiedUrl(url: string): string {
  return `${API_URL}/api/sogni/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Convert a URL to a Blob - handles data URLs, blob URLs, and remote URLs
 */
async function urlToBlob(url: string, context: string): Promise<Blob | null> {
  try {
    // Data URLs can be fetched directly
    if (url.startsWith('data:')) {
      const response = await fetch(url);
      return await response.blob();
    }

    // Blob URLs can be fetched directly
    if (url.startsWith('blob:')) {
      const response = await fetch(url);
      return await response.blob();
    }

    // For S3 URLs, try direct fetch first, fall back to proxy
    if (isS3Url(url)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return await response.blob();
        }
      } catch {
        // Direct fetch failed, try proxy
      }

      console.log(`[Export] ${context} - using proxy for S3 URL`);
      const proxyUrl = getProxiedUrl(url);
      const proxyResponse = await fetchWithRetry(proxyUrl, { credentials: 'include' }, {
        context: `${context} (proxy)`,
        maxRetries: 2,
        initialDelay: 1000
      });
      if (proxyResponse.ok) {
        return await proxyResponse.blob();
      }
      return null;
    }

    // Other remote URLs
    const response = await fetch(url);
    if (response.ok) {
      return await response.blob();
    }
    return null;
  } catch (error) {
    console.warn(`[Export] Error fetching ${context}:`, error);
    return null;
  }
}

/**
 * Determine file extension from URL or blob type
 */
function getImageExtension(url: string, blob?: Blob): string {
  if (blob?.type) {
    const mimeToExt: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    if (mimeToExt[blob.type]) return mimeToExt[blob.type];
  }

  const urlLower = url.toLowerCase();
  if (urlLower.includes('.png') || urlLower.includes('png')) return 'png';
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg') || urlLower.includes('jpeg')) return 'jpg';
  if (urlLower.includes('.webp') || urlLower.includes('webp')) return 'webp';

  return url.startsWith('data:image/png') ? 'png' : 'jpg';
}

/**
 * Collect all unique URLs from a project that need to be exported
 */
function collectAllUrls(
  project: Sogni360Project,
  options: ExportOptions = {}
): { images: Map<string, string>; videos: Map<string, string> } {
  const { includeVersionHistory = true } = options;
  const images = new Map<string, string>(); // URL -> asset path
  const videos = new Map<string, string>();

  // Source image
  if (project.sourceImageUrl) {
    images.set(project.sourceImageUrl, 'assets/source');
  }

  // Waypoint URLs
  for (const wp of project.waypoints) {
    if (wp.imageUrl) {
      images.set(wp.imageUrl, `assets/waypoints/wp-${wp.id}`);
    }
    // Only include version history if option is enabled
    if (includeVersionHistory) {
      if (wp.imageHistory) {
        wp.imageHistory.forEach((url, idx) => {
          if (url && !images.has(url)) {
            images.set(url, `assets/waypoints/wp-${wp.id}-history-${idx}`);
          }
        });
      }
      if (wp.originalImageUrl && !images.has(wp.originalImageUrl)) {
        images.set(wp.originalImageUrl, `assets/waypoints/wp-${wp.id}-original`);
      }
      if (wp.enhancedImageUrl && !images.has(wp.enhancedImageUrl)) {
        images.set(wp.enhancedImageUrl, `assets/waypoints/wp-${wp.id}-enhanced`);
      }
    }
  }

  // Segment URLs
  for (const seg of project.segments) {
    if (seg.videoUrl) {
      videos.set(seg.videoUrl, `assets/segments/seg-${seg.id}`);
    }
    // Only include video versions if option is enabled
    if (includeVersionHistory && seg.versions) {
      seg.versions.forEach((version, idx) => {
        if (version.videoUrl && !videos.has(version.videoUrl)) {
          videos.set(version.videoUrl, `assets/segments/seg-${seg.id}-v${idx}`);
        }
      });
    }
  }

  // Final loop video
  if (project.finalLoopUrl && !videos.has(project.finalLoopUrl)) {
    videos.set(project.finalLoopUrl, 'assets/final-loop');
  }

  return { images, videos };
}

/**
 * Export a project to a downloadable zip file
 */
export async function exportProject(
  project: Sogni360Project,
  onProgress?: ExportProgressCallback,
  options: ExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const assetsFolder = zip.folder('assets');
  const waypointsFolder = assetsFolder?.folder('waypoints');
  const segmentsFolder = assetsFolder?.folder('segments');

  if (!assetsFolder || !waypointsFolder || !segmentsFolder) {
    throw new Error('Failed to create zip folder structure');
  }

  // Collect all URLs that need to be exported
  const { images, videos } = collectAllUrls(project, options);
  const totalAssets = images.size + videos.size;
  let currentAsset = 0;
  let exportedImages = 0;
  let exportedVideos = 0;

  // Map of original URLs to final asset paths (with extensions)
  const urlToPath = new Map<string, string>();

  onProgress?.(0, totalAssets, 'Preparing export...');

  // Export all images
  for (const [url, basePath] of images) {
    currentAsset++;
    onProgress?.(currentAsset, totalAssets, `Exporting image ${currentAsset} of ${images.size}...`);

    const blob = await urlToBlob(url, basePath);
    if (blob) {
      const ext = getImageExtension(url, blob);
      const fullPath = `${basePath}.${ext}`;
      zip.file(fullPath, blob);
      urlToPath.set(url, fullPath);
      exportedImages++;
    } else {
      console.warn(`[Export] Skipped image: ${basePath}`);
    }
  }

  // Export all videos
  for (const [url, basePath] of videos) {
    currentAsset++;
    onProgress?.(currentAsset, totalAssets, `Exporting video ${currentAsset - images.size} of ${videos.size}...`);

    const blob = await urlToBlob(url, basePath);
    if (blob) {
      const fullPath = `${basePath}.mp4`;
      zip.file(fullPath, blob);
      urlToPath.set(url, fullPath);
      exportedVideos++;
    } else {
      console.warn(`[Export] Skipped video: ${basePath}`);
    }
  }

  // Create project.json with URLs replaced by asset paths
  const exportedProject = createExportedProject(project, urlToPath, options);
  zip.file('project.json', JSON.stringify(exportedProject, null, 2));

  // Create manifest.json
  const { includeVersionHistory = true } = options;
  const manifest: ExportManifest = {
    version: EXPORT_FORMAT_VERSION,
    appSchemaVersion: APP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    projectId: project.id,
    projectName: project.name,
    assetCount: {
      images: exportedImages,
      videos: exportedVideos
    },
    includesVersionHistory: includeVersionHistory
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate the zip blob
  onProgress?.(totalAssets, totalAssets, 'Compressing...');
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (metadata) => {
      if (onProgress && metadata.percent) {
        onProgress(totalAssets, totalAssets, `Compressing... ${Math.round(metadata.percent)}%`);
      }
    }
  );

  const skipped = totalAssets - exportedImages - exportedVideos;
  if (skipped > 0) {
    console.warn(`[Export] Completed with ${skipped} skipped assets`);
  }

  return zipBlob;
}

/**
 * Replace a URL with its asset path if available
 */
function replaceUrl(url: string | undefined, urlToPath: Map<string, string>): string | undefined {
  if (!url) return undefined;
  return urlToPath.get(url) || url;
}

/**
 * Replace an array of URLs with asset paths
 */
function replaceUrlArray(urls: string[] | undefined, urlToPath: Map<string, string>): string[] | undefined {
  if (!urls || urls.length === 0) return undefined;
  return urls.map(url => urlToPath.get(url) || url);
}

/**
 * Create a copy of the project with URLs replaced by asset paths
 */
function createExportedProject(
  project: Sogni360Project,
  urlToPath: Map<string, string>,
  options: ExportOptions = {}
): Sogni360Project {
  const { includeVersionHistory = true } = options;

  return {
    ...project,
    sourceImageUrl: replaceUrl(project.sourceImageUrl, urlToPath) || project.sourceImageUrl,
    finalLoopUrl: replaceUrl(project.finalLoopUrl, urlToPath),
    waypoints: project.waypoints.map(wp => ({
      ...wp,
      imageUrl: replaceUrl(wp.imageUrl, urlToPath),
      // Only include version history if option is enabled
      imageHistory: includeVersionHistory ? replaceUrlArray(wp.imageHistory, urlToPath) : undefined,
      originalImageUrl: includeVersionHistory ? replaceUrl(wp.originalImageUrl, urlToPath) : undefined,
      enhancedImageUrl: includeVersionHistory ? replaceUrl(wp.enhancedImageUrl, urlToPath) : undefined,
      currentImageIndex: includeVersionHistory ? wp.currentImageIndex : undefined,
      // Clear transient state
      projectId: undefined,
      sdkProjectId: undefined,
      sdkJobId: undefined,
      progress: undefined,
      error: undefined,
      enhancing: false,
      enhancementProgress: undefined
    } as Waypoint)),
    segments: project.segments.map(seg => ({
      ...seg,
      videoUrl: replaceUrl(seg.videoUrl, urlToPath),
      // Only include video versions if option is enabled
      versions: includeVersionHistory ? seg.versions?.map(v => ({
        ...v,
        videoUrl: replaceUrl(v.videoUrl, urlToPath) || v.videoUrl,
        sdkProjectId: undefined,
        sdkJobId: undefined
      } as TransitionVersion)) : undefined,
      currentVersionIndex: includeVersionHistory ? seg.currentVersionIndex : undefined,
      // Clear transient state
      projectId: undefined,
      sdkProjectId: undefined,
      sdkJobId: undefined,
      progress: undefined,
      error: undefined,
      workerName: undefined
    } as Segment)),
    exportCompleted: false
  };
}

/**
 * Generate a safe filename from project name
 */
export function generateExportFilename(projectName: string): string {
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'project';
  return `${safeName}.s360.zip`;
}

/**
 * Trigger download of the zip blob
 */
export function downloadZipBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
