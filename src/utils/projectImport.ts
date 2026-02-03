/**
 * Project Import Utility
 *
 * Imports Sogni 360 projects from .s360.zip files.
 * Restores all images, videos, and metadata.
 */

import JSZip from 'jszip';
import { APP_SCHEMA_VERSION } from './localProjectsDB';
import type { Sogni360Project, TransitionVersion } from '../types';
import type { ExportManifest } from './projectExport';

export type ImportErrorCode = 'INVALID_ZIP' | 'MISSING_MANIFEST' | 'MISSING_PROJECT' | 'SCHEMA_MISMATCH' | 'CORRUPTED';

export class ImportError extends Error {
  code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

export interface ImportProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * Import a project from a zip file
 */
export async function importProject(
  zipFile: File,
  onProgress?: ImportProgressCallback
): Promise<Sogni360Project> {
  onProgress?.(0, 100, 'Reading zip file...');

  // 1. Load and parse the zip file
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch {
    throw new ImportError('INVALID_ZIP', 'The file is not a valid zip archive');
  }

  onProgress?.(10, 100, 'Validating archive...');

  // 2. Validate manifest.json exists and is valid
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new ImportError('MISSING_MANIFEST', 'Missing manifest.json - not a valid Sogni 360 export');
  }

  let manifest: ExportManifest;
  try {
    const manifestText = await manifestFile.async('string');
    manifest = JSON.parse(manifestText);
  } catch {
    throw new ImportError('CORRUPTED', 'Failed to parse manifest.json');
  }

  // 3. Validate schema version
  if (manifest.appSchemaVersion > APP_SCHEMA_VERSION) {
    throw new ImportError(
      'SCHEMA_MISMATCH',
      `This export was created with a newer version of Sogni 360 (schema v${manifest.appSchemaVersion}). Please update the app to import this project.`
    );
  }

  onProgress?.(20, 100, 'Loading project data...');

  // 4. Load project.json
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new ImportError('MISSING_PROJECT', 'Missing project.json - archive is corrupted');
  }

  let project: Sogni360Project;
  try {
    const projectText = await projectFile.async('string');
    project = JSON.parse(projectText);
  } catch {
    throw new ImportError('CORRUPTED', 'Failed to parse project.json');
  }

  // 5. Collect all asset paths from the project
  const assetPaths = collectAllAssetPaths(project);
  const totalAssets = assetPaths.size;
  let loadedAssets = 0;

  onProgress?.(25, 100, `Loading ${totalAssets} assets...`);

  // 6. Convert asset paths back to data URLs
  const pathToDataUrl = new Map<string, string>();

  for (const assetPath of assetPaths) {
    const file = zip.file(assetPath);
    if (file) {
      try {
        const blob = await file.async('blob');
        const dataUrl = await blobToDataUrl(blob, assetPath);
        pathToDataUrl.set(assetPath, dataUrl);
      } catch (error) {
        console.warn(`[Import] Failed to load asset: ${assetPath}`, error);
      }
    } else {
      console.warn(`[Import] Asset not found in zip: ${assetPath}`);
    }

    loadedAssets++;
    const progress = 25 + Math.round((loadedAssets / totalAssets) * 70);
    onProgress?.(progress, 100, `Loaded ${loadedAssets} of ${totalAssets} assets...`);
  }

  onProgress?.(95, 100, 'Finalizing import...');

  // 7. Create new project with fresh ID and timestamps, replacing asset paths with data URLs
  const importedProject = createImportedProject(project, pathToDataUrl);

  onProgress?.(100, 100, 'Import complete!');

  return importedProject;
}

/**
 * Collect all unique asset paths from a project
 */
function collectAllAssetPaths(project: Sogni360Project): Set<string> {
  const paths = new Set<string>();

  // Helper to add path if it's an asset path
  const addIfAsset = (path: string | undefined) => {
    if (path?.startsWith('assets/')) {
      paths.add(path);
    }
  };

  // Helper to add array of paths
  const addArrayIfAsset = (arr: string[] | undefined) => {
    arr?.forEach(path => addIfAsset(path));
  };

  // Source image
  addIfAsset(project.sourceImageUrl);

  // Final loop
  addIfAsset(project.finalLoopUrl);

  // Waypoint URLs
  for (const wp of project.waypoints) {
    addIfAsset(wp.imageUrl);
    addArrayIfAsset(wp.imageHistory);
    addIfAsset(wp.originalImageUrl);
    addIfAsset(wp.enhancedImageUrl);
  }

  // Segment URLs
  for (const seg of project.segments) {
    addIfAsset(seg.videoUrl);
    seg.versions?.forEach(v => addIfAsset(v.videoUrl));
  }

  return paths;
}

/**
 * Get MIME type from file path/extension
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime'
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Convert a blob to a data URL with correct MIME type
 */
function blobToDataUrl(blob: Blob, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure blob has correct MIME type based on file extension
    const mimeType = getMimeType(filePath);
    const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });

    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(typedBlob);
  });
}

/**
 * Replace asset path with data URL if available
 */
function replaceAssetPath(path: string | undefined, pathToDataUrl: Map<string, string>): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('assets/')) {
    return pathToDataUrl.get(path) || path;
  }
  return path;
}

/**
 * Replace array of asset paths with data URLs
 */
function replaceAssetPathArray(paths: string[] | undefined, pathToDataUrl: Map<string, string>): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const replaced = paths.map(p => replaceAssetPath(p, pathToDataUrl) || p);
  return replaced;
}

/**
 * Create an imported project with fresh IDs and data URLs
 */
function createImportedProject(
  project: Sogni360Project,
  pathToDataUrl: Map<string, string>
): Sogni360Project {
  const now = Date.now();

  return {
    ...project,
    // Generate new ID to avoid conflicts
    id: crypto.randomUUID(),
    // Append "(Imported)" to name for clarity
    name: `${project.name} (Imported)`,
    // Reset timestamps
    createdAt: now,
    updatedAt: now,
    // Replace asset paths with data URLs
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
        // Ensure status reflects whether we have an image
        status: hasImage ? 'ready' : (wp.isOriginal ? 'ready' : 'pending')
      };
    }),
    segments: project.segments.map(seg => {
      const videoUrl = replaceAssetPath(seg.videoUrl, pathToDataUrl);
      const hasVideo = videoUrl && pathToDataUrl.has(seg.videoUrl || '');

      // Convert existing versions or create initial version from videoUrl
      let versions: TransitionVersion[] | undefined;
      if (seg.versions && seg.versions.length > 0) {
        // Has versions array - convert paths to data URLs
        versions = seg.versions.map(v => ({
          ...v,
          videoUrl: replaceAssetPath(v.videoUrl, pathToDataUrl) || v.videoUrl
        } as TransitionVersion));
      } else if (hasVideo && videoUrl) {
        // No versions but has video - create initial version for proper history tracking
        versions = [{
          id: crypto.randomUUID(),
          videoUrl,
          createdAt: seg.sdkProjectId ? now : now, // Use current time
          isSelected: true,
          sdkProjectId: seg.sdkProjectId,
          sdkJobId: seg.sdkJobId
        }];
      }

      return {
        ...seg,
        videoUrl,
        versions,
        currentVersionIndex: versions ? versions.length - 1 : undefined,
        // Ensure status reflects whether we have a video
        status: hasVideo ? 'ready' : 'pending'
      };
    }),
    // Clear transient state
    exportCompleted: false,
    // Reset project status
    status: 'draft'
  };
}

/**
 * Validate that a file is a valid Sogni 360 export without fully importing it
 */
export async function validateExportFile(file: File): Promise<{ valid: boolean; manifest?: ExportManifest; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(file);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { valid: false, error: 'Not a valid Sogni 360 export (missing manifest)' };
    }

    const manifestText = await manifestFile.async('string');
    const manifest: ExportManifest = JSON.parse(manifestText);

    if (manifest.appSchemaVersion > APP_SCHEMA_VERSION) {
      return {
        valid: false,
        manifest,
        error: `Requires newer app version (schema v${manifest.appSchemaVersion})`
      };
    }

    const projectFile = zip.file('project.json');
    if (!projectFile) {
      return { valid: false, manifest, error: 'Missing project data' };
    }

    return { valid: true, manifest };
  } catch {
    return { valid: false, error: 'Invalid or corrupted file' };
  }
}
