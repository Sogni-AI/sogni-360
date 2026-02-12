# CLAUDE.md

## Hard Rules

- **NEVER run `npm run deploy:production`** or any production deployment commands. Prepare builds only; user deploys.
- **No code file may exceed 300 lines.** Extract sub-components, hooks, utilities, and constants into separate files.
- **Run `npm run validate:useeffect`** before committing any useEffect changes.
- **Run `npm run build`** before presenting work — must pass with zero errors.

Current 300-line violations: `CameraAngle3DControl.tsx` (922), `frontendSogniAdapter.ts` (811), `OrbitalChoreographer.tsx` (775), `MultiAngleGenerator.ts` (510), `AppContext.tsx` (492), `Sogni360Container.tsx` (476).

---

## Frontend SDK vs Backend Proxy Architecture

This app has TWO modes for Sogni communication. **Always check `isFrontendMode()` before generation calls.**

| Mode | When | How | Who pays |
|------|------|-----|----------|
| **Frontend SDK** | User logged in (`authMode === 'frontend'`) | `getSogniClient().projects.create()` directly | User's wallet |
| **Backend Proxy** | Demo / not logged in | `api.*` methods → Express `/api/sogni/*` | Backend's account |

**NEVER proxy through backend when user is logged in** — wastes backend credits, adds latency, wrong wallet for errors.

Services that MUST support both modes: `CameraAngleGenerator.ts`, `TransitionGenerator.ts`, `ImageEnhancer.ts`. Cost estimation can always use backend (read-only).

```typescript
import { isFrontendMode, getSogniClient } from './frontend';

if (isFrontendMode()) {
  const project = await getSogniClient().projects.create(opts);
} else {
  const { projectId } = await api.generateSomething(opts);
}
```

---

## S3 CORS with Concurrent Requests

Concurrent S3 fetches randomly fail with CORS errors (AWS infrastructure issue). **Always use `src/utils/s3FetchWithFallback.ts`:**

```typescript
import { fetchS3AsBlob, fetchS3WithFallback } from '../utils/s3FetchWithFallback';
const blob = await fetchS3AsBlob(s3Url);
```

The utility: tries direct fetch → retries with 1-3s random jitter → falls back to `/api/sogni/proxy-image`. `<img>` tags are unaffected. Used by `TransitionGenerator.ts`, `CameraAngleGenerator.ts`, `ImageEnhancer.ts`.

---

## Video Model Architecture

**DO NOT CHANGE THIS LOGIC — VERIFIED CORRECT.**

### WAN 2.2 (Current)

Model IDs: `wan_v2.2-*`. **Always generates at 16fps internally.** The `fps` param (16 or 32) controls post-render interpolation only (+10% cost for 32).

```typescript
// CORRECT — always 16fps base for frame calculation
const frames = Math.round(16 * duration) + 1; // 1.5s → 25 frames
// fps=32 doubles output frames via interpolation
```

See `src/constants/videoSettings.ts`: `calculateVideoFrames(duration)`, `DEFAULT_VIDEO_SETTINGS.fps = 32`, `DEFAULT_VIDEO_SETTINGS.frames = 25`.

### LTX-2 (Future)

Model IDs: `ltx2-*`. Generates at actual specified FPS (1-60). Frames = `duration * fps + 1`, must snap to `1 + n*8`. When adding: detect model prefix, update `calculateVideoFrames()`, add frame snapping, reference `sogni-client` utils.

---

## useEffect Rules

**Golden Rule**: Each effect has ONE responsibility. Run `npm run validate:useeffect` before committing.

**NEVER put in dependency arrays:** functions, context functions, hook-returned functions, whole objects, anything unstable. **ONLY** use primitives that should trigger the effect.

```typescript
// CORRECT — one concern, primitive deps
useEffect(() => {
  if (authState.isAuthenticated) initializeSogni();
}, [authState.isAuthenticated]);

// WRONG — function in deps causes infinite loop
}, [getSogniClient]);
// FIX — import singleton directly, use primitive trigger
import { sogniAuth } from '../services/sogniAuth';
useEffect(() => { sogniAuth.getSogniClient(); }, [isAuthenticated]);

// WRONG — mixed concerns
}, [isAuthenticated, settings.watermark]);
// FIX — split into separate effects
```

Checklist: ONE purpose per effect, ≤3 deps, ZERO functions/objects in deps.

---

## Quality Standards

This is a **SuperApp demo** — UX must be exceptional. Every detail matters.

### Absolute Requirements

- **Aspect ratio is sacred.** NEVER use `aspect-ratio: 1` or `object-fit: cover` on user content. Always `object-fit: contain` or calculate from `sourceImageDimensions`. Multi-image layouts: portrait → side-by-side (`flex-direction: row`), landscape → stacked (`flex-direction: column`). Always compute `isPortrait = height > width`.
- **No abbreviations.** Full words only: "Close-up" not "C", "Medium" not "M". If text doesn't fit, make the container larger.
- **Minimum sizing:** 12px body text, 14px buttons, 44px touch targets, 44px button height.
- **Responsive:** Test mobile (375px) AND desktop (1440px). Design mobile-first. Use responsive units (rem, %, vw/vh).
- **No TODO comments** for essential functionality. No placeholder implementations.

### Pre-Commit Visual Audit (Required for UI changes)

Use screenshot script then READ the files to verify:
```bash
node scripts/screenshot.mjs https://360-local.sogni.ai /tmp/check-desktop.png
node scripts/screenshot.mjs https://360-local.sogni.ai /tmp/check-mobile.png /Users/markledford/Pictures/1.jpg 375 812
```

Verify: no duplicate headers/buttons, aspect ratios preserved, no scrollbars, no overflow, text readable, touch targets adequate. Test happy path + one error case. Fix all issues before presenting work.

**Audit report format when presenting work:**
```
## Pre-Commit Audit Completed
Build: Passes | Aspect Ratios: OK | Mobile (375px): OK | Desktop (1440px): OK
Touch Targets: 44px+ | Functionality: Tested [specific cases]
```

---

## Design System: "Liquid Glass"

Premium visual style inspired by DJI, GoPro, Apple Liquid Glass.

**Principles:** Frosted glass (`backdrop-filter: blur(16-24px)`), subtle transparency (bg 0.85-0.95, borders 0.1-0.2), soft gradients, 16-24px corners for modals, depth through layering, clean minimalism.

**Colors:** Primary gradient `linear-gradient(135deg, #667eea, #764ba2)`. Dark bg `rgba(20-30, 20-30, 30-40, 0.95-0.98)`. Glass surfaces `rgba(255,255,255, 0.03-0.08)` with blur. Text: white 1.0 headings, 0.7-0.85 body, 0.5-0.6 muted.

**Spacing:** Base 4px, min padding 8px, card padding 12-16px, gaps 8-16px. Breakpoints: mobile <768px, tablet 768-1024px, desktop >1024px.

### Liquid Glass Library (`liquid-glass-react`)

Toggle: settings > Liquid Glass Effects. State: `liquidGlassEnabled` in AppContext. Key component: `src/components/shared/LiquidGlassPanel.tsx`.

**Architecture:** Library renders 5 Fragment siblings with stale sizing. We provide our own frosted glass via `.liquid-glass-wrap::before` (backdrop-filter), specular border via `::after`, and only use the library's SVG displacement (`.glass__warp`).

**CSS classes:** `.liquid-glass-wrap` (main), `.liquid-glass-subtle` (small elements), `.glass-fallback` (disabled state), `.glass-inner` (sub-panels), `.glass-button`, `.glass-indicator-pill`, `.no-liquid-glass` (body class when disabled).

**Critical rules:**
1. Children keep original CSS — library overlays glass on top
2. Override ALL `.glass` library chrome (padding, gap, bg, border, shadow) with `!important`
3. `overflow: hidden` on wrapper (prevents SVG bleed)
4. Move margins to `<LiquidGlassPanel style>`, not child
5. Never `display: contents` (breaks sizing)
6. All three layers (wrap, `.glass`, content) must have identical dimensions
7. Never add manual glass CSS (no `backdrop-filter`/`box-shadow` on children)
8. Stale size fix: `LiquidGlassPanel.tsx` dispatches synthetic `window.resize` via rAF after mount

```tsx
<LiquidGlassPanel cornerRadius={16} subtle style={{ marginTop: '1rem' }}>
  <div className="my-panel">{children}</div>
</LiquidGlassPanel>
```

---

## Project Overview

Sogni 360 creates 360° orbital videos using **Qwen Image Edit 2511** and **Multiple Angles LoRA** via Sogni's dePIN AI network. Users upload any image, select camera angles (96 orientations: 8 azimuths × 4 elevations × 3 distances), batch render, then generate video transitions between waypoints for seamless loops.

**Vision:** Full-screen immersive experience, feels like rotating a 3D subject. First-time users see a pre-rendered demo.

## Development

```bash
npm install                          # All deps (server included via prepare)
cp server/.env.example server/.env   # SOGNI_USERNAME, SOGNI_PASSWORD, SOGNI_ENV
cd server && npm run dev             # Terminal 1: Backend (port 3002)
npm run dev                          # Terminal 2: Frontend (port 5180)
npm run build                        # Production build
npm test && npm run lint             # Tests + linting (0 warnings)
```

**Local URLs:** `https://360-local.sogni.ai` (frontend, nginx proxy to 5180), `https://360-api-local.sogni.ai` (backend, proxy to 3002). Direct localhost works but has auth limitations.

## Architecture

```
React Frontend → Express Backend API → Sogni Client SDK → Sogni Socket Service
     ↓                   ↓
  AppContext        SSE Progress Events (globalSogniClient)
```

**Frontend (`src/`):** `components/Sogni360Container.tsx` (orchestrator), `WaypointEditor.tsx` (angle editor), `Sogni360Viewer.tsx` (viewer), `shared/CameraAngle3DControl.tsx` (orbital selector), `context/AppContext.tsx` (useReducer state), `services/api.ts` (SSE client), `services/CameraAngleGenerator.ts`, `services/sogniAuth.ts`, `constants/cameraAngleSettings.ts`.

**Backend (`server/`):** `index.js` (Express + CORS), `routes/sogni.js` (endpoints + SSE), `services/sogni.js` (SDK wrapper).

**Core types:** `Waypoint` (id, azimuth, elevation, distance, status, imageUrl, isOriginal), `Sogni360Project` (sourceImageUrl, waypoints, segments, status).

**Generation flow:** Select preset → `generateMultipleAngles()` → SDK project with LoRA per waypoint → SSE progress (`connected` → `queued` → `started` → `progress` → `completed`) → result in `completed.imageUrls[]` array. Original waypoints skip generation.

**User flow:** Demo on first load → upload image → select angles → generate → review/regenerate → generate transitions → review → play/export.

## Related Repos

`../sogni-photobooth` (mature reference for camera angle UI, video gen, cost estimation, IndexedDB projects), `../sogni-client` (SDK source), `../sogni-socket` (WebSocket server).

**Env files:** `server/.env` (backend creds), `.env.local` (frontend dev), `.env.production` (frontend prod).

---

## Adding Demo Projects

Demos are hosted on Cloudflare R2, lazy-loaded when opened.

1. Export `.s360.zip` from app, rename to remove spaces
2. Run `node local-scripts/demo-uploader/upload-demo.js <path.s360.zip>` (interactive: prompts for ID, description, featured)
3. Verify `src/constants/demo-projects.ts` has clean URL, then verify CDN serves correct files:
   ```bash
   curl -s "https://cdn.sogni.ai/sogni-360-demos/<id>/<thumb>" -o /tmp/check.jpg
   ls -la /tmp/check.jpg  # Must match uploaded size
   ```
4. Build to confirm, then deploy

**CDN cache busting:** `cdn.sogni.ai` ignores query params. Change the **actual filename** (e.g., `thumbnail-v3.jpg`) to bust cache.

**Thumbnail selection:** Must match `localProjectsDB.ts saveProject()` logic: first ready waypoint image → `project.sourceImageUrl`.

**Key files:** `src/constants/demo-projects.ts` (manifest), `src/utils/demo-project-loader.ts` (loader), `src/components/demo-project-card.tsx` (UI), `local-scripts/demo-uploader/upload-demo.js` (uploader, requires `rclone` with `sogni-r2` remote).

---

## Common Mistakes

**State management:** Use single atomic dispatches (`SET_WAYPOINTS`), not per-item loops that cause race conditions.

**Schema versioning:** Increment `APP_SCHEMA_VERSION` in `src/utils/localProjectsDB.ts` for breaking changes to saved state (auto-clears stale data).

**Sizing:** Use flexible widths (`width: 100%; max-width: 320px`), not fixed narrow values. Orbital controls minimum 200px.
