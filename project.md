# Mosaic Builder: PROJECT.md

> Local-only photo mosaic app. The user loads many photos, picks one target image, and gets one large image rebuilt from those photos. No server, no uploads, no accounts.

## 1. Goal

**One sentence:** Pick a folder of photos and a target image, click Generate, and get a high-resolution mosaic PNG/JPEG that looks like the target up close *and* far away.

**Definition of done (v1):**
- Runs offline on a Mac mini (24 GB RAM), Chrome/Safari, started with a single command (or by opening one HTML file).
- Handles **2,000+ photos** (including iPhone HEIC) without freezing the UI.
- Produces output up to **8000 px wide** in under **~15 s** for 3,000 tiles.
- Result is visibly better than naive average-colour matching: no ugly repeated tiles, no obvious colour banding.
- A modern, polished UI (React + MUI, light/dark) with drag-and-drop, sliders, live progress, zoomable preview, before/after compare, export dialog.

## 2. Non-goals (don't build these)
- Cloud, accounts, sync, sharing.
- Mobile app.
- AI image generation (this is a deterministic matching problem, not diffusion).
- Editing photos (crop/rotate UIs).
- Print-shop integration.

## 3. Starting point

Greenfield. Build from scratch in this directory; the algorithm is fully specified in section 6.

## 4. Tech decisions (already made, so don't reopen them)

| Decision | Choice | Why |
|---|---|---|
| Runtime | **Browser app, served locally with Vite** | Zero native build pain; the canvas/ImageBitmap/Worker APIs are all that's needed |
| Language | **TypeScript** | Type safety across UI, core and workers |
| UI framework | **React 19** | Best agent support; component model suits a settings-heavy tool |
| Component library | **MUI (Material UI) v7 + Emotion** | Polished, accessible, themeable components out of the box |
| Icons / motion | **@mui/icons-material**, **framer-motion** | Consistent icons; smooth transitions |
| State | **Zustand** | Tiny store shared between UI and workers' results |
| Build | **Vite** (`npm create vite@latest -- --template react-ts`) | Instant dev server, one-command build |
| Heavy compute | **Web Worker** (module worker) | Keeps UI responsive |
| Image decode | `createImageBitmap(file, { imageOrientation: 'from-image' })` | Honors EXIF rotation; works in workers |
| HEIC | Safari decodes natively; for Chrome use `heic2any` (lazy-loaded, optional) | iPhone photos |
| Colour space | **OKLab** | Better than RGB, simpler than CIE Lab |
| Nearest-neighbour | **k-d tree** over feature vectors | Fast enough for 10k+ tiles |
| Storage | **IndexedDB** (via `idb-keyval`) | Cache thumbnails + features per file |
| Tests | **Vitest** for pure logic (colour, matcher, grid) | Fast, agent-friendly |
| Optional later | Wrap with **Tauri** for a native `.app` | Only after v1 works |

> Only the dependencies listed here are allowed unless there's a strong reason. Keep the bundle small.

## 5. Architecture

```
mosaic-builder/
├─ PROJECT.md              ← this file
├─ CLAUDE.md               ← agent rules (section 9)
├─ index.html
├─ src/
│  ├─ main.tsx             ← React entry
│  ├─ ui/
│  │  ├─ theme.ts          ← MUI theme (light + dark, tokens)
│  │  ├─ App.tsx           ← layout shell
│  │  ├─ components/       ← PhotoDropzone, TargetPicker, SettingsPanel,
│  │  │                       MosaicViewer, StageStepper, ProgressCard,
│  │  │                       ActivityLog, ResultSummary, ExportDialog
│  │  └─ hooks/            ← useWorkers, useMosaicStore
│  ├─ core/                ← PURE functions, unit-tested, no DOM
│  │  ├─ color.ts          ← sRGB→OKLab, distance
│  │  ├─ features.ts       ← GxG feature vector from pixels
│  │  ├─ grid.ts           ← target → cells (cols, rows, cell size)
│  │  ├─ kdtree.ts         ← build / nearest-k
│  │  └─ matcher.ts        ← assignment with reuse rules
│  ├─ worker/
│  │  ├─ analyze.worker.ts ← decode photo → thumb + features
│  │  └─ render.worker.ts  ← match + draw to OffscreenCanvas
│  ├─ store/cache.ts       ← IndexedDB wrapper
│  └─ types.ts
└─ tests/
```

**Data flow**
1. User picks photos → `analyze.worker` (pool of `navigator.hardwareConcurrency - 1`) decodes each to a **square thumbnail (160px)** and computes a **3×3 OKLab feature vector (27 floats)**. Results are cached by `name+size+lastModified`.
2. User picks target + settings → `grid.ts` computes cells and per-cell target features.
3. `matcher.ts` builds a k-d tree of tile features and assigns a tile per cell.
4. `render.worker` draws tiles on an `OffscreenCanvas`, then applies the colour blend and returns an `ImageBitmap`.
5. UI shows the preview and offers a download.

## 6. Matching algorithm (the heart of quality)

For each cell, in **randomised order** (avoids visible raster-scan bias):
1. Query the k-d tree for the **K=12 nearest** tiles by OKLab feature distance.
2. Reject candidates used within the **last N cells** (a Chebyshev radius R, default 4) → this kills visible repeats.
3. Among the rest, score = `distance + λ · usageCount(tile)`; pick min.
4. If all K are rejected, widen K (×2) and retry; as a last resort ignore rule 2.

**Colour correction (optional, M5):** after picking a tile, shift its mean colour toward the cell's target colour by `α` (0–0.35) at draw time. This improves the "big picture" without hiding the photos.

**Settings exposed in the UI:** tiles across, output width, blend %, reuse radius, usage penalty, colour-correct %, tile shape (square only in v1).

## 6a. UI / UX spec (design target: modern, calm, "pro tool" feel)

**Look:** Material 3 style via a custom MUI theme. Rounded (16 px) surfaces, soft elevation, one accent colour, large headings, generous spacing. **Light and dark mode** (follow system, with a toggle). Inter or Roboto Flex, self-hosted (no CDN, since the app must work offline).

**Layout (desktop, ≥1100 px):**
```
┌───────────────────────────────────────────────────────────┐
│ Top bar: logo · project name · theme toggle · Export ▸    │
├───────────────┬───────────────────────────────────────────┤
│ Left panel    │                                           │
│ (360 px)      │        Mosaic viewer (hero area)          │
│ 1 Photos      │   zoom / pan · before-after slider        │
│ 2 Target      │   fit / 100% / zoom buttons               │
│ 3 Settings    │                                           │
│ [ Generate ]  │   bottom: progress + stats chips          │
└───────────────┴───────────────────────────────────────────┘
```
On narrow screens the left panel becomes a bottom drawer.

**Core components**
| Component | Behaviour |
|---|---|
| `PhotoDropzone` | Drag a folder or files; large dashed drop target; after loading shows a thumbnail strip, count, skipped files; "Add more" / "Clear" |
| `TargetPicker` | Drop or pick one image; preview with the grid overlay at the chosen tile count |
| `SettingsPanel` | MUI sliders with live value labels and tooltips: tiles across, repeat radius, usage penalty, colour-correct, blend. Presets as chips: *Balanced · Photo-real · Max variety* |
| `MosaicViewer` | Canvas viewer with smooth zoom/pan (wheel, pinch, drag), fit button, **before/after slider** against the target |
| `StageStepper` | Load → Analyse → Match → Render → Done with per-stage durations |
| `ProgressCard` | Overall and per-stage progress, live counters, ETA, elapsed time, cancel button |
| `ActivityLog` | Collapsible timestamped log with warnings/errors and copy button |
| `ResultSummary` | Stats chips and reuse heatmap toggle after completion |
| `ExportDialog` | Size presets (Screen / Poster / Custom), PNG/JPEG, quality slider, estimated file size, big-size warning |

### Live output and process status (required, not polish)

The user must always see *what is happening* and *what has been produced so far*.

**1. Progressive output.** The viewer fills in live as the work runs:
- During **Matching + Rendering**, the worker posts a `tiles-batch` message every ~100 ms (e.g. 200 placed cells as `{cellIndex, tileIndex}[]` plus a small `ImageBitmap` strip). The viewer draws them immediately, so the mosaic appears to "build itself" row by row. Unplaced cells show the blurred target as a placeholder.
- When finished, the viewer swaps to the final image. A **Replay build** button re-animates placement order.

**2. Stage stepper.** A horizontal stepper at the top of the viewer: `Load photos → Analyse → Match → Render → Done`. The active step pulses, finished steps show a check mark and their duration (e.g. "Analyse 4.2 s"); a failed step turns red with the error.

**3. Progress card (always visible while running):**
- Overall linear progress plus a per-stage progress bar.
- Live counters: photos analysed `812 / 2000`, cells matched `1,430 / 2,700`, skipped files `3`.
- Throughput and **ETA** (e.g. "~6 s left"), elapsed time, **Cancel** button (aborts workers cleanly).
- Memory/size hint for big exports (e.g. "Output 8000×6000 ≈ 48 MP").

**4. Activity log drawer.** A collapsible panel with a timestamped log (`18:26:03 Analysed 2000 photos (4.2 s)`, `Warning: IMG_0412.HEIC unreadable, skipped`). "Copy log" button. Errors are also surfaced as snackbars.

**5. Result summary (after Done).** Stats chips: output size, tiles used, unique photos used / unused, most reused tile (with its count), total time. A **Unique-usage heatmap** toggle overlays how often each cell's tile was reused.

**Worker message contract (put in `src/types.ts`):**
```ts
type WorkerEvent =
  | { type: 'stage'; stage: 'analyse'|'match'|'render'|'done'; startedAt: number }
  | { type: 'progress'; stage: string; done: number; total: number; etaMs?: number }
  | { type: 'tiles-batch'; placements: { cell: number; tile: number }[] }
  | { type: 'log'; level: 'info'|'warn'|'error'; message: string; ts: number }
  | { type: 'preview'; bitmap: ImageBitmap }          // low-res refresh
  | { type: 'done'; bitmap: ImageBitmap; stats: ResultStats }
  | { type: 'error'; message: string };
```
The UI only consumes these events (via the Zustand store), so any worker can be swapped without touching components.

**UX rules**
- *Generate* is disabled until both inputs exist, with a tooltip saying what is missing.
- A first low-res preview (about 1000 px) appears fast, then refines to full quality; never show a blank canvas while working.
- Changing a slider after a result shows a "Settings changed. Regenerate" chip; with live preview on, the low-res preview regenerates automatically.
- Snackbars for success and errors; skipped files go in an expandable alert, never a modal.
- Empty states have a short illustration and a one-line instruction.
- Fully offline: no CDN fonts, icons or scripts.
- Respect `prefers-reduced-motion`; all controls keyboard reachable with visible focus.

**Polish (M5):** framer-motion transitions between empty → loaded → result, thumbnail strip fade-in, count-up stats, skeleton loaders. Keep it classy, no confetti.

## 7. Milestones (each is independently shippable; do them in order)

### M1: Project skeleton and non-blocking pipeline (≈ 1–2 h)
- Vite + React + TS + MUI scaffold with the theme and the app shell from section 6a (placeholder data is fine).
- Basic pipeline: load photos, load target, 3×3 RGB average matching in `core/`, render in a worker, download PNG.
- Analyze photos in a worker pool; show "Analyzing 340/2000".
- EXIF-correct decode; skip + list unreadable files.
- **Accept when:** 2,000 photos load with the UI staying responsive; generate works end to end; no main-thread freeze over 100 ms.

### M2: Better matching (≈ 2 h)
- OKLab conversion + unit tests (known colour pairs).
- k-d tree + tests (compare against brute force on random data).
- Reuse radius + usage penalty; randomised cell order.
- **Accept when:** on a 3,000-cell mosaic, matching takes < 2 s for 2,000 tiles, and no identical tile appears within radius R (a test asserts it).

### M3: Persistence and workflow (≈ 1–2 h)
- IndexedDB cache of thumbs + features; "Clear cache" button.
- Folder selection via `<input webkitdirectory>` (works in Chrome and Safari).
- Remember last settings in `localStorage`.
- **Accept when:** reloading the page and re-selecting the same folder takes < 3 s for 2,000 photos.

### M4: High-res export (≈ 1–2 h)
- Output presets: Screen (4000 px), Poster (8000 px), Custom.
- Safe export for big sizes: render in **horizontal strips** and encode with `OffscreenCanvas.convertToBlob`; fall back to JPEG above the canvas limit. Warn before exceeding browser limits.
- For tiles at high output res, re-decode originals at the needed size instead of upscaling the 160px thumbs (cache original `File` handles in memory).
- **Accept when:** an 8000 px export succeeds in Chrome and Safari without a crash.

### M5: UI polish and extras (≈ 2–3 h)
- Everything in section 6a marked *polish*: animations, before/after slider, zoom/pan, empty/loading/error states.
- Colour-correct slider; live low-res preview while sliders move (debounced).
- Rectangular cells matching the target's aspect; smart-crop (centre bias, optional face-aware later).
- Full keyboard accessibility and reduced-motion support.
- **Accept when:** the preview updates within ~1 s of slider changes on a 1,000-tile mosaic.

### M6 (optional): Native app
- Wrap with Tauri → `Mosaic Builder.app`. Only if desired.

## 8. Testing strategy
- **Unit (Vitest):** `color`, `features`, `grid`, `kdtree`, `matcher`. These are pure, so agents can verify them without a browser.
- **Smoke (Playwright, optional):** load 60 generated PNGs + a gradient target, click Generate, assert the status text and the output canvas size.
- **Golden check:** a fixed seed + fixed inputs → the same assignment hash (matcher must be deterministic given a seed).
- Every milestone ends with `npm run test && npm run build` passing.

## 9. Agent workflow (Claude Code and Copilot)

Put this in `CLAUDE.md` at the repo root (and mirror it in `.github/copilot-instructions.md`):

```md
# Rules
- Read PROJECT.md first. Work on ONE milestone at a time, in order.
- Keep core/ pure (no DOM, no fetch, no React). All UI lives in src/ui as React + MUI components; use theme tokens, never hard-coded colours.
- No new dependencies beyond PROJECT.md section 4 without asking.
- After each milestone: run `npm run test && npm run build`, then summarise changes in 5 lines.
- Prefer small commits: "M1: worker pool for analyze".
- Never upload user images anywhere. No network calls at runtime.
```

**Suggested split of work**
| Tool | Best for |
|---|---|
| **Claude Code** | M1 skeleton and worker architecture, M2 matcher and k-d tree, M4 export logic, anything cross-file |
| **Copilot agent (free)** | Small, well-scoped edits: UI wiring, CSS, drag-and-drop, writing unit tests for already-written pure functions |

**Kickoff prompt for Claude Code** (run it in the `mosaic-builder` directory):
> Read PROJECT.md and implement Milestone 1 only. Scaffold Vite + React + TypeScript + MUI (theme and layout per section 6a) and build the basic pipeline in src/core and src/worker as described, and make sure `npm run build` passes. Show me the plan in 5 bullets before you start coding.

Then, per milestone: *"Implement Milestone N from PROJECT.md. Stop when its acceptance criteria are met and tell me how you verified each."*

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Browser canvas size limits crash big exports | M4 strip rendering and JPEG fallback; warn in UI |
| Memory spikes with thousands of full-res decodes | Decode → draw thumb → `bitmap.close()` immediately; limit concurrency |
| Too few photos → heavy repetition | Show a hint: "N photos for M cells; reuse will be visible"; recommend minimum ≈ cells/4 |
| HEIC in Chrome | Lazy-load `heic2any`; if it fails, list the file as skipped |
| Scope creep | Section 2 non-goals; M5/M6 are optional |

## 11. Quick start (after M1)
```bash
npm install
npm run dev      # http://localhost:5173
npm run test
npm run build    # static files in dist/ (open dist/index.html via any static server)
```