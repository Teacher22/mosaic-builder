# Mosaic Builder

Local-only photo mosaic app. Pick a folder of photos and a target image, click Generate, and get a high-resolution mosaic that looks like the target up close and far away. No server, no uploads, no accounts — see [project.md](project.md) for the full spec.

## Quick start

```bash
make dev      # installs deps (first run only) and opens http://localhost:5173
```

That's the whole app — there's no separate backend to run; Vite serves the UI and the Web Workers do the heavy lifting in-browser.

Other commands (`make help` lists all of these):

```bash
make test      # unit tests
make build     # production build into dist/
make preview   # build, then serve dist/ locally
make check     # test + build, same as CI / end-of-milestone
make clean     # remove node_modules and dist
```

Prefer npm directly? The same scripts exist there too: `npm install`, `npm run dev`, `npm run test`, `npm run build`, `npm run check`.

A folder of sample photos + a target image is available in `sample-photos/` (downloaded locally, gitignored) for trying the app immediately.

## Deploying to GitHub Pages

**Live site:** https://teacher22.github.io/mosaic-builder/

Every push to `main` runs [the deploy workflow](.github/workflows/deploy-pages.yml), which tests, builds and publishes the site. To redeploy without pushing, use **Actions → Deploy to GitHub Pages → Run workflow**.

It's a static site, so photos are still processed entirely in your browser and never uploaded.

To try a Pages-style build locally:

```bash
BASE_PATH=/mosaic-builder/ npm run build
BASE_PATH=/mosaic-builder/ npm run preview
```

## Status

Work in progress. Tested only in Chromium, and with up to 583 small photos.

**Working:** photo analysis in background workers, matching with repeat control, IndexedDB analysis cache, folder picker, PNG/JPEG export up to 8000px, draggable before/after compare, zoom and pan, live low-res preview.

**Known gaps:**

- Likeness to the target is still weak with small photo libraries; a better tone transfer is written and tested (`src/core/toneTransfer.ts`) but not connected yet.
- Rendering decodes full-size originals, so large libraries will be slow.
- Cancel may not stop running work.
- Untested: 2000+ photos, HEIC, Safari.
- Several UI items from [project.md](project.md) section 6a aren't built, including the reuse heatmap, ETA and animated replay.
