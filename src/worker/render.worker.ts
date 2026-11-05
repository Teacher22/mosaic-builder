// Module worker: matches target cells to tiles and draws the mosaic, for
// both the on-screen preview ('render') and high-res export ('export').
import { computeAverageColor, computeFeatures } from '../core/features';
import { computeGrid } from '../core/grid';
import { KDTree } from '../core/kdtree';
import { matchGrid } from '../core/matcher';
import type { ExportRequest, MosaicSettings, RenderRequest, TileDescriptor, WorkerEvent } from '../types';

const PREVIEW_TILE_SIZE = 256;
const BATCH_INTERVAL_MS = 100;
const SNAPSHOT_INTERVAL_MS = 250;
const EXPORT_STRIP_HEIGHT = 1200;

function post(event: WorkerEvent, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(event, transfer);
}

interface AssignmentResult {
  cols: number;
  rows: number;
  /** Normalised [0,1] rects, independent of the final pixel resolution. */
  cellRectsNorm: { x0: number; y0: number; x1: number; y1: number }[];
  /** Plain sRGB average per cell, for colour-correct tinting. */
  cellColors: [number, number, number][];
  assignment: number[];
  aspect: number; // target height / width
}

async function computeAssignment(
  targetFile: File,
  settings: MosaicSettings,
  tiles: TileDescriptor[],
): Promise<AssignmentResult> {
  const targetBitmap = await createImageBitmap(targetFile, { imageOrientation: 'from-image' });
  const aspect = targetBitmap.height / targetBitmap.width;

  // Matching only needs a modest sample resolution; the grid topology
  // (cols/rows) is resolution-independent, so preview and export share it.
  const sampleWidth = Math.min(targetBitmap.width, 2000);
  const sampleHeight = Math.max(1, Math.round(sampleWidth * aspect));
  const sampleCanvas = new OffscreenCanvas(sampleWidth, sampleHeight);
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
  sampleCtx.drawImage(targetBitmap, 0, 0, sampleWidth, sampleHeight);
  targetBitmap.close();

  const grid = computeGrid(sampleWidth, sampleHeight, settings.tilesAcross);
  const cellCount = grid.cols * grid.rows;
  const cellFeatures: Float32Array[] = new Array(cellCount);
  const cellRectsNorm: AssignmentResult['cellRectsNorm'] = new Array(cellCount);
  const cellColors: AssignmentResult['cellColors'] = new Array(cellCount);

  for (let row = 0; row < grid.rows; row++) {
    const y0 = Math.round(row * grid.cellHeight);
    const y1 = Math.round((row + 1) * grid.cellHeight);
    for (let col = 0; col < grid.cols; col++) {
      const x0 = Math.round(col * grid.cellWidth);
      const x1 = Math.round((col + 1) * grid.cellWidth);
      const index = row * grid.cols + col;
      cellRectsNorm[index] = {
        x0: x0 / sampleWidth,
        y0: y0 / sampleHeight,
        x1: x1 / sampleWidth,
        y1: y1 / sampleHeight,
      };
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      const imageData = sampleCtx.getImageData(x0, y0, w, h);
      cellFeatures[index] = computeFeatures(imageData.data, w, h);
      cellColors[index] = computeAverageColor(imageData.data, w, h);
    }
  }

  const tree = new KDTree(tiles.map((t) => ({ id: t.id, features: Float32Array.from(t.features) })));
  const assignment = matchGrid(grid.cols, grid.rows, cellFeatures, tree, tiles.length, {
    reuseRadius: settings.reuseRadius,
    usagePenalty: settings.usagePenalty,
  });

  return { cols: grid.cols, rows: grid.rows, cellRectsNorm, cellColors, assignment, aspect };
}

async function decodeCroppedTile(file: File, size: number): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const scratch = new OffscreenCanvas(size, size);
  const sctx = scratch.getContext('2d')!;
  sctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return createImageBitmap(scratch);
}

interface DrawOptions {
  outputWidth: number;
  outputHeight: number;
  /** Tile decode resolution. Preview reuses a small fixed size; export sizes to the actual cell. */
  tileDecodeSize: number;
  /**
   * Row-band height in px: tile bitmaps are only cached within one band,
   * then released, so high-res exports don't hold every unique tile's
   * decoded pixels in memory at once. Infinity disables banding.
   */
  stripHeight: number;
  colorCorrect: number;
  blend: number;
  targetFile: File;
  onProgress: (done: number, total: number) => void;
  onSnapshot?: (canvas: OffscreenCanvas) => void;
}

async function drawMosaic(
  assign: AssignmentResult,
  tiles: TileDescriptor[],
  opts: DrawOptions,
): Promise<{ canvas: OffscreenCanvas; usage: Map<number, number> }> {
  const { outputWidth, outputHeight } = opts;
  const finalCanvas = new OffscreenCanvas(outputWidth, outputHeight);
  const ctx = finalCanvas.getContext('2d')!;

  const tileById = new Map(tiles.map((t) => [t.id, t]));
  const cellCount = assign.cols * assign.rows;

  const rects = assign.cellRectsNorm.map((r) => {
    const x = Math.round(r.x0 * outputWidth);
    const y = Math.round(r.y0 * outputHeight);
    return {
      x,
      y,
      w: Math.max(1, Math.round(r.x1 * outputWidth) - x),
      h: Math.max(1, Math.round(r.y1 * outputHeight) - y),
    };
  });

  // Process cells band-by-band (top to bottom) so the tile cache only needs
  // to hold bitmaps for the band currently being drawn.
  const bandOf = (cell: number) => Math.floor(rects[cell].y / opts.stripHeight);
  const order = Array.from({ length: cellCount }, (_, i) => i).sort((a, b) => bandOf(a) - bandOf(b) || a - b);

  let bitmapCache = new Map<number, ImageBitmap>();
  const usage = new Map<number, number>();
  let currentBand = -1;
  let processed = 0;
  let lastReportTime = performance.now();
  let lastSnapshotTime = performance.now();
  let pendingPlacements: { cell: number; tileId: number }[] = [];

  for (const cell of order) {
    const band = bandOf(cell);
    if (band !== currentBand) {
      for (const bmp of bitmapCache.values()) bmp.close();
      bitmapCache = new Map();
      currentBand = band;
    }

    const tileId = assign.assignment[cell];
    const rect = rects[cell];
    if (tileId !== -1) {
      let bitmap = bitmapCache.get(tileId);
      if (!bitmap) {
        const tile = tileById.get(tileId)!;
        bitmap = await decodeCroppedTile(tile.file, opts.tileDecodeSize);
        bitmapCache.set(tileId, bitmap);
      }
      ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);

      if (opts.colorCorrect > 0) {
        const [r, g, b] = assign.cellColors[cell];
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${opts.colorCorrect})`;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }

      usage.set(tileId, (usage.get(tileId) ?? 0) + 1);
    }

    processed++;
    pendingPlacements.push({ cell, tileId });
    const now = performance.now();
    if (now - lastReportTime >= BATCH_INTERVAL_MS || processed === cellCount) {
      opts.onProgress(processed, cellCount);
      post({ type: 'tiles-batch', placements: pendingPlacements });
      pendingPlacements = [];
      lastReportTime = now;
    }
    if (opts.onSnapshot && now - lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
      opts.onSnapshot(finalCanvas);
      lastSnapshotTime = now;
    }
  }

  for (const bmp of bitmapCache.values()) bmp.close();

  if (opts.blend > 0) {
    const targetBitmap = await createImageBitmap(opts.targetFile, { imageOrientation: 'from-image' });
    ctx.globalAlpha = opts.blend;
    ctx.drawImage(targetBitmap, 0, 0, outputWidth, outputHeight);
    ctx.globalAlpha = 1;
    targetBitmap.close();
  }

  return { canvas: finalCanvas, usage };
}

async function handlePreview(req: RenderRequest): Promise<void> {
  post({ type: 'stage', stage: 'match', startedAt: performance.now() });
  const assign = await computeAssignment(req.targetFile, req.settings, req.tiles);

  post({ type: 'stage', stage: 'render', startedAt: performance.now() });
  const outputWidth = req.settings.outputWidth;
  const outputHeight = Math.max(1, Math.round(outputWidth * assign.aspect));

  const { canvas, usage } = await drawMosaic(assign, req.tiles, {
    outputWidth,
    outputHeight,
    tileDecodeSize: PREVIEW_TILE_SIZE,
    stripHeight: Infinity,
    colorCorrect: req.settings.colorCorrect,
    blend: req.settings.blend,
    targetFile: req.targetFile,
    onProgress: (done, total) => post({ type: 'progress', stage: 'render', done, total }),
    onSnapshot: (c) => {
      createImageBitmap(c).then((bmp) => post({ type: 'preview', bitmap: bmp }, [bmp]));
    },
  });

  const resultBitmap = canvas.transferToImageBitmap();
  let mostReusedCount = 0;
  for (const count of usage.values()) mostReusedCount = Math.max(mostReusedCount, count);

  post(
    {
      type: 'done',
      bitmap: resultBitmap,
      stats: {
        outputWidth,
        outputHeight,
        tilesPlaced: assign.cols * assign.rows,
        uniquePhotosUsed: usage.size,
        uniquePhotosUnused: req.tiles.length - usage.size,
        mostReusedCount,
        totalTimeMs: 0,
      },
    },
    [resultBitmap],
  );
}

async function handleExport(req: ExportRequest): Promise<void> {
  try {
    const assign = await computeAssignment(req.targetFile, req.settings, req.tiles);

    const outputWidth = req.exportWidth;
    const outputHeight = Math.max(1, Math.round(outputWidth * assign.aspect));
    const cellPixelWidth = outputWidth / assign.cols;
    // Re-decode each tile's original at (roughly) the size it's actually
    // drawn at, instead of upscaling the small preview thumbnail.
    const tileDecodeSize = Math.max(32, Math.min(1024, Math.ceil(cellPixelWidth)));

    const { canvas } = await drawMosaic(assign, req.tiles, {
      outputWidth,
      outputHeight,
      tileDecodeSize,
      stripHeight: EXPORT_STRIP_HEIGHT,
      colorCorrect: req.settings.colorCorrect,
      blend: req.settings.blend,
      targetFile: req.targetFile,
      onProgress: (done, total) => post({ type: 'export-progress', done, total }),
    });

    let format = req.format;
    let blob: Blob;
    try {
      blob = await canvas.convertToBlob({
        type: `image/${format}`,
        quality: format === 'jpeg' ? req.quality : undefined,
      });
    } catch (err) {
      if (format === 'jpeg') throw err;
      post({
        type: 'log',
        level: 'warn',
        message: 'PNG encode failed at this size; falling back to JPEG.',
        ts: Date.now(),
      });
      format = 'jpeg';
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    }

    post({ type: 'export-done', blob, stats: { width: outputWidth, height: outputHeight, format, bytes: blob.size } });
  } catch (err) {
    post({ type: 'export-error', message: err instanceof Error ? err.message : String(err) });
  }
}

self.onmessage = (ev: MessageEvent<RenderRequest | ExportRequest>) => {
  const data = ev.data;
  if (data.type === 'render') {
    handlePreview(data).catch((err) => {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    });
  } else if (data.type === 'export') {
    handleExport(data);
  }
};
