/**
 * AI Transition Prompt Expander
 *
 * Uses the Sogni Client SDK's multimodal chat completions API to analyze
 * pairs of transition images and expand/generate scene-aware video transition prompts.
 *
 * When a currentPrompt is provided, the VLM expands it with scene-specific details.
 * When no currentPrompt is provided, the VLM generates a prompt from scratch.
 *
 * Frontend SDK mode only — requires authenticated user with Sogni Client access.
 */

import { getSogniClient } from './frontend';
import { imageUrlToDataUri } from '../utils/imageConversion';
import { getDefaultTransitionPrompt } from '../constants/transitionPromptPresets';

const EXPAND_SYSTEM_PROMPT = `You are a video transition prompt expansion specialist. You will receive a base transition prompt and two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip (1-8 seconds).

Your job is to EXPAND the base prompt by analyzing what is actually visible in both images. Keep the original prompt's intent and style, but make it far more specific:
- Identify the specific objects, subjects, and elements visible in each frame
- Describe precisely how each element moves, shifts, or transforms between the two frames
- Add directional motion details (left-to-right rotation, upward tilt, depth changes)
- Note lighting changes, perspective shifts, and spatial relationships

Your expanded prompt MUST:
- Preserve the core intent and style of the base prompt
- Use flowing present-tense language suitable for an AI video generator
- Be under 150 words
- Not include any preamble, explanation, or formatting
- Not reference "first image" or "second image" — describe the motion itself

Output ONLY the expanded video generation prompt text, nothing else.`;

const GENERATE_SYSTEM_PROMPT = `You are a video transition prompt engineer for an AI video generator. You will receive two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip (1-8 seconds).

Analyze both images and write a video generation prompt that describes how the scene should smoothly transition from the first image to the second.

Your prompt MUST:
- Identify specific visual elements in each frame (subject, pose, objects, background features, lighting)
- Describe the exact camera motion connecting the two views (orbit direction, tilt, dolly, pan)
- Explain how each key element moves, shifts, or transforms during the transition
- Specify directional motion (e.g., "subject rotates left-to-right", "background slides from right")
- Maintain subject identity and visual consistency throughout
- Use flowing present-tense language suitable for an AI video generator

Your prompt MUST NOT:
- Include any preamble, explanation, or formatting
- Exceed 150 words
- Describe static details that don't change between frames
- Reference "first image" or "second image" — describe the motion itself

Output ONLY the video generation prompt text, nothing else.`;

const LLM_MODEL = 'qwen3.5-35b-a3b-gguf-q4km';
const MIN_PROMPT_LENGTH = 20;

export interface AnalyzeTransitionOptions {
  fromImageUrl: string;
  toImageUrl: string;
  fromLabel?: string;
  toLabel?: string;
  /** When provided, the VLM expands this prompt with scene-specific details */
  currentPrompt?: string;
  signal?: AbortSignal;
}

export interface AnalyzeTransitionResult {
  prompt: string;
}

/**
 * Clean LLM response: strip think blocks, trim whitespace
 */
function cleanResponse(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^```[\s\S]*?```$/gm, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

/**
 * Analyze a single transition's from/to images and generate a prompt.
 */
export async function analyzeTransition(
  options: AnalyzeTransitionOptions
): Promise<AnalyzeTransitionResult> {
  const { fromImageUrl, toImageUrl, fromLabel, toLabel, currentPrompt, signal } = options;

  const client = getSogniClient();
  if (!client) {
    throw new Error('Sogni client not available — user must be logged in');
  }

  // Check if the VLM model has workers online
  const models = client.chat.models;
  const modelInfo = models[LLM_MODEL];
  if (!modelInfo || !modelInfo.workers || modelInfo.workers === 0) {
    throw new Error(
      'AI prompt expansion is currently unavailable — no VLM workers are online. Try again later.'
    );
  }

  if (signal?.aborted) {
    throw new DOMException('Analysis cancelled', 'AbortError');
  }

  // Convert images to data URIs for the VLM
  const [fromDataUri, toDataUri] = await Promise.all([
    imageUrlToDataUri(fromImageUrl),
    imageUrlToDataUri(toImageUrl),
  ]);

  if (signal?.aborted) {
    throw new DOMException('Analysis cancelled', 'AbortError');
  }

  // Choose system prompt and user message based on whether we're expanding or generating
  const isExpanding = !!currentPrompt;
  const systemPrompt = isExpanding ? EXPAND_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT;
  const userText = isExpanding
    ? `Base prompt to expand:\n"${currentPrompt}"\n\nThe first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Expand the base prompt with specific details from these images.`
    : `The first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Write a transition prompt connecting these two views.`;

  const result = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: fromDataUri } },
          { type: 'image_url', image_url: { url: toDataUri } },
          { type: 'text', text: userText },
        ],
      },
    ],
    stream: false,
    max_tokens: 512,
    temperature: 0.7,
    think: false,
    tokenType: 'spark',
  });

  const prompt = cleanResponse(result.content || '');

  if (prompt.length < MIN_PROMPT_LENGTH) {
    console.warn('[AITransitionAnalyzer] LLM response too short, falling back to default');
    return { prompt: getDefaultTransitionPrompt() };
  }

  return { prompt };
}

/**
 * Analyze multiple transitions in parallel.
 * Each segment gets its own independent LLM call.
 * Failed segments fall back to the default preset prompt.
 */
export async function analyzeMultipleTransitions(
  segments: Array<{ segmentId: string } & AnalyzeTransitionOptions>,
  onSegmentComplete?: (segmentId: string, result: AnalyzeTransitionResult) => void,
  onSegmentError?: (segmentId: string, error: Error) => void,
  signal?: AbortSignal,
): Promise<Map<string, AnalyzeTransitionResult>> {
  const results = new Map<string, AnalyzeTransitionResult>();

  const processSegment = async (seg: (typeof segments)[number]) => {
    if (signal?.aborted) return;

    try {
      const result = await analyzeTransition({
        fromImageUrl: seg.fromImageUrl,
        toImageUrl: seg.toImageUrl,
        fromLabel: seg.fromLabel,
        toLabel: seg.toLabel,
        signal,
      });
      results.set(seg.segmentId, result);
      onSegmentComplete?.(seg.segmentId, result);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // Don't fall back on cancellation
      }

      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[AITransitionAnalyzer] Segment ${seg.segmentId} failed:`, err.message);

      // Fall back to default prompt
      const fallback: AnalyzeTransitionResult = { prompt: getDefaultTransitionPrompt() };
      results.set(seg.segmentId, fallback);
      onSegmentError?.(seg.segmentId, err);
    }
  };

  // Fire all analyses in parallel
  await Promise.all(segments.map(processSegment));

  return results;
}
