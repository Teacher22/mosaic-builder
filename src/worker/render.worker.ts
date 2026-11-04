// Module worker: matches target cells to tiles and draws the mosaic.
import { computeFeatures } from '../core/features';
import { computeGrid } from '../core/grid';
import { matchCells } from '../core/matcher';
import type { RenderRequest, TileDescriptor, WorkerEvent } from '../types';

const TILE_THUMB_SIZE = 256;
const BATCH_INTERVAL_MS = 100;

function post(event: WorkerEvent, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(event, transfer ?? []);
}

async function decodeCroppedTile(file: File, scratch: OffscreenCanvas, sctx: OffscreenCanvasRenderingContext2D): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  sctx.clearRect(0, 0, TILE_THUMB_SIZE, TILE_THUMB_SIZE);
  sctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TILE_THUMB_SIZE, TILE_THUMB_SIZE);
  bitmap.close();
  return createImageBitmap(scratch);
}

async function handleRender(req: RenderRequest): Promise<void> {
  const { targetFile, settings, tiles } = req;

  post({ type: 'stage', stage: 'match', startedAt: performance.now() });

  const targetBitmap = await createImageBitmap(targetFile, { imageOrientation: 'from-image' });
  const outputWidth = settings.outputWidth;
  const outputHeight = Math.round((outputWidth * targetBitmap.height) / targetBitmap.width);

  const targetCanvas = new OffscreenCanvas(outputWidth, outputHeight);
  const targetCtx = targetCanvas.getContext('2d', { willReadFrequently: true })!;
  targetCtx.drawImage(targetBitmap, 0, 0, outputWidth, outputHeight);
  targetBitmap.close();

  const grid = computeGrid(outputWidth, outputHeight, settings.tilesAcross);
  const cellCount = grid.cols * grid.rows;

  const cellRects: { x: number; y: number; w: number; h: number }[] = new Array(cellCount);
  const cellFeatures: Float32Array[] = new Array(cellCount);

  for (let row = 0; row < grid.rows; row++) {
    const y0 = Math.round(row * grid.cellHeight);
    const y1 = Math.round((row + 1) * grid.cellHeight);
    for (let col = 0; col < grid.cols; col++) {
      const x0 = Math.round(col * grid.cellWidth);
      const x1 = Math.round((col + 1) * grid.cellWidth);
      const rect = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
      const index = row * grid.cols + col;
      cellRects[index] = rect;
      const imageData = targetCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
      cellFeatures[index] = computeFeatures(imageData.data, rect.w, rect.h);
    }
  }

  const matchable = tiles.map((t: TileDescriptor) => ({ id: t.id, features: Float32Array.from(t.features) }));
  const assignment = matchCells(cellFeatures, matchable);

  post({ type: 'stage', stage: 'render', startedAt: performance.now() });

  const finalCanvas = new OffscreenCanvas(outputWidth, outputHeight);
  const finalCtx = finalCanvas.getContext('2d')!;

  const scratch = new OffscreenCanvas(TILE_THUMB_SIZE, TILE_THUMB_SIZE);
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;

  const tileById = new Map(tiles.map((t: TileDescriptor) => [t.id, t]));
  const bitmapCache = new Map<number, ImageBitmap>();
  const usage = new Map<number, number>();

  let lastBatchTime = performance.now();
  let pendingPlacements: { cell: number; tileId: number }[] = [];

  for (let cell = 0; cell < cellCount; cell++) {
    const tileId = assignment[cell];
    if (tileId !== -1) {
      let bitmap = bitmapCache.get(tileId);
      if (!bitmap) {
        const tile = tileById.get(tileId)!;
        bitmap = await decodeCroppedTile(tile.file, scratch, sctx);
        bitmapCache.set(tileId, bitmap);
      }
      const rect = cellRects[cell];
      finalCtx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
      usage.set(tileId, (usage.get(tileId) ?? 0) + 1);
    }

    pendingPlacements.push({ cell, tileId });
    const now = performance.now();
    if (now - lastBatchTime >= BATCH_INTERVAL_MS || cell === cellCount - 1) {
      post({ type: 'progress', stage: 'render', done: cell + 1, total: cellCount });
      post({ type: 'tiles-batch', placements: pendingPlacements });
      pendingPlacements = [];
      lastBatchTime = now;
    }
  }

  for (const bitmap of bitmapCache.values()) bitmap.close();

  const resultBitmap = finalCanvas.transferToImageBitmap();
  let mostReusedCount = 0;
  for (const count of usage.values()) mostReusedCount = Math.max(mostReusedCount, count);

  post(
    {
      type: 'done',
      bitmap: resultBitmap,
      stats: {
        outputWidth,
        outputHeight,
        tilesPlaced: cellCount,
        uniquePhotosUsed: usage.size,
        uniquePhotosUnused: tiles.length - usage.size,
        mostReusedCount,
        totalTimeMs: 0,
      },
    },
    [resultBitmap],
  );
}

self.onmessage = (ev: MessageEvent<RenderRequest>) => {
  handleRender(ev.data).catch((err) => {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  });
};
