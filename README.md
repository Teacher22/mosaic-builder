# Mosaic Builder

Local-only photo mosaic app. Pick a folder of photos and a target image, click Generate, and get a high-resolution mosaic that looks like the target up close and far away. No server, no uploads, no accounts — see [PROJECT.md](PROJECT.md) for the full spec.

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

## Status

Milestone 1 (project skeleton + non-blocking pipeline) is implemented. See [PROJECT.md](PROJECT.md) section 7 for the milestone roadmap.
