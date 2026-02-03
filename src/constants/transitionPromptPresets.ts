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
