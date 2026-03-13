/**
 * Video Generation Settings Constants for Sogni 360
 *
 * Contains model IDs, quality presets, resolution options, and helper functions
 * for video transition generation between camera angles.
 *
 * Supports two video model families:
 * - WAN 2.2: Proven quality, generates at 16fps base with optional 32fps post-interpolation
 * - LTX-2.3: Next-gen model, generates at native FPS (24), frames snap to 1+n*8
 */

// ── Model Families ──────────────────────────────────────────────────────

export type VideoModelFamily = 'wan2.2' | 'ltx2.3';

export const VIDEO_MODEL_FAMILIES: Record<VideoModelFamily, { label: string; description: string }> = {
  'wan2.2': { label: 'WAN 2.2', description: 'Proven quality with smooth frame interpolation' },
  'ltx2.3': { label: 'LTX-2.3', description: 'Next-gen model, native FPS, longer duration support' }
};

export const DEFAULT_MODEL_FAMILY: VideoModelFamily = 'wan2.2';

// ── Model IDs ───────────────────────────────────────────────────────────

export const VIDEO_MODELS = {
  'wan2.2': {
    speed: 'wan_v2.2-14b-fp8_i2v_lightx2v',
    quality: 'wan_v2.2-14b-fp8_i2v'
  },
  'ltx2.3': {
    speed: 'ltx23-22b-fp8_i2v_distilled',
    quality: 'ltx23-22b-fp8_i2v_distilled'
  }
} as const;

// ── Quality Presets ─────────────────────────────────────────────────────

export type VideoQualityPreset = 'fast' | 'balanced' | 'quality' | 'pro';

export interface VideoQualityConfig {
  model: string;
  steps: number;
  shift: number;
  guidance: number;
  sampler: string;
  scheduler: string;
  label: string;
  description: string;
}

const WAN22_QUALITY: Record<VideoQualityPreset, VideoQualityConfig> = {
  fast: {
    model: VIDEO_MODELS['wan2.2'].speed, steps: 4, shift: 5.0, guidance: 1.0,
    sampler: 'euler', scheduler: 'simple',
    label: 'Fast', description: 'Quick generation (~12-20s)'
  },
  balanced: {
    model: VIDEO_MODELS['wan2.2'].speed, steps: 8, shift: 5.0, guidance: 1.0,
    sampler: 'euler', scheduler: 'simple',
    label: 'Balanced', description: 'Good balance of speed and quality (~25-40s)'
  },
  quality: {
    model: VIDEO_MODELS['wan2.2'].quality, steps: 20, shift: 8.0, guidance: 4.0,
    sampler: 'euler', scheduler: 'simple',
    label: 'High Quality', description: 'Higher quality, slower (~3-4 min)'
  },
  pro: {
    model: VIDEO_MODELS['wan2.2'].quality, steps: 30, shift: 8.0, guidance: 4.0,
    sampler: 'euler', scheduler: 'simple',
    label: 'Pro', description: 'Maximum quality (~6-9 min)'
  }
};

const LTX23_QUALITY: Record<VideoQualityPreset, VideoQualityConfig> = {
  fast: {
    model: VIDEO_MODELS['ltx2.3'].speed, steps: 4, shift: 3.0, guidance: 1.0,
    sampler: 'euler_ancestral', scheduler: 'simple',
    label: 'Fast', description: 'Quick generation (~8-12s)'
  },
  balanced: {
    model: VIDEO_MODELS['ltx2.3'].speed, steps: 8, shift: 3.0, guidance: 1.0,
    sampler: 'euler_ancestral', scheduler: 'simple',
    label: 'Balanced', description: 'Good balance of speed and quality (~15-25s)'
  },
  quality: {
    model: VIDEO_MODELS['ltx2.3'].speed, steps: 10, shift: 3.0, guidance: 1.0,
    sampler: 'euler_ancestral', scheduler: 'simple',
    label: 'High Quality', description: 'Higher quality, slower (~25-35s)'
  },
  pro: {
    model: VIDEO_MODELS['ltx2.3'].speed, steps: 12, shift: 3.0, guidance: 1.0,
    sampler: 'euler_ancestral', scheduler: 'simple',
    label: 'Pro', description: 'Maximum quality (~35-50s)'
  }
};

/** Backward-compatible default (WAN 2.2) — use getVideoQualityConfig() for model-aware access */
export const VIDEO_QUALITY_PRESETS = WAN22_QUALITY;

/** Get quality config for a given quality level and model family */
export function getVideoQualityConfig(
  quality: VideoQualityPreset,
  modelFamily: VideoModelFamily = 'wan2.2'
): VideoQualityConfig {
  return modelFamily === 'ltx2.3' ? LTX23_QUALITY[quality] : WAN22_QUALITY[quality];
}

// ── Resolution Presets ──────────────────────────────────────────────────

export const VIDEO_RESOLUTIONS = {
  '480p': { maxDimension: 480, label: '480p', description: '' },
  '580p': { maxDimension: 580, label: '580p', description: '' },
  '640p': { maxDimension: 640, label: '640p', description: '' },
  '720p': { maxDimension: 720, label: '720p', description: '' },
  '1080p': { maxDimension: 1080, label: '1080p', description: '' }
} as const;

export type VideoResolution = keyof typeof VIDEO_RESOLUTIONS;

/**
 * Get valid resolution options for a model family.
 * LTX-2.3 has a 640px minimum dimension, so 480p and 580p are excluded.
 */
export function getValidResolutions(modelFamily: VideoModelFamily = 'wan2.2'): VideoResolution[] {
  const config = getVideoModelConfig(modelFamily);
  return (Object.keys(VIDEO_RESOLUTIONS) as VideoResolution[]).filter(
    key => VIDEO_RESOLUTIONS[key].maxDimension >= config.minDimension
  );
}

// ── Default Settings ────────────────────────────────────────────────────

export const DEFAULT_VIDEO_SETTINGS = {
  resolution: '720p' as VideoResolution,
  quality: 'balanced' as VideoQualityPreset,
  modelFamily: 'wan2.2' as VideoModelFamily,
  frames: 25,  // 1.5s at 16fps base rate (WAN), interpolated to 32fps in post
  fps: 32,     // WAN output fps (post-processing interpolation, +10% cost)
  duration: 1.5,
  trimEndFrame: false
};

// ── Negative Prompts ────────────────────────────────────────────────────

// WAN 2.2 (Chinese — model was trained with Chinese negative prompts)
export const DEFAULT_VIDEO_NEGATIVE_PROMPT =
  '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

// LTX-2.3 (English)
export const DEFAULT_LTX23_VIDEO_NEGATIVE_PROMPT =
  'worst quality, low quality, blurry, distorted, deformed, disfigured, bad anatomy, watermark, text, overexposed, underexposed, static frame, jittery motion, flickering, artifacts';

export function getDefaultNegativePrompt(modelFamily: VideoModelFamily = 'wan2.2'): string {
  return modelFamily === 'ltx2.3' ? DEFAULT_LTX23_VIDEO_NEGATIVE_PROMPT : DEFAULT_VIDEO_NEGATIVE_PROMPT;
}

// ── Per-Model Video Config ──────────────────────────────────────────────

export interface VideoModelConfig {
  fps: number;
  dimensionDivisor: number;
  minDimension: number;
  maxDimension: number;
  minDuration: number;
  maxDuration: number;
  durationStep: number;
  frameStep: number | null;  // null = no snapping, 8 = snap to 1+n*8
  minFrames: number;
  maxFrames: number;
}

const WAN22_CONFIG: VideoModelConfig = {
  fps: 32,
  dimensionDivisor: 16,
  minDimension: 480,
  maxDimension: 1536,
  minDuration: 1,
  maxDuration: 8,
  durationStep: 0.5,
  frameStep: null,
  minFrames: 17,
  maxFrames: 129
};

const LTX23_CONFIG: VideoModelConfig = {
  fps: 24,
  dimensionDivisor: 64,
  minDimension: 640,
  maxDimension: 1536,
  minDuration: 1,
  maxDuration: 20,
  durationStep: 0.5,
  frameStep: 8,
  minFrames: 25,
  maxFrames: 505
};

export function getVideoModelConfig(modelFamily: VideoModelFamily = 'wan2.2'): VideoModelConfig {
  return modelFamily === 'ltx2.3' ? LTX23_CONFIG : WAN22_CONFIG;
}

/** Backward-compatible WAN config — use getVideoModelConfig() for model-aware access */
export const VIDEO_CONFIG = {
  defaultFrames: 25,
  fpsOptions: [16, 32] as const,
  defaultFps: 32,
  minDuration: 1,
  maxDuration: 8,
  durationStep: 0.5,
  defaultDuration: 1.5,
  minFrames: 17,
  maxFrames: 129,
  dimensionDivisor: 16,
  minDimension: 480,
  maxDimension: 1536
};

// ── Dimension Calculation ───────────────────────────────────────────────

/**
 * Calculate video dimensions maintaining aspect ratio.
 * Uses model-family-specific dimension divisor and limits.
 */
export function calculateVideoDimensions(
  imageWidth: number,
  imageHeight: number,
  resolution: VideoResolution = DEFAULT_VIDEO_SETTINGS.resolution,
  modelFamily: VideoModelFamily = 'wan2.2'
): { width: number; height: number } {
  const config = getVideoModelConfig(modelFamily);
  const targetShortSide = VIDEO_RESOLUTIONS[resolution].maxDimension;
  const divisor = config.dimensionDivisor;

  // Round target to divisor, enforce minimum
  const roundedTarget = Math.max(
    config.minDimension,
    Math.round(targetShortSide / divisor) * divisor
  );
  const isWidthShorter = imageWidth <= imageHeight;

  let width: number;
  let height: number;

  if (isWidthShorter) {
    width = roundedTarget;
    height = Math.round((imageHeight * roundedTarget / imageWidth) / divisor) * divisor;
  } else {
    height = roundedTarget;
    width = Math.round((imageWidth * roundedTarget / imageHeight) / divisor) * divisor;
  }

  // Clamp to max
  if (width > config.maxDimension) {
    height = Math.round((height * config.maxDimension / width) / divisor) * divisor;
    width = config.maxDimension;
  } else if (height > config.maxDimension) {
    width = Math.round((width * config.maxDimension / height) / divisor) * divisor;
    height = config.maxDimension;
  }

  // Enforce minimum
  width = Math.max(config.minDimension, width);
  height = Math.max(config.minDimension, height);

  return { width, height };
}

// ── Frame Calculation ───────────────────────────────────────────────────

/**
 * Calculate video frames for a given duration and model family.
 *
 * WAN 2.2: Always 16fps base rate. fps param controls post-processing interpolation only.
 * LTX-2.3: Generates at native 24fps. Frames must snap to 1 + n*8.
 */
export function calculateVideoFrames(
  duration: number = DEFAULT_VIDEO_SETTINGS.duration,
  modelFamily: VideoModelFamily = 'wan2.2'
): number {
  if (modelFamily === 'ltx2.3') {
    const config = LTX23_CONFIG;
    let frames = Math.round(duration * config.fps) + 1;
    // Snap to 1 + n*8 (LTX-2 frame step constraint)
    const n = Math.round((frames - 1) / config.frameStep!);
    frames = n * config.frameStep! + 1;
    return Math.max(config.minFrames, Math.min(config.maxFrames, frames));
  }
  // WAN 2.2: Generation ALWAYS at 16fps base rate
  return Math.round(16 * duration) + 1;
}

/** Calculate video duration in seconds from frames */
export function calculateVideoDuration(frames: number = VIDEO_CONFIG.defaultFrames, fps: number = VIDEO_CONFIG.defaultFps): number {
  return Math.round((frames - 1) / fps);
}

/** Format duration as MM:SS string */
export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
