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

Core service that handles LLM interactions for transition prompt generation.

```typescript
interface AnalyzeTransitionOptions {
  fromImageUrl: string;
  toImageUrl: string;
  fromLabel?: string;
  toLabel?: string;
  onProgress?: (status: string) => void;
}

interface AnalyzeTransitionResult {
  prompt: string;
  analysis?: {
    fromDescription: string;
    toDescription: string;
    motionType: string;
  };
}

// Single segment analysis
async function analyzeTransition(options: AnalyzeTransitionOptions): Promise<AnalyzeTransitionResult>;

// Batch analysis for multiple segments
async function analyzeMultipleTransitions(
  segments: Array<{ segmentId: string } & AnalyzeTransitionOptions>,
  onSegmentComplete?: (segmentId: string, result: AnalyzeTransitionResult) => void,
  onSegmentError?: (segmentId: string, error: Error) => void,
): Promise<Map<string, AnalyzeTransitionResult>>;
```

#### LLM Call Details

- **Model**: `qwen3.5-35b-a3b-gguf-q4km` (vision-capable)
- **Mode**: Non-streaming (`stream: false`) — we need the complete prompt text
- **Messages**: System prompt + one user message with two `image_url` content parts and a text instruction
- **Max tokens**: 512 (prompts should be concise, ~100-200 words)
- **Temperature**: 0.7 (creative but coherent)
- **Think mode**: Disabled (not needed, wastes tokens)

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
    { type: 'image_url', image_url: { url: fromImageDataUri, detail: 'high' } },
    { type: 'image_url', image_url: { url: toImageDataUri, detail: 'high' } },
    {
      type: 'text',
      text: `The first image is the starting frame (${fromLabel || 'start'}). The second image is the ending frame (${toLabel || 'end'}). Write a transition prompt connecting these two views.`
    }
  ]
};
```

#### Image Handling

Images must be sent as data URIs (base64) for the VLM. Reuse the existing `imageUrlToBlob()` pattern from `TransitionGenerator.ts`:
- S3/HTTP URLs → fetch via `fetchS3AsBlob()` (with CORS fallback) → convert to data URI
- blob: URLs → fetch → data URI
- data: URLs → pass through directly

Create a shared utility `imageUrlToDataUri(url: string): Promise<string>` that handles all URL types.

#### Batch Parallelization

`analyzeMultipleTransitions` fires all LLM requests concurrently (same pattern as `generateMultipleTransitions`). The Sogni dePIN network handles concurrency across workers. Each segment gets its own independent LLM call.

#### Error Handling

- If a single segment's analysis fails: fall back to the default "Camera Orbit" preset prompt for that segment, continue with remaining segments
- If the SDK client is unavailable: throw immediately (caller should not have reached this point if `isFrontendMode()` is false)
- Non-retryable errors (insufficient balance): throw immediately with descriptive message
- Network errors: one retry with a short delay (500ms)

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

#### `findPresetByPrompt()` Behavior

Since AI-generated prompts are unique per-segment and won't match any preset, they will correctly show as "Custom" in the dropdown when recalled in the regenerate modal. This is the desired behavior — the user sees the actual generated prompt and can edit it.

### TransitionConfigPanel Changes

#### Preset Dropdown

The "AI Scene Analysis" option only appears when `isFrontendMode()` is true. When selected:

- The textarea becomes read-only with italic placeholder text: *"AI will analyze each image pair and generate a unique prompt per segment."*
- The cost section adds a note: *"+ AI analysis cost"* (LLM cost is minimal relative to video generation)

#### Generation Flow Modification

When `selectedPresetId === 'ai-scene-analysis'` and the user clicks Generate:

1. **Analysis phase**: Call `analyzeMultipleTransitions()` for all pending segments
   - Show progress in the UI: "Analyzing scenes... (3/8)"
   - Store each generated prompt in the segment's `prompt` field via `UPDATE_SEGMENT` dispatch
2. **Generation phase**: Proceed to normal video generation, but use per-segment prompts instead of a single shared prompt

This requires a modification to how `executeGeneration` passes prompts to the container's `onStartGeneration` callback.

### `useTransitionConfig` Hook Changes

Add state for the analysis phase:

```typescript
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
```

When `selectedPresetId === 'ai-scene-analysis'`:
- `executeGeneration` first runs the LLM analysis phase
- After analysis completes, each segment in `reconciledSegments` has its `.prompt` populated
- Then proceeds to call `onStartGeneration` as normal

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

In `handleGenerateTransitions`, when `settings.usePerSegmentPrompts` is true:
- Pass each segment's individual `.prompt` to `generateTransition()` instead of the shared `settings.transitionPrompt`
- The existing `generateMultipleTransitions` already takes segments and options; modify it to check `segment.prompt` first, falling back to `options.prompt`

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
  2. LLM analyzes the two images
  3. Generated prompt replaces textarea content
  4. Preset dropdown switches to "Custom"
  5. User can edit, then click Regenerate as normal
- If analysis fails: show toast error, textarea unchanged

### Cost Considerations

- LLM chat cost: ~0.5-2 SPARK per segment analysis (input tokens for 2 images + system prompt + output ~150 words)
- Video generation cost: ~10-50+ SPARK per segment depending on resolution/quality/duration
- LLM cost is <10% of total cost in most cases
- Display approach: In the batch panel, when AI Scene Analysis is selected, append "+ AI analysis" to the cost display. Exact LLM cost estimation uses `sogni.chat.estimateCost()`.

## Data Flow

### Batch Flow (TransitionConfigPanel)

```
User selects "AI Scene Analysis" preset
  → User clicks "Generate N Transition Videos"
  → executeGeneration() detects ai-scene-analysis preset
  → Phase 1: analyzeMultipleTransitions(pendingSegments, waypointImages)
    → For each segment (parallel):
      → Fetch from/to images as data URIs
      → sogni.chat.completions.create({ messages: [system, user(img1, img2, text)] })
      → Extract prompt from response.content
      → dispatch(UPDATE_SEGMENT, { id, updates: { prompt } })
      → onSegmentComplete callback
    → All prompts populated
  → Phase 2: onStartGeneration(segments, settings) with usePerSegmentPrompts: true
    → Container's handleGenerateTransitions reads segment.prompt for each
    → generateMultipleTransitions uses per-segment prompts
    → Normal video generation continues
```

### Single Segment Flow (TransitionRegenerateModal)

```
User opens regenerate modal for a segment
  → Sees "Analyze with AI" button below textarea
  → Clicks button
  → analyzeTransition({ fromImageUrl, toImageUrl, fromLabel, toLabel })
    → Fetch images as data URIs
    → sogni.chat.completions.create({ messages: [system, user(img1, img2, text)] })
    → Extract prompt from response.content
  → Generated prompt populates textarea
  → User reviews/edits prompt
  → User clicks "Regenerate"
  → onConfirm(editedPrompt) — normal flow continues
```

## Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `src/services/AITransitionAnalyzer.ts` | LLM analysis service | ~180 |
| `src/utils/imageUrlToDataUri.ts` | Shared image-to-data-URI converter | ~50 |

## Files to Modify

| File | Changes |
|------|---------|
| `src/constants/transitionPromptPresets.ts` | Add "AI Scene Analysis" preset entry |
| `src/hooks/useTransitionConfig.ts` | Add analysis phase state, modify executeGeneration for AI preset |
| `src/components/TransitionConfigPanel.tsx` | Conditionally show AI preset, read-only textarea when AI selected, analysis progress UI |
| `src/components/TransitionRegenerateModal.tsx` | Add "Analyze with AI" button with loading state |
| `src/components/Sogni360Container.tsx` | Support per-segment prompts in handleGenerateTransitions |
| `src/services/TransitionGenerator.ts` | Support segment-level prompt override in generateTransition |

## Gating & Visibility

- "AI Scene Analysis" preset: visible only when `isFrontendMode() === true`
- "Analyze with AI" button: visible only when `isFrontendMode() === true`
- Both disappear entirely for demo/unauthenticated users — no teaser, no disabled state
- No backend proxy routes needed

## Testing Strategy

- Unit test `AITransitionAnalyzer` with mocked SDK client
- Unit test `imageUrlToDataUri` with various URL types (http, blob, data)
- Integration test: verify preset appears only in frontend mode
- Integration test: verify batch flow populates per-segment prompts before generation
- Manual test: run full batch generation with AI analysis on a real project
- Manual test: use "Analyze with AI" in regenerate modal, verify prompt quality

## Edge Cases

1. **User switches preset after AI analysis**: If user selects AI Scene Analysis, generates prompts, then switches to Camera Orbit before starting video generation — the shared prompt should override per-segment prompts. The `usePerSegmentPrompts` flag handles this.
2. **Mixed segment states**: In a project where some segments are ready and some pending, only pending segments get analyzed. Ready segments keep their existing prompts.
3. **Large projects (many segments)**: Many parallel LLM calls. The dePIN network handles this, but show progress per-segment. If the network is slow, individual segments may take 5-15s each but run in parallel.
4. **Image fetch failures**: If a waypoint image can't be fetched as a data URI (expired S3 URL), skip that segment's analysis and fall back to the default preset prompt.
5. **LLM returns unusable content**: If the response is empty, too short (<20 chars), or contains formatting artifacts (`<think>` blocks, markdown), clean it up or fall back to default.
