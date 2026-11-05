# Mosaic Builder

Rebuild any image from your own photos. Pick a folder of photos and a target image, click Generate, and get a high-resolution mosaic you can zoom right into. No server, no uploads, no accounts: everything runs in your browser. See [project.md](project.md) for the original spec.

**Try it:** https://teacher22.github.io/mosaic-builder/

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

## Features

- **Tone-preserving colour correction:** each tile's tones shift toward the target region by region, keeping the photo's own detail.
- **Adaptive detail:** smaller tiles where the target has edges, larger ones on flat areas.
- **Tile inspector:** hover a tile to see its source photo and every other place it's used.
- **Likeness score:** measured structural similarity to the target, updated as you change settings.
- **Before/after divider, squint test, reuse heatmap, animated replay and reshuffle.**
- **Export:** PNG or JPEG up to 16,000 px on a side, a print-size calculator, and a CSV listing which photo goes where.
- **Grout lines** for a real tile-mosaic look.
- **Works offline** after a first use, and installs as an app in supporting browsers.

Keyboard: `G` generate, `E` export, `C` compare, `I` inspect, `H` heatmap, `S` squint, `R` replay, `+`/`-` zoom, `0` fit, `1` actual pixels.

## Status

Measured on an Apple M6 Mac in Chromium, using 2,000 12 MP JPEGs (300 distinct images, repeated):

| Task | Time | Target |
|---|---|---|
| First analysis of 2,000 photos | 12.4 s | UI stays responsive |
| Reload and re-select the same 2,000 | 0.27 s | under 3 s |
| 3,072 tiles at 8000 px, PNG | 3.8 s | about 15 s |
| Live preview at 972 tiles | 0.84 s | about 1 s |

Also run through the same flow in Playwright's WebKit build (Safari's engine), and HEIC decoding was tested both natively and through the `heic2any` fallback.

**Known limits:**

- Not yet tested in Safari itself, or on real iPhone HEIC files (the test files were made with macOS `sips`).
- Likeness depends on your photos: with only a few, tiles repeat visibly. The app warns when there are too few.
- Tile cells are square; the spec's rectangular cells aren't built.
- Workers are only stored for offline use once they've run, so generate one mosaic before relying on it offline.
