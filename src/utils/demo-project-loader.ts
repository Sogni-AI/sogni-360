/**
 * Demo Project Loader
 *
 * Handles fetching and importing demo projects from S3.
 * Demo projects are lazily loaded - only downloaded when user opens them.
 */

import JSZip from 'jszip';
import { APP_SCHEMA_VERSION } from './localProjectsDB';
import type { Sogni360Project, TransitionVersion } from '../types';
import type { ExportManifest } from './projectExport';
import { markDemoAsDownloaded, type DemoProjectManifest } from '../constants/demo-projects';

export type DemoLoadErrorCode =
  | 'FETCH_FAILED'
  | 'INVALID_ZIP'
  | 'MISSING_MANIFEST'
  | 'MISSING_PROJECT'
  | 'SCHEMA_MISMATCH'
  | 'CORRUPTED';

export class DemoLoadError extends Error {
  code: DemoLoadErrorCode;

  constructor(code: DemoLoadErrorCode, message: string) {
    super(message);
    this.name = 'DemoLoadError';
    this.code = code;
  }
}

export interface DemoLoadProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * Download and import a demo project from S3
 */
export async function loadDemoProject(
  demo: DemoProjectManifest,
  onProgress?: DemoLoadProgressCallback
): Promise<Sogni360Project> {
  onProgress?.(0, 100, 'Downloading demo project...');

  // 1. Fetch the ZIP file from S3
  let zipBlob: Blob;
  try {
    const response = await fetch(demo.projectZipUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Track download progress if available
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : demo.zipSizeBytes;

    if (response.body && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let receivedBytes = 0;

      let readComplete = false;
      while (!readComplete) {
        const { done, value } = await reader.read();
        if (done) {
          readComplete = true;
          continue;
        }

        chunks.push(value as BlobPart);
        receivedBytes += value.length;

        const progress = Math.round((receivedBytes / totalBytes) * 40);
        const downloadedMB = (receivedBytes / (1024 * 1024)).toFixed(1);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
        onProgress?.(progress, 100, `Downloading: ${downloadedMB}/${totalMB} MB`);
      }

      zipBlob = new Blob(chunks);
    } else {
      // Fallback if streaming not available
      zipBlob = await response.blob();
    }
  } catch (error) {
    console.error('[DemoLoader] Failed to fetch demo:', error);
    throw new DemoLoadError(
      'FETCH_FAILED',
      `Failed to download demo project. Please check your internet connection.`
    );
  }

  onProgress?.(40, 100, 'Opening archive...');

  // 2. Load and parse the zip file
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch {
    throw new DemoLoadError('INVALID_ZIP', 'The demo project file is corrupted');
  }

  onProgress?.(45, 100, 'Validating project...');

  // 3. Validate manifest.json
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new DemoLoadError('MISSING_MANIFEST', 'Demo project is missing manifest');
  }

  let manifest: ExportManifest;
  try {
    const manifestText = await manifestFile.async('string');
    manifest = JSON.parse(manifestText);
  } catch {
    throw new DemoLoadError('CORRUPTED', 'Demo project manifest is corrupted');
  }

  // 4. Validate schema version
  if (manifest.appSchemaVersion > APP_SCHEMA_VERSION) {
    throw new DemoLoadError(
      'SCHEMA_MISMATCH',
      `This demo requires a newer version of the app. Please refresh the page.`
    );
  }

  onProgress?.(50, 100, 'Loading project data...');

  // 5. Load project.json
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new DemoLoadError('MISSING_PROJECT', 'Demo project data is missing');
  }

  let project: Sogni360Project;
  try {
    const projectText = await projectFile.async('string');
    project = JSON.parse(projectText);
  } catch {
    throw new DemoLoadError('CORRUPTED', 'Demo project data is corrupted');
  }

  // 6. Collect all asset paths
  const assetPaths = collectAllAssetPaths(project);
  const totalAssets = assetPaths.size;
  let loadedAssets = 0;

  onProgress?.(55, 100, `Loading ${totalAssets} assets...`);

  // 7. Convert asset paths to data URLs
  const pathToDataUrl = new Map<string, string>();

  for (const assetPath of assetPaths) {
    const file = zip.file(assetPath);
    if (file) {
      try {
        const blob = await file.async('blob');
        const dataUrl = await blobToDataUrl(blob, assetPath);
        pathToDataUrl.set(assetPath, dataUrl);
      } catch (error) {
        console.warn(`[DemoLoader] Failed to load asset: ${assetPath}`, error);
      }
    }

    loadedAssets++;
    const progress = 55 + Math.round((loadedAssets / totalAssets) * 40);
    onProgress?.(progress, 100, `Loaded ${loadedAssets} of ${totalAssets} assets...`);
  }

  onProgress?.(95, 100, 'Finalizing...');

  // 8. Create the imported project
  const importedProject = createDemoProject(project, pathToDataUrl, demo.name);

  // 9. Mark as downloaded
  markDemoAsDownloaded(demo.id);

  onProgress?.(100, 100, 'Demo loaded!');

  return importedProject;
}

/**
 * Collect all unique asset paths from a project
 */
function collectAllAssetPaths(project: Sogni360Project): Set<string> {
  const paths = new Set<string>();

  const addIfAsset = (path: string | undefined) => {
    if (path?.startsWith('assets/')) {
      paths.add(path);
    }
  };

  const addArrayIfAsset = (array: string[] | undefined) => {
    if (array) {
      for (const path of array) {
        addIfAsset(path);
      }
    }
  };

  addIfAsset(project.sourceImageUrl);
  addIfAsset(project.finalLoopUrl);

  for (const wp of project.waypoints) {
    addIfAsset(wp.imageUrl);
    addArrayIfAsset(wp.imageHistory);
    addIfAsset(wp.originalImageUrl);
    addIfAsset(wp.enhancedImageUrl);
  }

  for (const segment of project.segments) {
    addIfAsset(segment.videoUrl);
    if (segment.versions) {
      for (const version of segment.versions) {
        addIfAsset(version.videoUrl);
      }
    }
  }

  return paths;
}

/**
 * Get MIME type from file path
 */
function getMimeType(filePath: string): string {
  const extension = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime'
  };
  return mimeTypes[extension || ''] || 'application/octet-stream';
}

/**
 * Convert blob to data URL
 */
function blobToDataUrl(blob: Blob, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mimeType = getMimeType(filePath);
    const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });

    const reader = new FileReader();
    reader.addEventListener('loadend', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(typedBlob);
  });
}

/**
 * Replace asset path with data URL
 */
function replaceAssetPath(
  path: string | undefined,
  pathToDataUrl: Map<string, string>
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('assets/')) {
    return pathToDataUrl.get(path) || path;
  }
  return path;
}

/**
 * Replace array of asset paths
 */
function replaceAssetPathArray(
  paths: string[] | undefined,
  pathToDataUrl: Map<string, string>
): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  return paths.map(p => replaceAssetPath(p, pathToDataUrl) || p);
}

/**
 * Determine waypoint status based on image availability
 */
function getWaypointStatus(hasImage: boolean, isOriginal?: boolean): 'ready' | 'pending' {
  if (hasImage) return 'ready';
  if (isOriginal) return 'ready';
  return 'pending';
}

/**
 * Create an imported demo project with fresh IDs
 */
function createDemoProject(
  project: Sogni360Project,
  pathToDataUrl: Map<string, string>,
  demoName: string
): Sogni360Project {
  const now = Date.now();

  return {
    ...project,
    id: crypto.randomUUID(),
    // Keep the demo name (don't append "Imported")
    name: demoName,
    createdAt: now,
    updatedAt: now,
    sourceImageUrl: replaceAssetPath(project.sourceImageUrl, pathToDataUrl) || project.sourceImageUrl,
    finalLoopUrl: replaceAssetPath(project.finalLoopUrl, pathToDataUrl),
    waypoints: project.waypoints.map(wp => {
      const imageUrl = replaceAssetPath(wp.imageUrl, pathToDataUrl);
      const hasImage = imageUrl && pathToDataUrl.has(wp.imageUrl || '');

      return {
        ...wp,
        imageUrl,
        imageHistory: replaceAssetPathArray(wp.imageHistory, pathToDataUrl),
        originalImageUrl: replaceAssetPath(wp.originalImageUrl, pathToDataUrl),
        enhancedImageUrl: replaceAssetPath(wp.enhancedImageUrl, pathToDataUrl),
        status: getWaypointStatus(Boolean(hasImage), wp.isOriginal)
      };
    }),
    segments: project.segments.map(seg => {
      const videoUrl = replaceAssetPath(seg.videoUrl, pathToDataUrl);
      const hasVideo = videoUrl && pathToDataUrl.has(seg.videoUrl || '');

      let versions: TransitionVersion[] | undefined;
      if (seg.versions && seg.versions.length > 0) {
        versions = seg.versions.map(v => ({
          ...v,
          videoUrl: replaceAssetPath(v.videoUrl, pathToDataUrl) || v.videoUrl
        } as TransitionVersion));
      } else if (hasVideo && videoUrl) {
        versions = [
          {
            id: crypto.randomUUID(),
            videoUrl,
            createdAt: now,
            isSelected: true,
            sdkProjectId: seg.sdkProjectId,
            sdkJobId: seg.sdkJobId
          }
        ];
      }

      return {
        ...seg,
        videoUrl,
        versions,
        currentVersionIndex: versions ? versions.length - 1 : undefined,
        status: hasVideo ? 'ready' : 'pending'
      };
    }),
    exportCompleted: false,
    status: 'complete' // Demo projects are already complete
  };
}
