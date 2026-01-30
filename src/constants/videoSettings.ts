/**
 * Video Generation Settings Constants for Sogni 360
 *
 * Contains model IDs, quality presets, resolution options, and helper functions
 * for video transition generation between camera angles.
 */

// Video model variants
export const VIDEO_MODELS = {
  // LightX2V - 4-step LoRA version (faster, good quality)
  speed: 'wan_v2.2-14b-fp8_i2v_lightx2v',
  // Full quality version (slower, best quality)
  quality: 'wan_v2.2-14b-fp8_i2v'
} as const;

export type VideoModelType = keyof typeof VIDEO_MODELS;

// Quality presets mapping to model + steps configuration
export const VIDEO_QUALITY_PRESETS = {
  fast: {
    model: VIDEO_MODELS.speed,
    steps: 4,
    label: 'Fast',
    description: 'Quick generation (~12-20s)'
  },
  balanced: {
    model: VIDEO_MODELS.speed,
    steps: 8,
    label: 'Balanced',
    description: 'Good balance of speed and quality (~25-40s)'
  },
  quality: {
    model: VIDEO_MODELS.quality,
    steps: 20,
    label: 'High Quality',
    description: 'Higher quality, slower (~3-4 min)'
  },
  pro: {
    model: VIDEO_MODELS.quality,
    steps: 30,
    label: 'Pro',
    description: 'Maximum quality (~6-9 min)'
  }
} as const;

export type VideoQualityPreset = keyof typeof VIDEO_QUALITY_PRESETS;

// Resolution presets
export const VIDEO_RESOLUTIONS = {
  '480p': {
    maxDimension: 480,
    label: '480p',
    description: ''
  },
  '580p': {
    maxDimension: 580,
    label: '580p',
    description: ''
  },
  '720p': {
    maxDimension: 720,
    label: '720p',
    description: ''
  }
} as const;

export type VideoResolution = keyof typeof VIDEO_RESOLUTIONS;

// Default video settings for 360 transitions
export const DEFAULT_VIDEO_SETTINGS = {
  resolution: '720p' as VideoResolution,
  quality: 'fast' as VideoQualityPreset,
  frames: 49, // ~3 seconds at 16fps for smooth transitions
  fps: 16,
  duration: 3 // 3 seconds per transition
};

// Video generation config
export const VIDEO_CONFIG = {
  // Default frames for 3-second transition at 16fps
  defaultFrames: 49,
  // Frames per second options
  fpsOptions: [16, 32] as const,
  defaultFps: 16,
  // Duration range in seconds for 360 transitions
  minDuration: 1,
  maxDuration: 5,
  durationStep: 0.5,
  defaultDuration: 3,
  // Frame range limits
  minFrames: 17,
  maxFrames: 81,
  // Dimension must be divisible by this value
  dimensionDivisor: 16
};

/**
 * Calculate video dimensions that are divisible by 16 while maintaining aspect ratio.
 * The shortest dimension will be set to the target resolution, and the longest will scale proportionally.
 */
export function calculateVideoDimensions(
  imageWidth: number,
  imageHeight: number,
  resolution: VideoResolution = '480p'
): { width: number; height: number } {
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  const divisor = VIDEO_CONFIG.dimensionDivisor;

  const roundedTarget = Math.round(targetShortSide / divisor) * divisor;
  const isWidthShorter = imageWidth <= imageHeight;

  if (isWidthShorter) {
    const width = roundedTarget;
    const height = Math.round((imageHeight * roundedTarget / imageWidth) / divisor) * divisor;
    return { width, height };
  } else {
    const height = roundedTarget;
    const width = Math.round((imageWidth * roundedTarget / imageHeight) / divisor) * divisor;
    return { width, height };
  }
}

/**
 * Get the quality preset configuration for a given quality level
 */
export function getVideoQualityConfig(quality: VideoQualityPreset) {
  return VIDEO_QUALITY_PRESETS[quality];
}

/**
 * Calculate video duration in seconds based on frames and fps
 */
export function calculateVideoDuration(frames: number = VIDEO_CONFIG.defaultFrames, fps: number = VIDEO_CONFIG.defaultFps): number {
  return Math.round((frames - 1) / fps);
}

/**
 * Calculate frames based on duration
 */
export function calculateVideoFrames(duration: number = VIDEO_CONFIG.defaultDuration): number {
  const BASE_FPS = 16;
  return BASE_FPS * duration + 1;
}

/**
 * Format duration as MM:SS string
 */
export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
