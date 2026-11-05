// Module worker: matches target cells to tiles and draws the mosaic, for both
// the on-screen result ('render') and high-res export ('export').
import { computeRegionFeatures, regionDetail, weightFeatures } from '../core/features';
import { computeGrid } from '../core/grid';
import { KDTree } from '../core/kdtree';
import { buildCells, UNITS_PER_BASE, type LayoutCell } from '../core/layout';
import { boxReduce, computeLikeness } from '../core/likeness';
import { effectiveReuseRadius, matchGrid } from '../core/matcher';
import { applyToneTransfer, featuresToSrgb } from '../core/toneTransfer';
import type { ExportRequest, MosaicSettings, RenderRequest, TileRecord, WorkerEvent } from '../types';

const THUMB_SIZE = 160;
/** A thumbnail may be enlarged this much before the original is re-decoded instead. */
const THUMB_MAX_UPSCALE = 1.25;
const MAX_ORIGINAL_DECODE = 1024;
const ORIGINAL_CACHE_BYTES = 768 * 1024 * 1024;
const THUMB_DECODE_CONCURRENCY = 32;
const ORIGINAL_DECODE_CONCURRENCY = 6;
const PREVIEW_WIDTH = 1000;
const PREVIEW_INTERVAL_MS = 100;
const PLACEHOLDER_WIDTH = 32;
/** Likeness compares at LIKENESS_WIDTH, reached by an exact 4:1 average so the score doesn't depend on output size. */
const LIKENESS_WIDTH = 240;
const LIKENESS_REDUCE = 4;
/** How much less overall colour matters to matching at full tone correction. */
const MEAN_WEIGHT_RELIEF = 0.8;
const GROUT_COLORS = { dark: '#16161a', light: '#f4f2ee' } as const;

class Superseded extends Error {}

/** The newest run wins: older runs stop at their next check. */
let latestRunId = 0;

function post(runId: number, event: WorkerEvent, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage({ ...event, runId }, transfer);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

let targetCache: { key: string; bitmap: ImageBitmap } | null = null;

async function getTargetBitmap(key: string, file: Blob): Promise<ImageBitmap> {
  if (targetCache?.key === key) return targetCache.bitmap;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  targetCache?.bitmap.close();
  targetCache = { key, bitmap };
  return bitmap;
}

function hqContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

interface Plan {
  cols: number;
  rows: number;
  aspect: number;
  cells: LayoutCell[];
  cellSrgb: Float32Array[];
  assignment: number[];
  effectiveRadius: number;
}

function buildPlan(target: ImageBitmap, settings: MosaicSettings, tiles: TileRecord[], refinePasses?: number): Plan {
  const aspect = target.height / target.width;
  const grid = computeGrid(target.width, target.height, settings.tilesAcross);
  const { cols, rows } = grid;

  // Sample at a fixed density per base cell so matching costs the same for any
  // target size. Adaptive layouts need enough pixels in their smallest tiles.
  const pxPerBase = settings.adaptiveDetail > 0 && cols <= 100 ? 24 : 12;
  const pxPerUnit = pxPerBase / UNITS_PER_BASE;
  const sampleCanvas = new OffscreenCanvas(cols * pxPerBase, rows * pxPerBase);
  const sampleCtx = hqContext(sampleCanvas);
  sampleCtx.drawImage(target, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const { data } = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const stride = sampleCanvas.width;

  const cells = buildCells(cols, rows, settings.adaptiveDetail, (x, y, size) =>
    regionDetail(data, stride, x * pxPerUnit, y * pxPerUnit, size * pxPerUnit, size * pxPerUnit),
  );
  const cellFeatures = cells.map((c) =>
    computeRegionFeatures(data, stride, c.x * pxPerUnit, c.y * pxPerUnit, c.size * pxPerUnit, c.size * pxPerUnit),
  );

  // Tone transfer can repair overall colour but not structure, so the more of
  // it there is, the more matching should favour tiles with the right pattern.
  const meanWeight = 1 - MEAN_WEIGHT_RELIEF * settings.colorCorrect;
  const tree = new KDTree(tiles.map((t) => ({ id: t.id, features: weightFeatures(t.features, meanWeight) })));
  const assignment = matchGrid(
    cols,
    rows,
    cellFeatures.map((f) => weightFeatures(f, meanWeight)),
    tree,
    tiles.length,
    { reuseRadius: settings.reuseRadius, usagePenalty: settings.usagePenalty, seed: settings.seed, refinePasses },
    cells.map((c) => c.base),
  );

  return {
    cols,
    rows,
    aspect,
    cells,
    cellSrgb: cellFeatures.map(featuresToSrgb),
    assignment,
    effectiveRadius: effectiveReuseRadius(settings.reuseRadius, tiles.length, cells.length / (cols * rows)),
  };
}

/** Thumbnails stay decoded between runs, which is what makes live preview quick. */
const thumbBitmaps = new Map<string, ImageBitmap>();

/** Originals are large, so they're held in a size-bounded least-recently-used cache. */
const originalBitmaps = new Map<string, ImageBitmap>();
let originalBytes = 0;

function touchOriginal(key: string, bitmap: ImageBitmap): void {
  originalBitmaps.delete(key);
  originalBitmaps.set(key, bitmap);
}

function rememberOriginal(key: string, bitmap: ImageBitmap): void {
  touchOriginal(key, bitmap);
  originalBytes += bitmap.width * bitmap.height * 4;
  for (const [oldKey, old] of originalBitmaps) {
    if (originalBytes <= ORIGINAL_CACHE_BYTES || oldKey === key) break;
    originalBytes -= old.width * old.height * 4;
    old.close();
    originalBitmaps.delete(oldKey);
  }
}

async function getThumb(tile: TileRecord): Promise<ImageBitmap> {
  let bitmap = thumbBitmaps.get(tile.key);
  if (!bitmap) {
    bitmap = await createImageBitmap(tile.thumb);
    thumbBitmaps.set(tile.key, bitmap);
  }
  return bitmap;
}

async function getOriginal(tile: TileRecord, size: number): Promise<ImageBitmap> {
  const decodeSize = Math.min(MAX_ORIGINAL_DECODE, Math.ceil(size));
  const cacheKey = `${tile.key}@${decodeSize}`;
  const hit = originalBitmaps.get(cacheKey);
  if (hit) {
    touchOriginal(cacheKey, hit);
    return hit;
  }
  try {
    const full = await createImageBitmap(tile.file, { imageOrientation: 'from-image' });
    const side = Math.min(full.width, full.height);
    const canvas = new OffscreenCanvas(decodeSize, decodeSize);
    const ctx = hqContext(canvas);
    ctx.drawImage(full, (full.width - side) / 2, (full.height - side) / 2, side, side, 0, 0, decodeSize, decodeSize);
    full.close();
    const bitmap = canvas.transferToImageBitmap();
    rememberOriginal(cacheKey, bitmap);
    return bitmap;
  } catch {
    // e.g. HEIC in a browser that can't decode it here: the thumbnail still works.
    return getThumb(tile);
  }
}

async function forEachLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runner = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DrawOptions {
  runId: number;
  width: number;
  height: number;
  settings: MosaicSettings;
  target: ImageBitmap;
  onProgress: (done: number, total: number) => void;
  /** Called with a low-res view of the mosaic so far; omit for no build animation. */
  onPreview?: (canvas: OffscreenCanvas) => void;
}

function pixelRects(plan: Plan, width: number, height: number): PixelRect[] {
  const unitsX = plan.cols * UNITS_PER_BASE;
  const unitsY = plan.rows * UNITS_PER_BASE;
  return plan.cells.map((c) => {
    const x = Math.round((c.x / unitsX) * width);
    const y = Math.round((c.y / unitsY) * height);
    return {
      x,
      y,
      w: Math.max(1, Math.round(((c.x + c.size) / unitsX) * width) - x),
      h: Math.max(1, Math.round(((c.y + c.size) / unitsY) * height) - y),
    };
  });
}

async function drawMosaic(plan: Plan, tiles: TileRecord[], opts: DrawOptions): Promise<OffscreenCanvas> {
  const { runId, width, height, settings } = opts;
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const tileSrgb = new Map<number, Float32Array>();
  const rects = pixelRects(plan, width, height);
  const total = rects.length;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = hqContext(canvas);
  if (settings.grout > 0) {
    ctx.fillStyle = GROUT_COLORS[settings.groutColor];
    ctx.fillRect(0, 0, width, height);
  }

  const maxW = rects.reduce((m, r) => Math.max(m, r.w), 1);
  const maxH = rects.reduce((m, r) => Math.max(m, r.h), 1);
  const scratch = new OffscreenCanvas(maxW, maxH);
  const scratchCtx = hqContext(scratch);

  // The preview starts as a blurred target, so nothing is ever blank; tiles replace it as they land.
  let preview: OffscreenCanvas | null = null;
  let previewCtx: OffscreenCanvasRenderingContext2D | null = null;
  const previewScale = Math.min(1, PREVIEW_WIDTH / width);
  if (opts.onPreview) {
    preview = new OffscreenCanvas(Math.round(width * previewScale), Math.round(height * previewScale));
    previewCtx = preview.getContext('2d')!;
    previewCtx.imageSmoothingQuality = 'high';
    const tiny = new OffscreenCanvas(PLACEHOLDER_WIDTH, Math.max(1, Math.round(PLACEHOLDER_WIDTH * plan.aspect)));
    const tinyCtx = tiny.getContext('2d')!;
    tinyCtx.imageSmoothingQuality = 'high';
    tinyCtx.drawImage(opts.target, 0, 0, tiny.width, tiny.height);
    previewCtx.drawImage(tiny, 0, 0, preview.width, preview.height);
    opts.onPreview(preview);
  }

  const groutFraction = settings.grout / 2;
  // Enough batches that progress and the build animation move smoothly.
  const batchSize = Math.max(plan.cols, Math.ceil(total / 48));
  let lastPreview = performance.now();

  for (let start = 0; start < total; start += batchSize) {
    if (runId !== latestRunId) throw new Superseded();
    const end = Math.min(total, start + batchSize);

    // Decode everything this batch needs up front, in parallel.
    const needs = new Map<string, { tile: TileRecord; size: number; original: boolean }>();
    for (let i = start; i < end; i++) {
      const tile = tileById.get(plan.assignment[i]);
      if (!tile) continue;
      const size = Math.max(rects[i].w, rects[i].h);
      const original = size > THUMB_SIZE * THUMB_MAX_UPSCALE;
      if (original) {
        const decodeSize = Math.min(MAX_ORIGINAL_DECODE, size);
        needs.set(`o${tile.key}@${decodeSize}`, { tile, size, original });
      } else {
        needs.set(`t${tile.key}`, { tile, size, original });
      }
    }
    const bitmaps = new Map<string, ImageBitmap>();
    const pending = [...needs.entries()];
    const anyOriginal = pending.some(([, need]) => need.original);
    await forEachLimited(pending, anyOriginal ? ORIGINAL_DECODE_CONCURRENCY : THUMB_DECODE_CONCURRENCY, async ([key, need]) => {
      bitmaps.set(key, need.original ? await getOriginal(need.tile, need.size) : await getThumb(need.tile));
    });
    if (runId !== latestRunId) throw new Superseded();

    for (let i = start; i < end; i++) {
      const tile = tileById.get(plan.assignment[i]);
      if (!tile) continue;
      const rect = rects[i];
      const size = Math.max(rect.w, rect.h);
      const bitmap = bitmaps.get(
        size > THUMB_SIZE * THUMB_MAX_UPSCALE ? `o${tile.key}@${Math.min(MAX_ORIGINAL_DECODE, size)}` : `t${tile.key}`,
      )!;

      const inset = settings.grout > 0 ? Math.max(1, Math.round(rect.w * groutFraction)) : 0;
      const w = Math.max(1, rect.w - inset * 2);
      const h = Math.max(1, rect.h - inset * 2);

      scratchCtx.drawImage(bitmap, 0, 0, w, h);
      if (settings.colorCorrect > 0) {
        let srgb = tileSrgb.get(tile.id);
        if (!srgb) {
          srgb = featuresToSrgb(tile.features);
          tileSrgb.set(tile.id, srgb);
        }
        const image = scratchCtx.getImageData(0, 0, w, h);
        applyToneTransfer(image.data, w, h, srgb, plan.cellSrgb[i], settings.colorCorrect);
        scratchCtx.putImageData(image, 0, 0);
      }
      ctx.drawImage(scratch, 0, 0, w, h, rect.x + inset, rect.y + inset, w, h);
      if (previewCtx) {
        previewCtx.drawImage(
          scratch,
          0,
          0,
          w,
          h,
          (rect.x + inset) * previewScale,
          (rect.y + inset) * previewScale,
          w * previewScale,
          h * previewScale,
        );
      }
    }

    opts.onProgress(end, total);
    const now = performance.now();
    if (preview && opts.onPreview && now - lastPreview >= PREVIEW_INTERVAL_MS) {
      opts.onPreview(preview);
      lastPreview = now;
    }
    // Lets a newer run's message arrive, so this one can stop.
    await nextTask();
  }

  if (settings.blend > 0) {
    ctx.globalAlpha = settings.blend;
    ctx.drawImage(opts.target, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

function likenessPixels(source: CanvasImageSource, height: number): Uint8ClampedArray {
  const w = LIKENESS_WIDTH * LIKENESS_REDUCE;
  const h = height * LIKENESS_REDUCE;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return boxReduce(ctx.getImageData(0, 0, w, h).data, w, h, LIKENESS_REDUCE);
}

/** Browsers can silently hand back a dead canvas past their size limits. Actually draw to find out. */
function canvasFits(width: number, height: number): boolean {
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.fillRect(width - 1, height - 1, 1, 1);
    return ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255;
  } catch {
    return false;
  }
}

async function handleRender(req: RenderRequest): Promise<void> {
  const { runId, settings, tiles, draft } = req;
  const target = await getTargetBitmap(req.targetKey, req.targetFile);
  if (runId !== latestRunId) return;

  post(runId, { type: 'stage', stage: 'match', startedAt: performance.now() });
  await nextTask();
  if (runId !== latestRunId) return;
  // Drafts get one refinement pass instead of two: most of the quality for less wait.
  const plan = buildPlan(target, settings, tiles, draft ? 1 : undefined);
  if (plan.effectiveRadius < settings.reuseRadius && !draft) {
    post(runId, {
      type: 'log',
      level: 'warn',
      message: `Repeat radius reduced from ${settings.reuseRadius} to ${plan.effectiveRadius}: ${tiles.length} photos can't fill a larger one.`,
      ts: Date.now(),
    });
  }

  post(runId, { type: 'stage', stage: 'render', startedAt: performance.now() });
  const width = settings.outputWidth;
  const height = Math.max(1, Math.round(width * plan.aspect));
  if (!canvasFits(width, height)) {
    throw new Error(`This browser can't create a ${width}×${height} image. Try a smaller output width.`);
  }

  const canvas = await drawMosaic(plan, tiles, {
    runId,
    width,
    height,
    settings,
    target,
    onProgress: (done, total) => post(runId, { type: 'progress', stage: 'render', done, total }),
    onPreview: draft
      ? undefined
      : (c) => {
          createImageBitmap(c).then((bitmap) => post(runId, { type: 'preview', bitmap }, [bitmap]));
        },
  });

  const likenessHeight = Math.max(8, Math.round(LIKENESS_WIDTH * (height / width)));
  const { ssim, colorError } = computeLikeness(
    likenessPixels(canvas, likenessHeight),
    likenessPixels(target, likenessHeight),
    LIKENESS_WIDTH,
    likenessHeight,
  );

  const usage = new Map<number, number>();
  for (const id of plan.assignment) usage.set(id, (usage.get(id) ?? 0) + 1);
  let mostReusedCount = 0;
  for (const count of usage.values()) mostReusedCount = Math.max(mostReusedCount, count);

  const unitsX = plan.cols * UNITS_PER_BASE;
  const unitsY = plan.rows * UNITS_PER_BASE;
  const rects = new Float32Array(plan.cells.length * 4);
  plan.cells.forEach((c, i) => {
    rects[i * 4] = c.x / unitsX;
    rects[i * 4 + 1] = c.y / unitsY;
    rects[i * 4 + 2] = (c.x + c.size) / unitsX;
    rects[i * 4 + 3] = (c.y + c.size) / unitsY;
  });
  const tileIds = Int32Array.from(plan.assignment);

  const bitmap = canvas.transferToImageBitmap();
  post(
    runId,
    {
      type: 'done',
      bitmap,
      stats: {
        outputWidth: width,
        outputHeight: height,
        cols: plan.cols,
        rows: plan.rows,
        tilesPlaced: plan.cells.length,
        uniquePhotosUsed: usage.size,
        uniquePhotosUnused: tiles.length - usage.size,
        mostReusedCount,
        effectiveRadius: plan.effectiveRadius,
        likeness: ssim,
        colorError,
        totalTimeMs: 0,
      },
      map: { rects, tileIds },
    },
    [bitmap, rects.buffer, tileIds.buffer],
  );
}

async function handleExport(req: ExportRequest): Promise<void> {
  const { runId, settings, tiles } = req;
  const target = await getTargetBitmap(req.targetKey, req.targetFile);
  const plan = buildPlan(target, settings, tiles);
  const width = req.exportWidth;
  const height = Math.max(1, Math.round(width * plan.aspect));
  if (!canvasFits(width, height)) {
    throw new Error(`This browser can't create a ${width}×${height} image. Try a smaller size.`);
  }

  const canvas = await drawMosaic(plan, tiles, {
    runId,
    width,
    height,
    settings,
    target,
    onProgress: (done, total) => post(runId, { type: 'export-progress', done, total }),
  });

  let format = req.format;
  let blob: Blob;
  try {
    blob = await canvas.convertToBlob({ type: `image/${format}`, quality: format === 'jpeg' ? req.quality : undefined });
  } catch (err) {
    if (format === 'jpeg') throw err;
    post(runId, { type: 'log', level: 'warn', message: 'PNG encode failed at this size; falling back to JPEG.', ts: Date.now() });
    format = 'jpeg';
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  post(runId, { type: 'export-done', blob, stats: { width, height, format, bytes: blob.size } });
}

self.onmessage = (ev: MessageEvent<RenderRequest | ExportRequest>) => {
  const data = ev.data;
  latestRunId = data.runId;
  if (data.type === 'render') {
    handleRender(data).catch((err) => {
      if (err instanceof Superseded) return;
      post(data.runId, { type: 'error', message: err instanceof Error ? err.message : String(err) });
    });
  } else {
    handleExport(data).catch((err) => {
      if (err instanceof Superseded) return;
      post(data.runId, { type: 'export-error', message: err instanceof Error ? err.message : String(err) });
    });
  }
};
