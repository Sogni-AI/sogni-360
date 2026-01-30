/**
 * Type declarations for videoConcatenation.js
 */

export interface VideoItem {
  url: string;
  filename?: string;
}

export interface AudioOptions {
  buffer: ArrayBuffer;
  startOffset?: number;
  isVideoSource?: boolean;
}

export interface PreserveSourceAudioOptions {
  enabled: boolean;
  sourceIndices: number[];
}

export type ProgressCallback = (current: number, total: number, message: string) => void;

/**
 * Concatenate multiple MP4 videos into a single video
 * Uses MP4Box.js for fast client-side container stitching without re-encoding
 */
export function concatenateVideos(
  videos: VideoItem[],
  onProgress?: ProgressCallback | null,
  audioOptions?: AudioOptions | null,
  preserveSourceAudio?: boolean | PreserveSourceAudioOptions
): Promise<Blob>;
