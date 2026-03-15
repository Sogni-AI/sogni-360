/**
 * AI Transition Prompt Expander
 *
 * Uses the Sogni Client SDK's multimodal chat completions API to analyze
 * pairs of transition images and expand/generate scene-aware video transition prompts.
 *
 * When a currentPrompt is provided, the VLM expands it with scene-specific details.
 * When no currentPrompt is provided, the VLM generates a prompt from scratch.
 *
 * Model-aware: produces different prompt styles for WAN 2.2 vs LTX-2.3.
 * LTX-2.3 prompts follow the official prompt guide: single flowing paragraph,
 * motion-focused (not static), explicit camera language, physical cues,
 * and REQUIRED audio descriptions (LTX-2.3 generates synchronized audio).
 *
 * Frontend SDK mode only — requires authenticated user with Sogni Client access.
 */

import { getSogniClient } from './frontend';
import { getDefaultTransitionPrompt } from '../constants/transitionPromptPresets';

const VLM_MAX_DIMENSION = 1024;
const VLM_JPEG_QUALITY = 0.92;

/**
 * Resize an image for the VLM: scale longest side to 1024px max, compress as JPEG.
 * Matches the pattern used in sogni-chat's resizeImageForVision.
 */
function resizeImageForVLM(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > VLM_MAX_DIMENSION || h > VLM_MAX_DIMENSION) {
        const scale = VLM_MAX_DIMENSION / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Cannot create canvas context')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', VLM_JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('Failed to load image for VLM resize'));
    img.src = imageUrl;
  });
}

// ── WAN 2.2 system prompts ───────────────────────────────────────────────

const WAN_EXPAND_PROMPT = `You are a video transition prompt expansion specialist. You will receive a base transition prompt and two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip (1-8 seconds).

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

const WAN_GENERATE_PROMPT = `You are a video transition prompt engineer for an AI video generator. You will receive two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip (1-8 seconds).

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

// ── LTX-2.3 system prompts (i2v first-frame/last-frame with audio) ────

const LTX_EXPAND_PROMPT = `You are a video transition prompt specialist for the LTX-2.3 model. You will receive a base prompt and two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip.

REWRITE and EXPAND the base prompt following LTX-2.3 methodology:

FORMAT: Write as a single flowing paragraph in present tense. Do NOT use bullet points, numbered lists, headers, or segmented formatting. The output must read as one continuous block of descriptive text.

I2V RULES (image-to-video with first and last frame provided): Do NOT describe static elements already visible in the images — the model sees them. Focus entirely on the continuous motion, action, and transformation that connects the starting view to the ending view. Describe what changes between the two frames, not what is already there.

CAMERA: Use explicit camera movement language — "slow dolly in," "camera pans left," "tracking shot follows," "pulls back to reveal," "circles around," "tilts upward." Describe how subjects appear after the movement.

PERFORMANCE: Use physical action cues, not emotional labels. NOT "looks sad" — instead "eyes lower, shoulders drop slightly." Break any dialogue into short phrases with acting directions between lines.

NO numerical specifications (no "45 degrees" or "2 seconds") — use natural language.

AUDIO IS REQUIRED — LTX-2.3 generates synchronized audio. Weave sound descriptions naturally into the paragraph: environmental ambience such as wind, room tone, or distant traffic; action-related sounds like footsteps on surfaces, fabric rustling, or object interactions; and atmospheric audio including any musical undertone, reverb characteristics, or spatial quality. Describe sounds as they would be heard, not as category labels.

Your expanded prompt MUST preserve the core intent of the base prompt, be 100-200 words (longer prompts outperform short ones on LTX-2.3), not include any preamble or explanation, and not reference "first image" or "second image."

Output ONLY the expanded prompt text, nothing else.`;

const LTX_GENERATE_PROMPT = `You are a video transition prompt engineer for the LTX-2.3 model. You will receive two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip.

Analyze the visual differences and write a transition prompt following LTX-2.3 methodology:

FORMAT: Write as a single flowing paragraph in present tense. Do NOT use bullet points, numbered lists, headers, or segmented formatting. The output must read as one continuous block of descriptive text.

I2V RULES (image-to-video with first and last frame provided): Do NOT describe static elements visible in both images — the model already sees them. Focus on what CHANGES: how subjects move, how the scene transforms, how the camera travels. Describe the continuous motion that connects the starting view to the ending view.

STRUCTURE (flow naturally as one paragraph): Begin by establishing the shot type and cinematography style, then describe the motion and transformation connecting the two views, detail how each key visual element shifts or changes between frames, specify camera movement with explicit directional language such as "slow dolly in," "camera orbits right," "tracking shot," "pulls back," "circles around," or "tilts upward," and end with the audio description.

PERFORMANCE: Use physical action descriptions, not emotional labels. NOT "looking confused" — instead "brow furrows, head tilts slightly."

NO numerical angles or speeds — use natural language ("gentle," "rapid," "sweeping").

AUDIO IS REQUIRED — LTX-2.3 generates synchronized audio. Weave sound descriptions naturally into the paragraph: environmental ambience such as wind, room tone, or distant sounds; action-related sounds like movement across surfaces, footsteps, or fabric contact; and atmospheric audio including any musical undertone, reverb, or spatial depth. Describe sounds as they would be heard, not as category labels.

Your prompt MUST be 100-200 words (longer prompts consistently outperform short ones on LTX-2.3), maintain subject identity and visual consistency, not include any preamble or explanation, and not reference "first image" or "second image."

Output ONLY the video generation prompt text, nothing else.`;

const LLM_MODEL = 'qwen3.5-35b-a3b-gguf-q4km';
const MIN_PROMPT_LENGTH = 20;
const COMPLETION_TIMEOUT_MS = 60_000; // 60s — more reasonable than the SDK's 300s default

/**
 * Select system prompts based on the video model family.
 */
function getSystemPrompts(videoModel?: string) {
  const isLtx = videoModel === 'ltx2.3';
  return {
    expand: isLtx ? LTX_EXPAND_PROMPT : WAN_EXPAND_PROMPT,
    generate: isLtx ? LTX_GENERATE_PROMPT : WAN_GENERATE_PROMPT,
    maxTokens: isLtx ? 768 : 512, // LTX prompts are longer
  };
}

export interface AnalyzeTransitionOptions {
  fromImageUrl: string;
  toImageUrl: string;
  fromLabel?: string;
  toLabel?: string;
  /** When provided, the VLM expands this prompt with scene-specific details */
  currentPrompt?: string;
  /** Video model family — determines prompt style ('wan2.2' vs 'ltx2.3') */
  videoModel?: string;
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
 *
 * Uses stream:true (matching every working Sogni app) because the SDK's
 * non-streaming path has a fragile polling loop that silently hangs.
 */
export async function analyzeTransition(
  options: AnalyzeTransitionOptions
): Promise<AnalyzeTransitionResult> {
  const { fromImageUrl, toImageUrl, fromLabel, toLabel, currentPrompt, videoModel, signal } = options;

  const t0 = performance.now();
  const elapsed = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;

  console.log('[AITransitionAnalyzer] Starting analysis (stream mode v2)…');

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
  console.log(`[AITransitionAnalyzer] [${elapsed()}] Model ${LLM_MODEL} — ${modelInfo.workers} worker(s) online`);

  if (signal?.aborted) {
    throw new DOMException('Analysis cancelled', 'AbortError');
  }

  // Resize images for the VLM (1024px max, JPEG 0.85) — sogni-chat does the same.
  // Raw camera angle images can be 2-3MB+ as base64, which chokes VLM workers.
  console.log(`[AITransitionAnalyzer] [${elapsed()}] Resizing images for VLM (max ${VLM_MAX_DIMENSION}px)…`);
  const [fromDataUri, toDataUri] = await Promise.all([
    resizeImageForVLM(fromImageUrl),
    resizeImageForVLM(toImageUrl),
  ]);
  const fromSize = Math.round(fromDataUri.length / 1024);
  const toSize = Math.round(toDataUri.length / 1024);
  console.log(`[AITransitionAnalyzer] [${elapsed()}] Images resized (from: ${fromSize}KB, to: ${toSize}KB), sending to VLM…`);

  if (signal?.aborted) {
    throw new DOMException('Analysis cancelled', 'AbortError');
  }

  // Choose system prompt and user message based on whether we're expanding or generating
  const isExpanding = !!currentPrompt;
  const prompts = getSystemPrompts(videoModel);
  const systemPrompt = isExpanding ? prompts.expand : prompts.generate;
  const userText = isExpanding
    ? `Base prompt to expand:\n"${currentPrompt}"\n\nThe first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Expand the base prompt with specific details from these images.`
    : `The first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Write a transition prompt connecting these two views.`;

  // Use stream:true — the SDK's non-streaming path (stream:false) has a fragile
  // polling loop that silently hangs. Every working Sogni app uses streaming.
  const stream = await client.chat.completions.create({
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
    stream: true,
    max_tokens: prompts.maxTokens,
    temperature: 0.7,
    think: false,
    tokenType: 'spark',
  });
  console.log(`[AITransitionAnalyzer] [${elapsed()}] Stream created, awaiting first chunk…`);

  // Consume the stream with a timeout — collect all chunks into accumulated content.
  let content = '';
  let chunkCount = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; }, COMPLETION_TIMEOUT_MS);

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new DOMException('Analysis cancelled', 'AbortError');
      }
      if (timedOut) {
        throw new Error('AI prompt expansion timed out — the VLM worker may be unavailable. Try again later.');
      }
      chunkCount++;
      content += chunk.content || '';
      if (chunkCount === 1) {
        console.log(`[AITransitionAnalyzer] [${elapsed()}] First chunk received`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[AITransitionAnalyzer] [${elapsed()}] Complete — ${chunkCount} chunks, ${content.length} chars`);

  const prompt = cleanResponse(content);

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
        videoModel: seg.videoModel,
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
