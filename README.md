# Mosaic Builder

Local-only photo mosaic app. Pick a folder of photos and a target image, click Generate, and get a high-resolution mosaic that looks like the target up close and far away. No server, no uploads, no accounts — see [PROJECT.md](PROJECT.md) for the full spec.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run test
npm run build     # static files in dist/
```

A folder of sample photos + a target image is available in `sample-photos/` (downloaded locally, gitignored) for trying the app immediately.

## Status

Milestone 1 (project skeleton + non-blocking pipeline) is implemented. See [PROJECT.md](PROJECT.md) section 7 for the milestone roadmap.
