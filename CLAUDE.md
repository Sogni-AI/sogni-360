# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🚨 NEVER RUN PRODUCTION DEPLOYMENTS

**Claude must NEVER run `npm run deploy:production` or any production deployment commands.** Always let the user run deployments themselves. You may prepare the build and verify it passes, but the actual deployment command must be executed by the user.

---

## 🚨 CRITICAL: Frontend SDK vs Backend Proxy Architecture

**UNDERSTAND THIS BEFORE WRITING ANY GENERATION CODE.**

This app has TWO modes for communicating with Sogni:

### 1. Frontend SDK Mode (Direct Connection)
When user is logged in via the frontend Sogni SDK (`authMode === 'frontend'`):
- User has a direct WebSocket connection to Sogni
- Jobs should use `getSogniClient().projects.create()` directly
- Charges go to the **user's wallet**
- Faster (no proxy latency)
- Check with `isFrontendMode()` from `src/services/frontend/index.ts`

### 2. Backend Proxy Mode (Demo Mode)
When user is NOT logged in or in demo mode:
- Jobs go through the Express backend at `/api/sogni/*`
- Backend has its own Sogni credentials in `server/.env`
- Charges go to the **backend's account** (app owner pays)
- SSE progress events come from backend

### ⚠️ CRITICAL MISTAKES TO AVOID

1. **NEVER proxy through backend when user is logged in via frontend SDK**
   - This wastes the backend's credits, not the user's
   - Adds unnecessary latency
   - Makes "insufficient funds" errors confusing (wrong wallet)

2. **ALWAYS check `isFrontendMode()` before making generation calls**
   - If true: use SDK directly via `getSogniClient()`
   - If false: use `api.*` methods that go through backend

3. **Generation services that MUST support both modes:**
   - `CameraAngleGenerator.ts` - image generation ✅
   - `TransitionGenerator.ts` - video generation ✅
   - `ImageEnhancer.ts` - image enhancement (needs update)

4. **Cost estimation:** Can use backend since it's read-only and doesn't charge

### Code Pattern
```typescript
import { isFrontendMode, getSogniClient } from './frontend';

export async function generateSomething(options) {
  const useFrontendSDK = isFrontendMode();

  if (useFrontendSDK) {
    const client = getSogniClient();
    const project = await client.projects.create(projectOptions);
    // Handle project events directly
  } else {
    const { projectId } = await api.generateSomething(options);
    // Subscribe to SSE events via api.subscribeToProgress()
  }
}
```

---

## 🚨 CRITICAL: S3 Image URLs and CORS with Concurrent Requests

**AWS S3 signed URLs have a CORS issue when multiple requests are made simultaneously.**

### The Problem

- S3 image URLs (e.g., `complete-images-production.s3-accelerate.amazonaws.com`) work **100% of the time when requests are spaced apart**
- When multiple S3 URLs are fetched **concurrently** (e.g., `Promise.all([fetch(url1), fetch(url2), ...])`), **some requests randomly fail with CORS errors**
- The browser reports: `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- This is NOT a problem with the URLs themselves - they are valid and work individually

### The Cause

This appears to be an S3/CloudFront behavior where concurrent requests from the same origin sometimes receive inconsistent CORS headers. The exact cause is AWS infrastructure-related, not something we can fix on our end.

### The Solution: Retry with Jitter, then Proxy Fallback

**Use `src/utils/s3FetchWithFallback.ts`** - a shared utility that:

1. **Tries direct fetch first** (faster, no backend load)
2. **On CORS failure, retries with 1-3 second random jitter** (breaks lockstep retries)
3. **After 2 direct failures, falls back to backend proxy** (100% reliable)

```typescript
import { fetchS3AsBlob, fetchS3WithFallback } from '../utils/s3FetchWithFallback';

// For images - returns Blob
const blob = await fetchS3AsBlob(s3Url);

// For general fetch - returns Response
const response = await fetchS3WithFallback(s3Url);
```

The utility handles:
- Detecting S3 URLs automatically
- Random jitter (1-3 seconds) between retries to prevent thundering herd
- Automatic fallback to `/api/sogni/proxy-image` after CORS failures
- Works for both images AND videos

### Important Notes

1. **`<img>` tags are NOT affected** - browsers handle CORS differently for image elements vs fetch()
2. **Single requests usually work fine** - the issue mainly manifests with concurrent requests
3. **Jitter helps break up lockstep retries** - concurrent failures won't all retry at the same moment
4. **Proxy is the final fallback** - only used after direct attempts fail, minimizing backend load

### Files That Use This Utility

Any service that fetches S3 images/videos to convert to blobs for SDK submission:
- `TransitionGenerator.ts` - fetches waypoint images for video generation
- `CameraAngleGenerator.ts` - may fetch source images
- `ImageEnhancer.ts` - fetches images for enhancement

### Copying to Other Projects

This solution can be copied to other projects (e.g., Photobooth):
1. Copy `src/utils/s3FetchWithFallback.ts`
2. Ensure backend has `/api/sogni/proxy-image` endpoint (see `server/routes/sogni.js`)
3. Import and use `fetchS3AsBlob` or `fetchS3WithFallback` in place of direct `fetch()`

---

## 🚨 FILE SIZE LIMIT: 300 LINES MAX

**No code file should exceed 300 lines.** Break large files into smaller, focused modules.

Components over 300 lines MUST be split:
- Extract sub-components into separate files
- Extract hooks into `/hooks/` directory
- Extract utilities into `/utils/` directory
- Extract constants into `/constants/` directory

Current violations to fix:
- `CameraAngle3DControl.tsx` (922 lines) → Split into Card/Full/Compact modes
- `frontendSogniAdapter.ts` (811 lines) → Split by feature domain
- `OrbitalChoreographer.tsx` (775 lines) → Extract hooks and sub-components
- `MultiAngleGenerator.ts` (510 lines) → Split generator logic
- `AppContext.tsx` (492 lines) → Extract reducers and hooks
- `Sogni360Container.tsx` (476 lines) → Extract modal components

## 🚨 SCREENSHOT VERIFICATION (USE BEFORE PRESENTING WORK)

Run the screenshot script to verify visual output before presenting work:

```bash
# Desktop (1440x900)
node scripts/screenshot.mjs https://360-local.sogni.ai /tmp/check-desktop.png

# Mobile (375x812)
node scripts/screenshot.mjs https://360-local.sogni.ai /tmp/check-mobile.png /Users/markledford/Pictures/1.jpg 375 812
```

Then READ the screenshot files to visually verify:
- No duplicate headers/titles
- No duplicate close buttons
- Aspect ratios preserved
- No horizontal scrollbars
- Layout looks intentional, not broken

## 🚨 MANDATORY PRE-COMMIT AUDIT PROCESS

**BEFORE presenting ANY work to the user for review, Claude MUST complete this audit process. The user's time is extremely valuable - do not waste it with incomplete or sloppy work.**

### Audit Execution Steps

After completing implementation but BEFORE asking for user review:

#### Step 1: Build Verification
```bash
npm run build
```
- Must complete with zero errors
- Warnings should be reviewed and addressed if relevant

#### Step 2: Visual Audit (REQUIRED for any UI changes)

Open the app and manually verify each of these. Do not skip any.

**Aspect Ratio Check:**
- [ ] Upload a portrait image (taller than wide)
- [ ] Upload a landscape image (wider than tall)
- [ ] Verify ALL thumbnails/previews display at correct aspect ratio
- [ ] If any image appears distorted or forced square → FIX BEFORE PROCEEDING

**Readability Check:**
- [ ] Can all text be read without effort?
- [ ] Is any text abbreviated when it shouldn't be?
- [ ] Is any text smaller than 12px?
- [ ] If any issues → FIX BEFORE PROCEEDING

**Usability Check:**
- [ ] Test on mobile viewport (375px width in dev tools)
- [ ] Test on desktop viewport (1440px width)
- [ ] Can all buttons/controls be easily tapped/clicked?
- [ ] Are touch targets at least 44px?
- [ ] If any issues → FIX BEFORE PROCEEDING

**Layout Check:**
- [ ] Is content properly spaced and aligned?
- [ ] Does anything overflow or get cut off?
- [ ] Is the visual hierarchy clear?
- [ ] If any issues → FIX BEFORE PROCEEDING

#### Step 3: Functional Audit

- [ ] Does the feature work as intended?
- [ ] Test the happy path completely
- [ ] Test at least one error case
- [ ] Test empty state if applicable

#### Step 4: Self-Critique

Look at your implementation and ask:
- "Would I be embarrassed if this was shown to stakeholders?"
- "Is this the quality of a polished product demo?"
- "Did I cut any corners that will be obvious to the user?"

If ANY answer suggests the work is subpar → FIX BEFORE PROCEEDING

### Audit Report Format

When presenting work, Claude MUST include this audit summary:

```
## Pre-Commit Audit Completed ✓

**Build:** ✓ Passes with no errors
**Aspect Ratios:** ✓ Tested portrait and landscape - displays correctly
**Readability:** ✓ All text 12px+, no abbreviations
**Mobile (375px):** ✓ Tested - [specific observations]
**Desktop (1440px):** ✓ Tested - [specific observations]
**Touch Targets:** ✓ All interactive elements 44px+
**Functionality:** ✓ Tested happy path and [specific test cases]

**Screenshots/Evidence:** [If applicable, describe what was visually verified]

Ready for review.
```

### If Audit Fails

Do NOT present work to user. Instead:
1. Fix all failing items
2. Re-run the audit
3. Only proceed when ALL checks pass

### Exceptions

The only exception to this audit is pure documentation changes or non-UI backend changes. Even then, build verification is required.

---

## ⚠️ MANDATORY QUALITY STANDARDS - READ BEFORE ANY IMPLEMENTATION

**STOP. Before writing ANY code, read and internalize these principles. Sloppy, rushed work is unacceptable. Take the time to do it right.**

### Core Philosophy

This app is a **"SuperApp" demo** showcasing Sogni's capabilities. The user experience must be **EXCEPTIONAL** - polished, thoughtful, and delightful. Every detail matters. Mediocre is not acceptable.

### 🔴 CRITICAL: Aspect Ratio Preservation - ABSOLUTE REQUIREMENT

**ASPECT RATIO MUST BE PRESERVED AT ALL COSTS. NO EXCEPTIONS.**

The source image's aspect ratio is SACRED. This is non-negotiable:

- **ALL images** must display at their original aspect ratio - thumbnails, previews, cards, comparisons, EVERYTHING
- **NEVER** use `aspect-ratio: 1` or `object-fit: cover` on user-uploaded content
- **ALWAYS** use `object-fit: contain` or calculate dimensions from `sourceImageDimensions`
- **ADAPTIVE LAYOUTS ARE REQUIRED**: When displaying multiple images together:
  - Portrait images (height > width): Display SIDE BY SIDE horizontally
  - Landscape images (width > height): Display STACKED VERTICALLY (top to bottom)
  - This ensures both images fit naturally without distortion
- **CHECK `isPortrait`**: Always compute `const isPortrait = height > width` and use it to conditionally apply layout classes
- If you find yourself squishing, stretching, or cropping user images - **STOP AND FIX IT**

```typescript
// ALWAYS do this check when displaying user images
const isPortrait = sourceImageDimensions.height > sourceImageDimensions.width;
// Then apply: className={isPortrait ? 'layout-horizontal' : 'layout-vertical'}
```

### 🔴 CRITICAL: No Abbreviated UI

**Abbreviations destroy usability. Write full, clear labels.**

- ❌ WRONG: "C", "M", "W", "⬆", "↑", "•", "↓"
- ✅ RIGHT: "Close-up", "Medium", "Wide", "High", "Up", "Eye", "Low"
- ❌ WRONG: Cramped 9px text, buttons users can't tap
- ✅ RIGHT: 12px+ text, 44px+ touch targets, readable at a glance

If text doesn't fit, **make the container larger**, don't shrink the text.

### 🔴 CRITICAL: Holistic Design Thinking

Before implementing any feature, ask:

1. **What does the user expect?** - Design for their mental model, not yours
2. **How does this feel on mobile?** - Touch targets, scrolling, thumb zones
3. **How does this feel on desktop?** - Hover states, keyboard navigation, larger displays
4. **Is this visually balanced?** - Proper spacing, hierarchy, alignment
5. **Would I be proud to show this?** - If no, don't ship it

### 🔴 CRITICAL: Implementation Quality

- **Take 20 minutes over 1 minute** if it results in 2x better UX
- **Test on both mobile and desktop** before considering work complete
- **Audit your own work** - look at it critically, find the flaws, fix them
- **No TODO comments** for essential functionality - finish the job
- **No placeholder implementations** - if it's worth building, build it right

### Anti-Patterns to AVOID

1. **Quick hacks** - They compound into unmaintainable code
2. **"It works"** - Working is the minimum bar, not the goal
3. **Fixed pixel sizes** - Use responsive units (rem, %, vw/vh)
4. **Ignoring edge cases** - Empty states, loading, errors all need design
5. **Copy-paste without understanding** - Know why code works before using it
6. **Incrementally patching** - Sometimes delete and redesign from scratch

### Quality Checklist (MANDATORY before completing any UI task)

```
[ ] Aspect ratios preserved for all user content
[ ] Text is readable (12px+ body, 14px+ buttons)
[ ] Touch targets are 44px+ minimum
[ ] Works on mobile viewport (375px width)
[ ] Works on desktop viewport (1440px+ width)
[ ] No abbreviations - full words used
[ ] Loading states designed
[ ] Error states designed
[ ] Empty states designed
[ ] Hover/active states for interactive elements
[ ] Keyboard accessible where applicable
[ ] Visual hierarchy is clear
[ ] Spacing is consistent and intentional
[ ] Would I be proud to demo this? YES
```

---

## Design System Standards

### 🎨 Visual Design Language: "Liquid Glass"

**This app follows a premium visual style inspired by DJI.com, GoPro, and Apple's Liquid Glass aesthetic.**

Key principles:
- **Frosted glass effects** - Use `backdrop-filter: blur(16-24px)` with semi-transparent backgrounds
- **Subtle transparency** - Backgrounds at 0.85-0.95 opacity, borders at 0.1-0.2 opacity
- **Soft gradients** - Subtle color transitions, never harsh or flat
- **Generous rounded corners** - 16-24px for modals/cards, 8-12px for buttons/inputs
- **Depth through layering** - Multiple translucent layers create visual hierarchy
- **Clean minimalism** - Ample whitespace, clear typography, no visual clutter
- **Premium feel** - Every element should feel intentional and polished

**Color Palette:**
- Primary gradient: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` (indigo to purple)
- Dark backgrounds: `rgba(20-30, 20-30, 30-40, 0.95-0.98)`
- Glass surfaces: `rgba(255, 255, 255, 0.03-0.08)` with blur
- Borders: `rgba(255, 255, 255, 0.08-0.15)`
- Text: White at 1.0 for headings, 0.7-0.85 for body, 0.5-0.6 for muted

**Modal/Card Pattern:**
```css
.glass-card {
  background: linear-gradient(135deg, rgba(30, 30, 40, 0.95) 0%, rgba(20, 20, 30, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
```

**Button Pattern:**
```css
.primary-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}
.secondary-button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Typography
- **Minimum body text**: 12px (0.75rem)
- **Button/label text**: 14px (0.875rem) minimum
- **Headings**: 16px+ with clear hierarchy
- **Line height**: 1.4-1.6 for readability
- **Font weight**: Use 400 for body, 500-600 for emphasis

### Spacing
- **Base unit**: 4px (0.25rem)
- **Minimum padding**: 8px (0.5rem)
- **Card padding**: 12-16px (0.75-1rem)
- **Gap between elements**: 8-16px
- **Touch target padding**: Ensure 44px minimum clickable area

### Interactive Elements
- **Button minimum height**: 44px (touch-friendly)
- **Button padding**: 12px 24px minimum
- **Hover states**: Always provide visual feedback
- **Active/pressed states**: Visible state change
- **Focus states**: Visible for keyboard navigation

### Cards & Containers
- **Border radius**: 8-16px for cards, 4-8px for small elements
- **Background opacity**: 0.05-0.1 for subtle surfaces
- **Border opacity**: 0.1-0.2 for subtle borders
- **Shadow**: Use sparingly, prefer borders

### Images & Media
- **ALWAYS preserve aspect ratio** of user content
- Use `object-fit: cover` for fixed containers WITH proper aspect ratio
- Use `object-fit: contain` when space is flexible
- Thumbnails should match source aspect ratio, not be forced square

### Responsive Breakpoints
- **Mobile**: < 768px (primary design target)
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px
- Design mobile-first, enhance for larger screens

---

## Project Overview

Sogni 360 is a "SuperApp" demo application for sogni.ai that creates immersive 360° orbital portraits. It leverages the Sogni Supernet dePIN creative AI inference network via the Multiple Angles LoRA to generate character/environment perspective changes from a single portrait image.

**Product Vision:**
- Full-screen, no-scrollbar immersive experience on desktop and mobile
- Users upload a portrait, select camera angles (from 96 possible orientations), batch render all angles
- Video transitions are generated between adjacent waypoints, creating seamless loops
- The experience should feel like rotating a 3D character with smooth video transitions on each click/swipe
- First-time users see a pre-rendered demo experience showing how the app works

**Camera Angle System:**
- 8 Azimuths × 4 Elevations × 3 Distances = 96 total orientations
- Default preset: eye-level + close-up + front/left/back/right (4 angles + original)
- Waypoints can be marked as "original" to use the source image directly (no generation cost)

## Development Commands

```bash
# Install all dependencies (includes server via prepare script)
npm install

# Configure backend
cp server/.env.example server/.env  # Add SOGNI_USERNAME, SOGNI_PASSWORD, SOGNI_ENV

# Run development servers (requires both)
cd server && npm run dev    # Terminal 1: Backend API (port 3002)
npm run dev                 # Terminal 2: Frontend (port 5180)

# Build
npm run build               # Production build (tsc + vite)
npm run build:staging       # Staging build

# Testing & Linting
npm test                    # Jest unit tests
npm run test:watch          # Jest watch mode
npm run lint                # ESLint (must pass with 0 warnings)
npm run validate:useeffect  # CRITICAL: Validate useEffect patterns before committing
```

## 🚨 useEffect Rules (MANDATORY)

Every useEffect must pass `npm run validate:useeffect` before committing.

**Golden Rule**: Each effect has ONE responsibility.

### 🚫 NEVER Add to Dependency Arrays

These cause infinite re-render loops or unnecessary re-runs:

1. **Functions** - `initializeSogni`, `handleClick`, `fetchData`, `updateSetting`
2. **Context functions** - `dispatch`, `showToast`, `clearCache`
3. **Hook-returned functions** - `getSogniClient`, `ensureClient`, `logout`
4. **Whole objects** - `settings`, `authState`, `config`, `project`
5. **Anything unstable** - Functions created with `.bind()`, inline callbacks

### ✅ ONLY Add Primitives That Should Trigger the Effect

```typescript
// CORRECT - separate effects for separate concerns
useEffect(() => {
  if (authState.isAuthenticated) initializeSogni();
}, [authState.isAuthenticated]);

useEffect(() => {
  if (settings.watermark) updateWatermark();
}, [settings.watermark]);
```

### 🔧 How to Fix Common Violations

**Problem:** Need to call a function from a hook inside useEffect
```typescript
// ❌ WRONG - getSogniClient creates new reference each render
const { getSogniClient } = useSogniAuth();
useEffect(() => {
  const client = getSogniClient();
  // ...
}, [getSogniClient]); // INFINITE LOOP!

// ✅ RIGHT - Access singleton directly
import { sogniAuth } from '../services/sogniAuth';
useEffect(() => {
  const client = sogniAuth.getSogniClient();
  // ...
}, [isAuthenticated]); // Only primitive trigger
```

**Problem:** ESLint wants me to add a function to dependencies
```typescript
// ❌ WRONG - Adding function causes re-runs
}, [fetchData, isAuthenticated]);

// ✅ RIGHT - Ignore ESLint, call function directly
}, [isAuthenticated]); // fetchData is stable, doesn't need to be a dependency
```

**Problem:** Effect needs to respond to multiple unrelated changes
```typescript
// ❌ WRONG - Mixed concerns
useEffect(() => {
  if (isAuthenticated) initClient();
  if (settings.watermark) updateWatermark();
}, [isAuthenticated, settings.watermark]); // TOO MANY CONCERNS!

// ✅ RIGHT - Split into separate effects
useEffect(() => {
  if (isAuthenticated) initClient();
}, [isAuthenticated]);

useEffect(() => {
  if (settings.watermark) updateWatermark();
}, [settings.watermark]);
```

### 📊 Enforcement Checklist

Before committing any useEffect changes:
- [ ] Effect has ONE clear purpose (can be stated in one sentence)
- [ ] Dependency array has ≤ 3 items (if more, split into multiple effects)
- [ ] ZERO functions in dependency array
- [ ] ZERO objects in dependency array (extract primitives instead)
- [ ] Run `npm run validate:useeffect` - must pass with 0 errors

## Local Development URLs

Use nginx-proxied subdomains for proper CORS/cookie handling:
- Frontend: `https://360-local.sogni.ai` (proxies to port 5180)
- Backend API: `https://360-api-local.sogni.ai` (proxies to port 3002)

Direct localhost access (`http://localhost:5180`) works but may have auth limitations.

## Architecture

### System Flow
```
React Frontend → Express Backend API → Sogni Client SDK → Sogni Socket Service
     ↓                   ↓
  AppContext        SSE Progress Events
```

The backend maintains a **single global Sogni client** (`globalSogniClient`) for all requests. The frontend subscribes to Server-Sent Events (SSE) for real-time generation progress.

### Key Directories

**Frontend (`src/`)**
- `components/` - React components
  - `Sogni360Container.tsx` - Main orchestrator, handles auth/state/modals
  - `WaypointEditor.tsx` - Camera angle editor with presets and 3D control
  - `Sogni360Viewer.tsx` - Image viewer with auto-play and navigation
  - `shared/CameraAngle3DControl.tsx` - Interactive orbital camera selector
- `context/AppContext.tsx` - Global state management (useReducer pattern)
- `services/` - API clients and generation logic
  - `api.ts` - Backend API client with SSE subscription
  - `CameraAngleGenerator.ts` - Orchestrates multi-angle generation
  - `sogniAuth.ts` - Frontend SDK auth (for direct mode)
- `types/` - TypeScript interfaces
- `constants/cameraAngleSettings.ts` - Camera angles, presets, LoRA config

**Backend (`server/`)**
- `index.js` - Express server setup with CORS
- `routes/sogni.js` - API endpoints for generation, progress SSE
- `services/sogni.js` - Sogni SDK wrapper, global client management

### Core Data Types

```typescript
// Waypoint - a camera angle position
interface Waypoint {
  id: string;
  azimuth: 'front' | 'front-right' | 'right' | ... // 8 options
  elevation: 'low-angle' | 'eye-level' | 'elevated' | 'high-angle';
  distance: 'close-up' | 'medium' | 'wide';
  status: 'pending' | 'generating' | 'ready' | 'failed';
  imageUrl?: string;
  isOriginal?: boolean;  // Uses source image directly (no generation)
}

// Project - contains waypoints and segments
interface Sogni360Project {
  sourceImageUrl: string;
  waypoints: Waypoint[];
  segments: Segment[];  // Video transitions between waypoints
  status: 'draft' | 'generating-angles' | 'generating-transitions' | 'complete';
}
```

### Generation Flow

1. User selects preset or configures waypoints manually
2. `WaypointEditor.handleGenerateAngles()` calls `generateMultipleAngles()`
3. For each non-original waypoint:
   - Backend creates Sogni SDK project with Multiple Angles LoRA
   - Frontend subscribes to SSE at `/sogni/progress/:projectId`
   - Progress events: `connected` → `queued` → `started` → `progress` → `completed`
   - Result URL comes in `completed` event's `imageUrls` array
4. Original waypoints (`isOriginal: true`) skip generation, use source image directly

### SSE Event Handling

The backend sends progress via SSE. Key events:
- `progress` - Contains `progress` (0-1 float)
- `completed` - Contains `imageUrls: string[]` (result images)

Important: The `completed` event sends `imageUrls` array, NOT `resultUrl`.

## Intended User Flow

1. **First Load**: Show pre-rendered demo experience (user can interact immediately)
2. **Upload Image**: User uploads portrait, transitions to editor
3. **Select Angles**: Choose preset or customize waypoints (2-5 angles)
4. **Generate Angles**: Batch render all non-original waypoints
5. **Review & Regenerate**: User can redo any angles they don't like
6. **Generate Transitions**: Create video transitions between adjacent waypoints
7. **Review Transitions**: User can regenerate any transitions
8. **Play & Export**: Interact with seamless 360° experience, export final video

## Photobooth Reference Patterns

This app borrows heavily from `../sogni-photobooth`. Key patterns to reference:
- `CameraAngle3DControl.tsx` - Interactive orbital camera UI
- `CameraAnglePopup.tsx` - Full angle selection workflow
- `AngleSlotCard.tsx` - Individual angle cards with thumbnails
- Video transition generation via `VideoGenerator.ts`
- Cost estimation and pricing display
- Project history with IndexedDB storage
- Free demo access via backend proxy fallback

## Related Sogni Repositories

Reference these sibling repos for debugging:
- `../sogni-photobooth` - Similar app with more mature features (camera angle UI patterns)
- `../sogni-client` - Sogni Client SDK source
- `../sogni-socket` - WebSocket server for job routing

## Environment Configuration

| File | Purpose |
|------|---------|
| `server/.env` | Backend: `SOGNI_USERNAME`, `SOGNI_PASSWORD`, `SOGNI_ENV` |
| `.env.local` | Frontend dev: `VITE_*` vars |
| `.env.production` | Frontend prod config |

---

## Common Mistakes to Avoid (Lessons Learned)

### Image Display
```css
/* ❌ WRONG - Forces square on variable content */
.thumbnail { aspect-ratio: 1; }

/* ✅ RIGHT - Calculate from source dimensions */
.thumbnail {
  aspect-ratio: var(--source-aspect-ratio);
  /* Or calculate in JS from sourceImageDimensions */
}
```

### Multi-Image Layouts (Side-by-Side Comparisons)
```tsx
/* ❌ WRONG - Always horizontal, squishes landscape images */
<div className="comparison">
  <img src={image1} />
  <img src={image2} />
</div>

/* ✅ RIGHT - Adaptive layout based on aspect ratio */
const isPortrait = height > width;
<div className={`comparison ${isPortrait ? 'horizontal' : 'vertical'}`}>
  <img src={image1} />
  <img src={image2} />
</div>

/* CSS */
.comparison.horizontal { flex-direction: row; }    /* Portrait: side by side */
.comparison.vertical { flex-direction: column; }   /* Landscape: stacked */
```

### Interactive Controls
```jsx
/* ❌ WRONG - Abbreviated, cramped, unusable */
<button style={{fontSize: '9px', padding: '4px'}}>C</button>

/* ✅ RIGHT - Full text, proper sizing */
<button style={{fontSize: '14px', padding: '12px 16px', minHeight: '44px'}}>
  Close-up
</button>
```

### Card Layouts
```css
/* ❌ WRONG - Fixed narrow width forces cramping */
.card { width: 160px; max-width: 180px; }

/* ✅ RIGHT - Flexible sizing that accommodates content */
.card {
  width: 100%;
  max-width: 320px;
  min-width: 280px;
}
```

### Component Sizing
```jsx
/* ❌ WRONG - Arbitrary small sizes */
const orbitalSize = 100; // Too small to be usable

/* ✅ RIGHT - Size for usability first */
const orbitalSize = 200; // Minimum for proper interaction
```

### State Management
```jsx
/* ❌ WRONG - Multiple dispatches causing race conditions */
waypoints.forEach(wp => dispatch({ type: 'REMOVE_WAYPOINT', payload: wp.id }));

/* ✅ RIGHT - Single atomic operation */
dispatch({ type: 'SET_WAYPOINTS', payload: newWaypoints });
```

### Schema Versioning
When making breaking changes to saved state:
1. Increment `APP_SCHEMA_VERSION` in `src/utils/localProjectsDB.ts`
2. This automatically clears stale data on next load

---

## Before Submitting Any UI Change

Ask yourself these questions:

1. Did I test on a 375px mobile viewport?
2. Did I test on a 1440px desktop viewport?
3. Are all images displaying at their correct aspect ratio?
4. Can I read all text without squinting?
5. Can I tap all buttons easily with my thumb?
6. Would I show this to a client and feel proud?

**If any answer is NO, go back and fix it before proceeding.**
