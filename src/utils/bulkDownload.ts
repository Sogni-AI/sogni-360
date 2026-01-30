/**
 * Bulk Download Utility
 *
 * Downloads multiple images as a ZIP file using JSZip.
 * Based on the pattern from sogni-photobooth.
 * Uses backend proxy for S3 URLs to bypass CORS restrictions.
 */

import JSZip from 'jszip';
import { fetchWithRetry } from './fetchWithRetry';
import { API_URL } from '../config/urls';

/**
 * Check if a URL is an S3 URL that can be proxied
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
 * Fetch with fallback to proxy for CORS-blocked S3 URLs
 * Tries direct fetch first, falls back to proxy on CORS/network errors
 */
async function fetchWithProxyFallback(
  url: string,
  context: string
): Promise<Response> {
  // Try direct fetch first
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
    // Non-ok response - might still work, let caller handle
    return response;
  } catch (directError) {
    // Direct fetch failed (likely CORS) - try proxy for S3 URLs
    if (isS3Url(url)) {
      console.log(`[${context}] Direct fetch failed, trying proxy...`);
      const proxyUrl = getProxiedUrl(url);
      const proxyResponse = await fetchWithRetry(proxyUrl, { credentials: 'include' }, {
        context: `${context} (proxy)`,
        maxRetries: 2,
        initialDelay: 1000
      });
      return proxyResponse;
    }
    // Not an S3 URL, rethrow original error
    throw directError;
  }
}

export interface ImageDownloadItem {
  url: string;
  filename: string;
}

export interface VideoDownloadItem {
  url: string;
  filename: string;
}

export interface DownloadProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * Detect if running on mobile device
 */
function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Download a single image by triggering a browser download
 */
export async function downloadSingleImage(
  url: string,
  filename: string
): Promise<boolean> {
  try {
    // Try direct fetch, fall back to proxy for CORS-blocked S3 URLs
    const response = await fetchWithProxyFallback(url, 'Image Download');

    if (!response.ok) {
      console.warn(`Failed to fetch image: ${response.status}`);
      return false;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (isMobile()) {
      window.open(blobUrl, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    return true;
  } catch (error) {
    console.error('Error downloading image:', error);
    return false;
  }
}

/**
 * Download multiple images as a ZIP file
 */
export async function downloadImagesAsZip(
  images: ImageDownloadItem[],
  zipFilename: string = 'sogni-360-images.zip',
  onProgress?: DownloadProgressCallback
): Promise<boolean> {
  try {
    if (!images || images.length === 0) {
      console.warn('No images to download');
      return false;
    }

    const zip = new JSZip();
    const totalImages = images.length;

    onProgress?.(0, totalImages, 'Preparing download...');

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      try {
        onProgress?.(i, totalImages, `Adding image ${i + 1} of ${totalImages}...`);

        // Try direct fetch, fall back to proxy for CORS-blocked S3 URLs
        const response = await fetchWithProxyFallback(image.url, `Image ${i + 1} Download`);

        if (!response.ok) {
          console.warn(`Failed to fetch image ${i + 1}: ${image.filename}`);
          continue;
        }

        const blob = await response.blob();
        zip.file(image.filename, blob);
      } catch (error) {
        console.error(`Error adding image ${i + 1} to ZIP:`, error);
      }
    }

    onProgress?.(totalImages, totalImages, 'Generating ZIP file...');

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      (metadata) => {
        if (onProgress && metadata.percent) {
          onProgress(
            totalImages,
            totalImages,
            `Compressing... ${Math.round(metadata.percent)}%`
          );
        }
      }
    );

    onProgress?.(totalImages, totalImages, 'Downloading ZIP file...');

    const blobUrl = URL.createObjectURL(zipBlob);

    if (isMobile()) {
      window.open(blobUrl, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = zipFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    onProgress?.(totalImages, totalImages, 'Download complete!');
    return true;
  } catch (error) {
    console.error('Error creating ZIP file:', error);
    onProgress?.(0, 0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Download a single video by triggering a browser download
 */
export async function downloadSingleVideo(
  url: string,
  filename: string
): Promise<boolean> {
  try {
    // Try direct fetch, fall back to proxy for CORS-blocked S3 URLs
    const response = await fetchWithProxyFallback(url, 'Video Download');

    if (!response.ok) {
      console.warn(`Failed to fetch video: ${response.status}`);
      return false;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (isMobile()) {
      window.open(blobUrl, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    return true;
  } catch (error) {
    console.error('Error downloading video:', error);
    return false;
  }
}

/**
 * Download multiple videos as a ZIP file
 */
export async function downloadVideosAsZip(
  videos: VideoDownloadItem[],
  zipFilename: string = 'sogni-360-videos.zip',
  onProgress?: DownloadProgressCallback
): Promise<boolean> {
  try {
    if (!videos || videos.length === 0) {
      console.warn('No videos to download');
      return false;
    }

    const zip = new JSZip();
    const totalVideos = videos.length;

    onProgress?.(0, totalVideos, 'Preparing download...');

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];

      try {
        onProgress?.(i, totalVideos, `Adding video ${i + 1} of ${totalVideos}...`);

        // Try direct fetch, fall back to proxy for CORS-blocked S3 URLs
        const response = await fetchWithProxyFallback(video.url, `Video ${i + 1} Download`);

        if (!response.ok) {
          console.warn(`Failed to fetch video ${i + 1}: ${video.filename}`);
          continue;
        }

        const blob = await response.blob();
        zip.file(video.filename, blob);
      } catch (error) {
        console.error(`Error adding video ${i + 1} to ZIP:`, error);
      }
    }

    onProgress?.(totalVideos, totalVideos, 'Generating ZIP file...');

    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      },
      (metadata) => {
        if (onProgress && metadata.percent) {
          onProgress(
            totalVideos,
            totalVideos,
            `Compressing... ${Math.round(metadata.percent)}%`
          );
        }
      }
    );

    onProgress?.(totalVideos, totalVideos, 'Downloading ZIP file...');

    const blobUrl = URL.createObjectURL(zipBlob);

    if (isMobile()) {
      window.open(blobUrl, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = zipFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    onProgress?.(totalVideos, totalVideos, 'Download complete!');
    return true;
  } catch (error) {
    console.error('Error creating video ZIP file:', error);
    onProgress?.(0, 0, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}
