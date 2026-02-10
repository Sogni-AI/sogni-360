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
// Shift and guidance values based on SDK defaults for each model:
// - LightX2V (speed): shift 5.0, guidance 1.0 (range 0.7-1.6)
// - Full quality: shift 8.0, guidance 4.0 (range 1.5-8.0)
export const VIDEO_QUALITY_PRESETS = {
  fast: {
    model: VIDEO_MODELS.speed,
    steps: 4,
    shift: 5.0,
    guidance: 1.0,
    label: 'Fast',
    description: 'Quick generation (~12-20s)'
  },
  balanced: {
    model: VIDEO_MODELS.speed,
    steps: 8,
    shift: 5.0,
    guidance: 1.0,
    label: 'Balanced',
    description: 'Good balance of speed and quality (~25-40s)'
  },
  quality: {
    model: VIDEO_MODELS.quality,
    steps: 20,
    shift: 8.0,
    guidance: 4.0,
    label: 'High Quality',
    description: 'Higher quality, slower (~3-4 min)'
  },
  pro: {
    model: VIDEO_MODELS.quality,
    steps: 30,
    shift: 8.0,
    guidance: 4.0,
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
  quality: 'balanced' as VideoQualityPreset,
  frames: 25, // 1.5 seconds at 16fps base rate, interpolated to 32fps in post
  fps: 32,    // Output fps (post-processing interpolation, adds ~10% to cost)
  duration: 1.5, // 1.5 seconds per transition
  trimEndFrame: false // When true, worker trims last frame from each segment for seamless stitching
};

// Default negative prompt for video generation (WAN 2.1/2.2 I2V)
// Keep in Chinese as the model was trained with Chinese negative prompts
// Translation: garish colors, overexposure, static, blurry details, subtitles, style, artwork,
// painting, frame, still, overall gray, worst quality, low quality, JPEG artifacts, ugly,
// incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured,
// malformed limbs, fused fingers, static frame, cluttered background, three legs,
// many people in background, walking backwards
export const DEFAULT_VIDEO_NEGATIVE_PROMPT =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

// Video generation config
export const VIDEO_CONFIG = {
  // Default frames for 1.5-second transition at 16fps base rate (interpolated to 32fps in post)
  defaultFrames: 25,
  // Frames per second options (16 = no interpolation, 32 = post-processing interpolation +10% cost)
  fpsOptions: [16, 32] as const,
  defaultFps: 32,
  // Duration range in seconds for 360 transitions
  minDuration: 1,
  maxDuration: 8,
  durationStep: 0.5,
  defaultDuration: 1.5,
  // Frame range limits at 16fps base rate (1s = 17 frames, 8s = 129 frames)
  minFrames: 17,
  maxFrames: 129,
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
  resolution: VideoResolution = DEFAULT_VIDEO_SETTINGS.resolution
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
 * Calculate frames based on duration at 16fps BASE generation rate.
 * Formula: 16 * duration + 1
 *
 * IMPORTANT: Video generation ALWAYS happens at 16fps base rate.
 * The fps parameter passed to the SDK controls POST-PROCESSING interpolation:
 * - fps: 16 → No interpolation, output is 16fps
 * - fps: 32 → Worker interpolates to 32fps in post-processing (+10% cost)
 *
 * DO NOT change this to use output fps - frames are ALWAYS generated at 16fps.
 */
export function calculateVideoFrames(duration: number = VIDEO_CONFIG.defaultDuration): number {
  const BASE_FPS = 16; // Generation ALWAYS happens at 16fps
  return Math.round(BASE_FPS * duration) + 1;
}

/**
 * Format duration as MM:SS string
 */
export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
