# AI Transition Analyzer — Design Spec

## Overview

Integrate the Sogni Client SDK's LLM visual intelligence (multimodal chat completions with image analysis) into the transition video generation workflow. The LLM analyzes each segment's from/to image pair and crafts a detailed, scene-aware transition prompt that explicitly describes how specific visual elements should move and transform between the two frames.

## Problem

Current transition presets are generic — "Camera Orbit," "Cinematic Morph," etc. apply the same prompt to every segment regardless of what's actually in the images. A transition between a front-facing portrait and a side profile needs very different motion direction than a transition between two landscape shots. Users who want high-quality results must manually write custom prompts per segment, which is tedious for projects with many waypoints.

## Solution

Add an "AI Scene Analysis" preset that uses the Sogni VLM to analyze each segment's image pair and generate a unique, scene-aware prompt per segment. This appears in two places:

1. **TransitionConfigPanel** (batch): 5th preset in the dropdown. When selected and generation starts, the system first analyzes all segments via the LLM, then generates videos with per-segment prompts.
2. **TransitionRegenerateModal** (single): "Analyze with AI" button next to the prompt textarea. Clicking it analyzes the two images and populates the textarea with a generated prompt the user can review/edit before regenerating.

Frontend SDK mode only (requires authenticated user with Sogni Client access).

## Architecture

### New Service: `src/services/AITransitionAnalyzer.ts`

Core service that handles LLM interactions for transition prompt generation. Est. ~180 lines.

```typescript
interface AnalyzeTransitionOptions {
  fromImageUrl: string;
  toImageUrl: string;
  fromLabel?: string;
  toLabel?: string;
  signal?: AbortSignal; // For cancellation support
}

interface AnalyzeTransitionResult {
  prompt: string;
}

// Single segment analysis
async function analyzeTransition(options: AnalyzeTransitionOptions): Promise<AnalyzeTransitionResult>;

// Batch analysis for multiple segments
async function analyzeMultipleTransitions(
  segments: Array<{ segmentId: string } & AnalyzeTransitionOptions>,
  onSegmentComplete?: (segmentId: string, result: AnalyzeTransitionResult) => void,
  onSegmentError?: (segmentId: string, error: Error) => void,
  signal?: AbortSignal,
): Promise<Map<string, AnalyzeTransitionResult>>;
```

#### LLM Call Details

Full parameter set for `sogni.chat.completions.create()`:

```typescript
const result = await client.chat.completions.create({
  model: 'qwen3.5-35b-a3b-gguf-q4km',
  messages: [systemMessage, userMessage],
  stream: false,
  max_tokens: 512,
  temperature: 0.7,
  think: false,
  tokenType: 'spark',
});

// Defensive cleanup of response
let prompt = result.content
  .replace(/<think>[\s\S]*?<\/think>/g, '')
  .trim();
```

- **Model**: `qwen3.5-35b-a3b-gguf-q4km` (vision-capable)
- **Mode**: Non-streaming (`stream: false`) — we need the complete prompt text
- **Messages**: System prompt + one user message with two `image_url` content parts and a text instruction
- **Max tokens**: 512 (prompts should be concise, ~100-200 words)
- **Temperature**: 0.7 (creative but coherent)
- **Think mode**: `think: false` — not needed, wastes tokens. With `think: false`, the model should not produce `<think>` blocks, but as a defensive measure the response is cleaned with a regex strip.

#### System Prompt

```
You are a video transition prompt engineer for an AI video generator. You will receive two images: the FIRST is the starting frame, the SECOND is the ending frame of a short video clip (1-8 seconds).

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

Output ONLY the video generation prompt text, nothing else.
```

#### User Message Construction

```typescript
const userMessage: ChatMessage = {
  role: 'user',
  content: [
    { type: 'image_url', image_url: { url: fromImageDataUri } },
    { type: 'image_url', image_url: { url: toImageDataUri } },
    {
      type: 'text',
      text: `The first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Write a transition prompt connecting these two views.`
    }
  ]
};
```

Note: `detail` is omitted from `image_url` (defaults to `'auto'`). The VLM can identify subjects, poses, camera angles, and lighting at standard detail. Using `'high'` would increase cost without meaningful benefit for prompt generation.

#### Image Handling

Images must be sent as data URIs (base64) for the VLM.

**New shared utility**: `src/utils/imageConversion.ts` (~60 lines). This file consolidates image URL conversion logic currently duplicated in `TransitionGenerator.ts` (the private `imageUrlToBlob()` on lines 86-115).

Exports:
- `imageUrlToBlob(url: string): Promise<Blob>` — extracted from `TransitionGenerator.ts`
- `imageUrlToDataUri(url: string): Promise<string>` — calls `imageUrlToBlob`, then converts via `FileReader.readAsDataURL`

Both handle all URL types: `data:` (pass-through/decode), `http(s):` (fetch via `fetchS3AsBlob()` with CORS fallback), `blob:` (direct fetch).

`TransitionGenerator.ts` changes its private `imageUrlToBlob` to import from this shared utility.

#### Batch Parallelization

`analyzeMultipleTransitions` fires all LLM requests concurrently (same pattern as `generateMultipleTransitions`). The Sogni dePIN network handles concurrency across workers. Each segment gets its own independent LLM call.

#### Cancellation

Both `analyzeTransition` and `analyzeMultipleTransitions` accept an `AbortSignal`. Before each LLM call, the signal is checked — if aborted, the function throws `AbortError`. In batch mode, already-completed analyses are preserved (their prompts remain on segments), but no new LLM calls are started after abort.

#### Error Handling

- If a single segment's analysis fails: fall back to the default "Camera Orbit" preset prompt for that segment, continue with remaining segments
- If the SDK client is unavailable: throw immediately (caller should not have reached this point if `isFrontendMode()` is false)
- Non-retryable errors (insufficient balance): throw immediately with descriptive message
- Network errors: one retry with a short delay (500ms)
- Response validation: if prompt is empty or < 20 chars after cleanup, fall back to default preset

### Preset Integration

#### `src/constants/transitionPromptPresets.ts`

Add a new preset entry with a special `id`:

```typescript
{
  id: 'ai-scene-analysis',
  label: 'AI Scene Analysis',
  description: 'AI analyzes each image pair and writes a unique prompt per segment',
  prompt: '' // Empty — prompts are generated dynamically per-segment
}
```

The empty prompt serves as a sentinel value. When `selectedPresetId === 'ai-scene-analysis'`, the system knows to invoke the LLM analysis phase before video generation.

**Note**: The existing `Segment.prompt` field (line 66 of `types/index.ts`) already supports storing per-segment prompts — no type changes needed for `Segment`.

#### `findPresetByPrompt()` Behavior

Since AI-generated prompts are unique per-segment and won't match any preset, they will correctly show as "Custom" in the dropdown when recalled in the regenerate modal. This is the desired behavior — the user sees the actual generated prompt and can edit it.

#### `handlePresetChange` Guard

When `presetId === 'ai-scene-analysis'`, do NOT call `setTransitionPrompt(preset.prompt)` (which would set it to empty string). Instead, leave the transitionPrompt state unchanged — the UI will show placeholder text when this preset is selected, and the actual prompts are generated per-segment during the analysis phase.

### TransitionConfigPanel Changes

#### Preset Dropdown Filtering

The component filters the `TRANSITION_PROMPT_PRESETS` array at render time:

```typescript
const visiblePresets = useMemo(() =>
  TRANSITION_PROMPT_PRESETS.filter(p =>
    p.id !== 'ai-scene-analysis' || isFrontendMode()
  ),
  [/* isFrontendMode is stable */]
);
```

When "AI Scene Analysis" is selected:
- The textarea becomes read-only with italic placeholder text: *"AI will analyze each image pair and generate a unique prompt per segment."*
- The cost section appends *"+ AI analysis"* as a label (no precise LLM cost number — LLM cost is <10% of video generation cost and not worth the complexity of a separate estimator)

#### Analysis Progress UI

When analysis is in progress, the Generate button area shows: "Analyzing scenes... (3/8)" with a spinner. The button is disabled during analysis.

### Analysis Lifecycle Ownership

**Decision: Analysis runs in a dedicated hook, invoked from the container.**

The `useTransitionConfig` hook remains focused on config state. A new `src/hooks/useAITransitionAnalysis.ts` hook (~100 lines) owns the async analysis lifecycle:

```typescript
export function useAITransitionAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const analyzeSegments = useCallback(async (
    segments: Segment[],
    waypointImages: Map<string, string>,
    onSegmentPromptReady: (segmentId: string, prompt: string) => void,
  ): Promise<void> => { /* ... */ }, []);

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { isAnalyzing, analysisProgress, analyzeSegments, cancelAnalysis };
}
```

**Flow**: `useTransitionConfig.executeGeneration()` detects `selectedPresetId === 'ai-scene-analysis'`, sets `usePerSegmentPrompts: true` on settings, and calls `onStartGeneration(segments, settings)`. The container's `handleStartTransitionGeneration` checks `settings.usePerSegmentPrompts` and runs the analysis phase (via `useAITransitionAnalysis`) before proceeding to `generateMultipleTransitions`.

This keeps the analysis lifecycle in the container alongside other async generation state (`isTransitionGenerating`, etc.), which is the established pattern.

**Cancellation on unmount**: The container's cleanup function calls `cancelAnalysis()` if analysis is in progress. Already-analyzed segments keep their prompts on the `Segment` objects.

### TransitionGenerationSettings Update

Add a flag to indicate per-segment prompts should be used:

```typescript
export interface TransitionGenerationSettings {
  resolution: VideoResolution;
  quality: VideoQualityPreset;
  duration: number;
  transitionPrompt: string;
  musicSelection?: MusicSelection;
  usePerSegmentPrompts?: boolean; // NEW: when true, use segment.prompt instead of transitionPrompt
}
```

### Container (`Sogni360Container.tsx`) Changes

The actual function is `handleStartTransitionGeneration` (line 194), not `handleGenerateTransitions`.

When `settings.usePerSegmentPrompts` is true:

1. **Run analysis phase first**: Call `analyzeSegments()` from `useAITransitionAnalysis`. For each segment, fetch from/to images, run LLM analysis, dispatch `UPDATE_SEGMENT` with the generated prompt.
2. **Then run video generation**: Call `generateMultipleTransitions` as normal. The per-segment prompt is used because of the `TransitionGenerator.ts` change below.

The `onSegmentStart` callback (line 301) currently hardcodes the shared prompt:
```typescript
onSegmentStart: (segmentId) => {
  updateSegment(segmentId, { status: 'generating', progress: 0, prompt });
}
```
When `usePerSegmentPrompts` is true, this must preserve the segment's existing `.prompt` instead of overwriting with the shared prompt. Change to:
```typescript
prompt: usePerSegmentPrompts ? undefined : prompt  // undefined = don't overwrite
```

**`handleRedoSegment` (line 345)**: No changes needed. It already reads the segment's stored `.prompt` field as the first fallback (the user may have edited it in the regenerate modal). If the segment was originally generated with an AI-analyzed prompt, that prompt is already stored on the segment.

### TransitionGenerator Changes

In `generateMultipleTransitions` > `processSegment` closure (line ~550), the prompt currently comes from `options.prompt`:

```typescript
const result = await generateTransition({
  segment,
  fromImageUrl,
  toImageUrl,
  prompt, // <-- shared for all segments
  ...
});
```

Change to:
```typescript
const effectivePrompt = segment.prompt || prompt;
const result = await generateTransition({
  segment,
  fromImageUrl,
  toImageUrl,
  prompt: effectivePrompt,
  ...
});
```

This is a one-line change. When `segment.prompt` is set (from AI analysis), it takes precedence. Otherwise falls back to the shared prompt from options. This change is safe for all existing flows — segments without a `.prompt` field continue to use the shared prompt.

### TransitionRegenerateModal Changes

Add an "Analyze with AI" button:

```
┌─ Regenerate Transition ──────────────────────────────┐
│                                                       │
│  [From thumb] ──→ [To thumb]                         │
│                                                       │
│  Transition Description              [Reset to Default]│
│  ┌─ Preset dropdown ─────────────────────────────┐   │
│  │ Camera Orbit — Best for AI-generated...       │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ Textarea ────────────────────────────────────┐   │
│  │ Smooth camera orbit around the subject...     │   │
│  │                                               │   │
│  └───────────────────────────────────────────────┘   │
│  [✨ Analyze with AI]                                 │
│  Select a preset above or customize the prompt.       │
│                                                       │
│  Resolution 720×1280  Quality Balanced  Duration 1.5s │
│                                                       │
│  12 SPARK ≈ $0.05          [Cancel] [Regenerate]     │
└───────────────────────────────────────────────────────┘
```

- Button position: Below the textarea, left-aligned
- Only visible when `isFrontendMode()` is true
- Click behavior:
  1. Button shows loading spinner, textarea becomes read-only
  2. LLM analyzes the two images via `analyzeTransition()`
  3. Generated prompt replaces textarea content
  4. Preset dropdown switches to "Custom"
  5. User can edit, then click Regenerate as normal
- If analysis fails: show toast error, textarea unchanged

### TransitionReviewPanel — No Changes Needed

`TransitionReviewPanel.tsx` already correctly handles per-segment prompts. When opening the regenerate modal, it passes `currentPrompt={regenerateModalSegment.prompt || currentProject?.settings.transitionPrompt}` (line 565). AI-generated per-segment prompts stored on the segment will be correctly displayed.

### Cost Display

- LLM chat cost: ~0.5-2 SPARK per segment analysis (input tokens for 2 images + system prompt + output ~150 words)
- Video generation cost: ~10-50+ SPARK per segment depending on resolution/quality/duration
- LLM cost is <10% of total cost in most cases
- **Display approach**: When AI Scene Analysis is selected, append "+ AI analysis" text label to the existing cost display. No separate precise LLM cost estimator — the complexity isn't justified given the proportionally small cost. Users see the video generation cost (which dominates) plus a qualitative indicator.

## Data Flow

### Batch Flow (TransitionConfigPanel → Container)

```
User selects "AI Scene Analysis" preset
  → Textarea becomes read-only with placeholder
  → User clicks "Generate N Transition Videos"
  → useTransitionConfig.executeGeneration():
    → Sets usePerSegmentPrompts: true on settings
    → Calls onStartGeneration(segments, settings)
  → Container.handleStartTransitionGeneration(segments, settings):
    → Detects settings.usePerSegmentPrompts === true
    → Phase 1 — Analysis:
      → analyzeSegments(pendingSegments, waypointImages, onPromptReady)
      → For each segment (parallel):
        → imageUrlToDataUri(fromImageUrl), imageUrlToDataUri(toImageUrl)
        → client.chat.completions.create({
            model, messages, stream: false, max_tokens: 512,
            temperature: 0.7, think: false, tokenType: 'spark'
          })
        → Clean response, validate prompt
        → dispatch(UPDATE_SEGMENT, { id, updates: { prompt } })
        → Progress: "Analyzing scenes... (3/8)"
      → All prompts populated (or fallen back to default)
    → Phase 2 — Video Generation:
      → generateMultipleTransitions(segments, waypointImages, options)
      → processSegment uses segment.prompt || options.prompt
      → Normal video generation continues
```

### Single Segment Flow (TransitionRegenerateModal)

```
User opens regenerate modal for a segment
  → Sees "Analyze with AI" button below textarea (if isFrontendMode())
  → Clicks button
  → analyzeTransition({ fromImageUrl, toImageUrl, fromLabel, toLabel })
    → Fetch images as data URIs
    → client.chat.completions.create({ ... })
    → Clean and validate response
  → Generated prompt populates textarea, dropdown shows "Custom"
  → User reviews/edits prompt
  → User clicks "Regenerate"
  → onConfirm(editedPrompt) — normal flow continues
```

## Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `src/services/AITransitionAnalyzer.ts` | LLM analysis service | ~180 |
| `src/utils/imageConversion.ts` | Shared image URL → Blob/DataURI converter (extracted from TransitionGenerator) | ~60 |
| `src/hooks/useAITransitionAnalysis.ts` | Hook managing analysis lifecycle, progress, and cancellation | ~100 |

## Files to Modify

| File | Changes |
|------|---------|
| `src/constants/transitionPromptPresets.ts` | Add "AI Scene Analysis" preset entry |
| `src/hooks/useTransitionConfig.ts` | Guard `handlePresetChange` for AI preset (don't set empty prompt), set `usePerSegmentPrompts` flag in settings |
| `src/components/TransitionConfigPanel.tsx` | Filter AI preset by `isFrontendMode()`, read-only textarea + placeholder when AI selected, analysis progress display |
| `src/components/TransitionRegenerateModal.tsx` | Add "Analyze with AI" button with loading state, gated by `isFrontendMode()` |
| `src/components/Sogni360Container.tsx` | In `handleStartTransitionGeneration`: run analysis phase when `usePerSegmentPrompts`, preserve segment.prompt in `onSegmentStart` |
| `src/services/TransitionGenerator.ts` | In `processSegment`: use `segment.prompt \|\| prompt` for per-segment prompt support; replace private `imageUrlToBlob` with import from shared `imageConversion.ts` |

## Gating & Visibility

- "AI Scene Analysis" preset: visible only when `isFrontendMode() === true`
- "Analyze with AI" button: visible only when `isFrontendMode() === true`
- Both disappear entirely for demo/unauthenticated users — no teaser, no disabled state
- No backend proxy routes needed

## Testing Strategy

- Unit test `AITransitionAnalyzer` with mocked SDK client
- Unit test `imageConversion.ts` with various URL types (http, blob, data)
- Integration test: verify preset appears only in frontend mode
- Integration test: verify batch flow populates per-segment prompts before generation
- Manual test: run full batch generation with AI analysis on a real project
- Manual test: use "Analyze with AI" in regenerate modal, verify prompt quality

## Edge Cases

1. **User switches preset after selecting AI Scene Analysis**: If user selects AI Scene Analysis then switches to Camera Orbit before clicking Generate, `selectedPresetId` changes and `usePerSegmentPrompts` won't be set. The shared prompt is used. Safe.
2. **Mixed segment states**: In a project where some segments are ready and some pending, only pending segments get analyzed. Ready segments keep their existing prompts.
3. **Large projects (many segments)**: Many parallel LLM calls. The dePIN network handles this, but show progress per-segment. If the network is slow, individual segments may take 5-15s each but run in parallel.
4. **Image fetch failures**: If a waypoint image can't be fetched as a data URI (expired S3 URL), skip that segment's analysis and fall back to the default preset prompt.
5. **LLM returns unusable content**: If the response is empty, too short (<20 chars), or contains formatting artifacts, clean with `response.replace(/<think>[\s\S]*?<\/think>/g, '').trim()` and fall back to default preset if still unusable.
6. **Panel closed during analysis**: Container's cleanup calls `cancelAnalysis()`. Already-analyzed segments keep their prompts. Generation does not start. User can re-open panel and try again — segments with prompts from the previous attempt will use those prompts if the user selects a non-AI preset, or get re-analyzed if AI preset is selected again.
7. **Insufficient balance mid-batch**: If balance runs out during batch analysis, completed analyses are preserved. The error is surfaced to the user. They can re-generate with the already-analyzed prompts (which are stored on segments) without re-running analysis.
