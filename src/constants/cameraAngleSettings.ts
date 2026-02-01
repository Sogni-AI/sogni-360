/**
 * Camera Angle Settings Constants
 *
 * Contains model IDs, LoRA configuration, camera pose options, and helper functions
 * for the Multiple Angles LoRA feature (re-render portraits from different camera angles).
 *
 * Supports 96 camera pose combinations:
 * - 8 Azimuths: front, front-right, right, back-right, back, back-left, left, front-left
 * - 4 Elevations: low-angle (-30°), eye-level (0°), elevated (30°), high-angle (60°)
 * - 3 Distances: close-up, medium, wide
 */

import type { MultiAnglePreset } from '../types/cameraAngle';

// Model configuration for camera angle generation
export const CAMERA_ANGLE_MODEL = 'qwen_image_edit_2511_fp8_lightning';
export const CAMERA_ANGLE_MODEL_STANDARD = 'qwen_image_edit_2511_fp8';

// Model definitions with their parameter ranges
// Source: https://socket.sogni.ai/api/v1/models/tiers
export type ImageModelId = 'qwen_image_edit_2511_fp8_lightning' | 'qwen_image_edit_2511_fp8';

export interface ModelConfig {
  id: ImageModelId;
  label: string;
  description: string;
  steps: {
    min: number;
    max: number;
    default: number;
  };
  guidance: {
    min: number;
    max: number;
    default: number;
    decimals: number;
  };
  benchmark: number; // seconds
  costUsd: number; // per render
}

export const IMAGE_MODELS: Record<ImageModelId, ModelConfig> = {
  'qwen_image_edit_2511_fp8_lightning': {
    id: 'qwen_image_edit_2511_fp8_lightning',
    label: 'Qwen Image Edit 2511 Lightning',
    description: 'Fast generation',
    steps: { min: 4, max: 8, default: 4 },
    guidance: { min: 0.6, max: 1.6, default: 1, decimals: 1 },
    benchmark: 179,
    costUsd: 0.0104
  },
  'qwen_image_edit_2511_fp8': {
    id: 'qwen_image_edit_2511_fp8',
    label: 'Qwen Image Edit 2511',
    description: 'Higher quality',
    steps: { min: 20, max: 50, default: 20 },
    guidance: { min: 2.5, max: 5, default: 4, decimals: 1 },
    benchmark: 358,
    costUsd: 0.0207
  }
} as const;

// Photo quality tier presets
export type PhotoQualityTier = 'fast' | 'balanced' | 'quality' | 'pro';

export interface PhotoQualityPreset {
  model: ImageModelId;
  steps: number;
  guidance: number;
  label: string;
  description: string;
}

export const PHOTO_QUALITY_PRESETS: Record<PhotoQualityTier, PhotoQualityPreset> = {
  fast: {
    model: 'qwen_image_edit_2511_fp8_lightning',
    steps: 4,
    guidance: 1.0,
    label: 'Fast',
    description: 'Quick generation'
  },
  balanced: {
    model: 'qwen_image_edit_2511_fp8_lightning',
    steps: 8,
    guidance: 1.0,
    label: 'Balanced',
    description: 'Good balance of speed and quality'
  },
  quality: {
    model: 'qwen_image_edit_2511_fp8',
    steps: 20,
    guidance: 4.0,
    label: 'High Quality',
    description: 'Higher quality output'
  },
  pro: {
    model: 'qwen_image_edit_2511_fp8',
    steps: 40,
    guidance: 4.0,
    label: 'Pro',
    description: 'Maximum quality'
  }
} as const;

/**
 * Determine which quality tier matches the current settings
 */
export function getPhotoQualityTier(
  model: ImageModelId,
  steps: number
): PhotoQualityTier | null {
  // Check each preset for a match
  if (model === 'qwen_image_edit_2511_fp8_lightning') {
    if (steps <= 4) return 'fast';
    if (steps <= 8) return 'balanced';
  } else if (model === 'qwen_image_edit_2511_fp8') {
    if (steps <= 20) return 'quality';
    return 'pro';
  }
  return null;
}

// Get default model config
export function getDefaultModelConfig(): ModelConfig {
  return IMAGE_MODELS[CAMERA_ANGLE_MODEL];
}

// Get model config by ID
export function getModelConfig(modelId: ImageModelId): ModelConfig {
  return IMAGE_MODELS[modelId] || IMAGE_MODELS[CAMERA_ANGLE_MODEL];
}

// LoRA configuration - using LoRA IDs (resolved to filenames by worker via config API)
export const CAMERA_ANGLE_LORA = {
  loras: ['multiple_angles'],  // LoRA IDs, not filenames
  defaultStrength: 0.9
} as const;

// Default generation parameters (matches Lightning model defaults from API)
export const CAMERA_ANGLE_DEFAULTS = {
  steps: 4,
  guidance: 1,
  sampler: 'euler',
  scheduler: 'simple'
} as const;

// Azimuth options (8 horizontal camera positions)
export const AZIMUTHS = [
  { key: 'front', label: 'Front', prompt: 'front view', angle: 0 },
  { key: 'front-right', label: 'Front Right', prompt: 'front-right quarter view', angle: 45 },
  { key: 'right', label: 'Right', prompt: 'right side view', angle: 90 },
  { key: 'back-right', label: 'Back Right', prompt: 'back-right quarter view', angle: 135 },
  { key: 'back', label: 'Back', prompt: 'back view', angle: 180 },
  { key: 'back-left', label: 'Back Left', prompt: 'back-left quarter view', angle: 225 },
  { key: 'left', label: 'Left', prompt: 'left side view', angle: 270 },
  { key: 'front-left', label: 'Front Left', prompt: 'front-left quarter view', angle: 315 }
] as const;

// Elevation options (4 vertical camera positions)
export const ELEVATIONS = [
  { key: 'low-angle', label: 'Low Angle', prompt: 'low-angle shot', angle: -30, icon: '⬇️' },
  { key: 'eye-level', label: 'Eye Level', prompt: 'eye-level shot', angle: 0, icon: '👁️' },
  { key: 'elevated', label: 'Elevated', prompt: 'elevated shot', angle: 30, icon: '⬆️' },
  { key: 'high-angle', label: 'High Angle', prompt: 'high-angle shot', angle: 60, icon: '🔝' }
] as const;

// Distance options (3 shot types)
export const DISTANCES = [
  { key: 'close-up', label: 'Close-up', prompt: 'close-up', scale: 0.6, icon: '🔍' },
  { key: 'medium', label: 'Medium', prompt: 'medium shot', scale: 1.0, icon: '📷' },
  { key: 'wide', label: 'Wide', prompt: 'wide shot', scale: 1.8, icon: '🌐' }
] as const;

// Quick presets for common camera angles
export const CAMERA_PRESETS = [
  {
    key: 'portrait-34',
    label: '3/4 Portrait',
    description: 'Classic portrait angle',
    azimuth: 'front-right',
    elevation: 'eye-level',
    distance: 'medium'
  },
  {
    key: 'profile',
    label: 'Profile',
    description: 'Side profile view',
    azimuth: 'right',
    elevation: 'eye-level',
    distance: 'medium'
  },
  {
    key: 'hero',
    label: 'Hero Shot',
    description: 'Low angle, powerful pose',
    azimuth: 'front',
    elevation: 'low-angle',
    distance: 'medium'
  },
  {
    key: 'overhead',
    label: 'Overhead',
    description: 'Bird\'s eye view',
    azimuth: 'front',
    elevation: 'high-angle',
    distance: 'wide'
  },
  {
    key: 'closeup',
    label: 'Close-up',
    description: 'Intimate detail shot',
    azimuth: 'front',
    elevation: 'eye-level',
    distance: 'close-up'
  },
  {
    key: 'back-34',
    label: 'Over Shoulder',
    description: 'Back quarter view',
    azimuth: 'back-right',
    elevation: 'elevated',
    distance: 'medium'
  }
] as const;

// Maximum number of angles for multi-angle mode
export const MAX_ANGLES = 64;

// Maximum waypoints for Sogni 360 (2-64 waypoints per project)
export const MIN_WAYPOINTS = 2;
export const MAX_WAYPOINTS = 64;

// Multi-angle preset templates for 360 experience
export const MULTI_ANGLE_PRESETS: MultiAnglePreset[] = [
  {
    key: 'simple-zoom-out',
    label: 'Simple Zoom Out',
    description: 'Original + zoomed out view',
    icon: '🔍',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'front', elevation: 'eye-level', distance: 'wide' }
    ]
  },
  {
    key: 'zoom-out-360-9',
    label: 'Zoom Out 360 (9)',
    description: '9 angles - 45° steps',
    icon: '🔄',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'front-right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back-right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back-left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'front-left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up' }
    ]
  },
  {
    key: 'zoom-out-360-4',
    label: 'Zoom Out 360 (4)',
    description: '4 angles - 90° steps',
    icon: '🔄',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'left', elevation: 'eye-level', distance: 'close-up' }
    ]
  },
  {
    key: 'zoom-montage',
    label: 'Zoom Montage',
    description: 'Original + 3 dynamic angles',
    icon: '🎬',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'front-right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'left', elevation: 'low-angle', distance: 'medium' }
    ]
  },
  {
    key: 'portrait-trio',
    label: 'Portrait Trio',
    description: 'Original + 3 classic portraits',
    icon: '📸',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'medium', isOriginal: true },
      { azimuth: 'front-right', elevation: 'eye-level', distance: 'medium' },
      { azimuth: 'front-left', elevation: 'eye-level', distance: 'medium' },
      { azimuth: 'front', elevation: 'elevated', distance: 'medium' }
    ]
  },
  {
    key: '360-spin-close-9',
    label: '360 Spin Close (9)',
    description: '9 angles - close-up, eye-level',
    icon: '🎯',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'front-right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back-right', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'back-left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'front-left', elevation: 'eye-level', distance: 'close-up' },
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up' }
    ]
  },
  {
    key: '360-spin-high-wide-9',
    label: '360 Spin High+Wide (9)',
    description: '9 angles - high angle, wide shot',
    icon: '🦅',
    angles: [
      { azimuth: 'front', elevation: 'high-angle', distance: 'wide', isOriginal: true },
      { azimuth: 'front-right', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'right', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'back-right', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'back', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'back-left', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'left', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'front-left', elevation: 'high-angle', distance: 'wide' },
      { azimuth: 'front', elevation: 'high-angle', distance: 'wide' }
    ]
  },
  {
    key: '360-spin-random-9',
    label: '360 Spin Random (9)',
    description: '9 angles - varied heights & distances',
    icon: '🎲',
    angles: [
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up', isOriginal: true },
      { azimuth: 'front-right', elevation: 'elevated', distance: 'medium' },
      { azimuth: 'right', elevation: 'low-angle', distance: 'wide' },
      { azimuth: 'back-right', elevation: 'high-angle', distance: 'close-up' },
      { azimuth: 'back', elevation: 'eye-level', distance: 'medium' },
      { azimuth: 'back-left', elevation: 'elevated', distance: 'wide' },
      { azimuth: 'left', elevation: 'low-angle', distance: 'close-up' },
      { azimuth: 'front-left', elevation: 'high-angle', distance: 'medium' },
      { azimuth: 'front', elevation: 'eye-level', distance: 'close-up' }
    ]
  }
];

// Types
export type AzimuthKey = typeof AZIMUTHS[number]['key'];
export type ElevationKey = typeof ELEVATIONS[number]['key'];
export type DistanceKey = typeof DISTANCES[number]['key'];
export type CameraPresetKey = typeof CAMERA_PRESETS[number]['key'];

export interface CameraAngleConfig {
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
}

export interface CameraAngleGenerationParams {
  contextImage: string; // Base64 or URL of the source image
  azimuth: AzimuthKey;
  elevation: ElevationKey;
  distance: DistanceKey;
  width: number;
  height: number;
  loraStrength?: number;
  tokenType: 'spark' | 'sogni';
}

/**
 * Build the camera angle prompt with activation keyword
 * Format: <sks> [azimuth_prompt] [elevation_prompt] [distance_prompt]
 */
export function buildCameraAnglePrompt(
  azimuth: AzimuthKey,
  elevation: ElevationKey,
  distance: DistanceKey
): string {
  const azimuthConfig = AZIMUTHS.find(a => a.key === azimuth) || AZIMUTHS[0];
  const elevationConfig = ELEVATIONS.find(e => e.key === elevation) || ELEVATIONS[1];
  const distanceConfig = DISTANCES.find(d => d.key === distance) || DISTANCES[1];

  return `<sks> ${azimuthConfig.prompt} ${elevationConfig.prompt} ${distanceConfig.prompt}`;
}

/**
 * Get a camera preset configuration
 */
export function getCameraPreset(presetKey: CameraPresetKey): CameraAngleConfig | null {
  const preset = CAMERA_PRESETS.find(p => p.key === presetKey);
  if (!preset) return null;

  return {
    azimuth: preset.azimuth as AzimuthKey,
    elevation: preset.elevation as ElevationKey,
    distance: preset.distance as DistanceKey
  };
}

/**
 * Get azimuth configuration by key
 */
export function getAzimuthConfig(key: AzimuthKey) {
  return AZIMUTHS.find(a => a.key === key) || AZIMUTHS[0];
}

/**
 * Get elevation configuration by key
 */
export function getElevationConfig(key: ElevationKey) {
  return ELEVATIONS.find(e => e.key === key) || ELEVATIONS[1];
}

/**
 * Get distance configuration by key
 */
export function getDistanceConfig(key: DistanceKey) {
  return DISTANCES.find(d => d.key === key) || DISTANCES[1];
}

/**
 * Calculate the total number of camera angle combinations
 */
export function getTotalCameraAngleCombinations(): number {
  return AZIMUTHS.length * ELEVATIONS.length * DISTANCES.length; // 8 × 4 × 3 = 96
}

/**
 * Validate camera angle configuration
 */
export function isValidCameraAngleConfig(config: CameraAngleConfig): boolean {
  const validAzimuth = AZIMUTHS.some(a => a.key === config.azimuth);
  const validElevation = ELEVATIONS.some(e => e.key === config.elevation);
  const validDistance = DISTANCES.some(d => d.key === config.distance);

  return validAzimuth && validElevation && validDistance;
}

/**
 * Get descriptive label for a camera angle combination
 */
export function getCameraAngleLabel(config: CameraAngleConfig): string {
  const azimuth = getAzimuthConfig(config.azimuth);
  const elevation = getElevationConfig(config.elevation);
  const distance = getDistanceConfig(config.distance);

  return `${azimuth.label}, ${elevation.label}, ${distance.label}`;
}
