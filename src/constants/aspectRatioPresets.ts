export interface AspectRatioPreset {
  id: string;
  label: string;
  ratio: [number, number];
  category: 'Original' | 'Vertical' | 'Square' | 'Horizontal';
}

/**
 * Aspect ratio presets organized by category.
 * The "original" preset is a placeholder — its ratio gets replaced
 * at runtime with the source image's native dimensions.
 */
export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: 'original', label: 'Original', ratio: [0, 0], category: 'Original' },
  { id: 'tiktok-reels', label: 'TikTok / Reels / Shorts (9:16)', ratio: [9, 16], category: 'Vertical' },
  { id: 'instagram-portrait', label: 'Instagram Portrait (4:5)', ratio: [4, 5], category: 'Vertical' },
  { id: 'square', label: 'Square (1:1)', ratio: [1, 1], category: 'Square' },
  { id: 'widescreen', label: 'Widescreen (16:9)', ratio: [16, 9], category: 'Horizontal' },
  { id: 'classic', label: 'Classic (4:3)', ratio: [4, 3], category: 'Horizontal' },
  { id: 'cinematic', label: 'Cinematic (21:9)', ratio: [21, 9], category: 'Horizontal' },
];

const MAX_DIMENSION = 1280;

/**
 * Compute pixel dimensions for a given aspect ratio,
 * ensuring the longest side equals maxDimension (default 1280).
 */
export function computeTargetDimensions(
  ratio: [number, number],
  maxDimension: number = MAX_DIMENSION
): { width: number; height: number } {
  const [rw, rh] = ratio;
  if (rw >= rh) {
    return { width: maxDimension, height: Math.round(maxDimension * rh / rw) };
  } else {
    return { width: Math.round(maxDimension * rw / rh), height: maxDimension };
  }
}
