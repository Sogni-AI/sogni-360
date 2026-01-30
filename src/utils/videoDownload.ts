/**
 * Video Download Utility
 *
 * Downloads videos with automatic retry logic and validation.
 * Used for preparing videos for concatenation/stitching.
 */

import { fetchWithRetry } from './fetchWithRetry';

export interface VideoDownloadItem {
  url: string;
  filename?: string;
}

export interface DownloadProgressCallback {
  (current: number, total: number, message: string): void;
}

// Stagger downloads to avoid S3 rate limiting
const DOWNLOAD_DELAY_MS = 150;

/**
 * Download multiple videos with retry logic and progress tracking
 *
 * @param videos - Array of video URLs to download
 * @param onProgress - Optional progress callback
 * @returns Array of downloaded video buffers
 */
export async function downloadVideos(
  videos: VideoDownloadItem[],
  onProgress?: DownloadProgressCallback
): Promise<ArrayBuffer[]> {
  if (!videos || videos.length === 0) {
    throw new Error('No videos to download');
  }

  const videoBuffers: ArrayBuffer[] = [];

  for (let i = 0; i < videos.length; i++) {
    onProgress?.(i, videos.length, `Downloading ${i + 1}/${videos.length}...`);

    // Add a small delay between downloads to avoid rate limiting (skip first request)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY_MS));
    }

    try {
      const response = await fetchWithRetry(videos[i].url, undefined, {
        context: `Video ${i + 1} Download`,
        maxRetries: 3,
        initialDelay: 5000 // Wait 5 seconds before first retry
      });

      if (!response.ok) {
        throw new Error(`Failed to download video ${i + 1}: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('video') && !contentType.includes('mp4') && contentType !== '') {
        console.warn(`Video ${i + 1} has unexpected content-type: ${contentType}`);
      }

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Video ${i + 1} downloaded but is empty`);
      }

      // Verify it's actually an MP4 by checking for ftyp box at the start
      const view = new DataView(buffer, 0, Math.min(12, buffer.byteLength));
      const type = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );

      if (type !== 'ftyp') {
        throw new Error(`Video ${i + 1} is not a valid MP4 file (missing ftyp box)`);
      }

      videoBuffers.push(buffer);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Error downloading video ${i + 1} (${videos[i].url}): ${err.message}`);
    }
  }

  if (videoBuffers.length === 0) {
    throw new Error('No videos were successfully downloaded');
  }

  if (videoBuffers.length !== videos.length) {
    throw new Error(`Expected ${videos.length} videos but only downloaded ${videoBuffers.length}`);
  }

  onProgress?.(videos.length, videos.length, 'Download complete');
  return videoBuffers;
}

/**
 * Download a single video with retry logic
 *
 * @param url - Video URL to download
 * @returns Downloaded video as Blob
 */
export async function downloadVideo(url: string): Promise<Blob> {
  const response = await fetchWithRetry(url, undefined, {
    context: 'Video Download',
    maxRetries: 3,
    initialDelay: 5000
  });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}
