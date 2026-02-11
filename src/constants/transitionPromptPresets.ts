/**
 * Transition prompt presets for video generation
 */

export interface TransitionPromptPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export const TRANSITION_PROMPT_PRESETS: TransitionPromptPreset[] = [
  {
    id: 'camera-orbit',
    label: 'Camera Orbit',
    description: 'Best for AI-generated camera angles of the same scene',
    prompt: `Smooth camera orbit around the subject. Preserve the same subject identity, facial structure, and environment. Seamless motion between camera angles with consistent lighting.`
  },
  {
    id: 'cinematic-morph',
    label: 'Cinematic Morph',
    description: 'Best for transitions between different original photos',
    prompt: `Cinematic transition shot between starting image person and environment to the ending image person and environment. Preserve the same subject identity and facial structure. Use a premium artistic transition or transformation, dynamic action that passes close to the lens to create brief natural occlusion, then reveal cleanly into the ending scene. Creative practical transition near lens. During the occlusion, allow wardrobe and environment to morph smoothly.`
  },
  {
    id: 'parallax-zoom',
    label: 'Parallax Zoom',
    description: 'Epic depth-layered dolly-zoom reveal with parallax',
    prompt: `Epic depth-layered parallax zoom reveal. Foreground shapes slide past the camera with pronounced motion, midground scenery shifts gently, and the far background holds stable, producing a powerful dimensional push-pull dolly-zoom feeling. Smooth cinematic camera glide, continuous motion flow, stable subject lock, rich depth separation, consistent atmosphere from first frame through last frame.`
  },
  {
    id: 'parallax-zoom-2',
    label: 'Parallax Zoom 2',
    description: 'Cinematic pull-back dolly-zoom with depth fade',
    prompt: `Cinematic parallax dolly-zoom fade transition between the first frame and the last frame. The shot begins close on the main subject, then the camera smoothly pulls backward with a gentle zoom, revealing strong depth layers: foreground elements drift noticeably, midground moves moderately, and the distant background remains steady, creating a vivid 3D parallax effect. Motion is slow, continuous, and stabilized with soft easing at the start and end. The subject stays visually anchored while the environment expands outward with consistent lighting, color harmony, and preserved fine detail. Natural cinematic lens perspective, immersive depth, smooth temporal coherence, high quality frame-to-frame continuity.`
  }
];

export const DEFAULT_TRANSITION_PRESET_ID = 'camera-orbit';

export function getDefaultTransitionPrompt(): string {
  const preset = TRANSITION_PROMPT_PRESETS.find(p => p.id === DEFAULT_TRANSITION_PRESET_ID);
  return preset?.prompt || TRANSITION_PROMPT_PRESETS[0].prompt;
}

export function findPresetByPrompt(prompt: string): TransitionPromptPreset | undefined {
  // Normalize whitespace for comparison
  const normalizedPrompt = prompt.trim().replace(/\s+/g, ' ');
  return TRANSITION_PROMPT_PRESETS.find(p =>
    p.prompt.trim().replace(/\s+/g, ' ') === normalizedPrompt
  );
}
