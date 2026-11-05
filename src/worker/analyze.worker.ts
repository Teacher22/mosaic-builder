// Module worker: decodes photos to a feature vector and a small JPEG
// thumbnail, with an IndexedDB cache keyed by name+size+lastModified so
// re-selecting the same folder skips decoding entirely.
import { computeFeatures } from '../core/features';
import { getManyCached, setManyCached, type CachedPhoto } from '../store/cache';
import type { AnalyzeItem, AnalyzeRequest, AnalyzeResponse, AnalyzeResult } from '../types';

const THUMB_SIZE = 160;
const THUMB_QUALITY = 0.85;
const BATCH_INTERVAL_MS = 80;
const CACHE_FLUSH_SIZE = 40;

const canvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
ctx.imageSmoothingQuality = 'high';

function post(message: AnalyzeResponse): void {
  (self as unknown as Worker).postMessage(message);
}

async function analyzeImage(blob: Blob): Promise<CachedPhoto> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    // Centre-crop to a square, then draw at thumbnail resolution.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
  } finally {
    bitmap.close();
  }
  const imageData = ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
  const features = computeFeatures(imageData.data, THUMB_SIZE, THUMB_SIZE);
  const thumb = await canvas.convertToBlob({ type: 'image/jpeg', quality: THUMB_QUALITY });
  return { features, thumb };
}

function describe(err: unknown): string {
  // Some browsers reject IndexedDB operations with null rather than an Error.
  return err instanceof Error ? err.message : err === null ? 'storage refused the write' : String(err);
}

async function analyzeAll({ items, skipCache }: AnalyzeRequest): Promise<void> {
  // The cache only saves time, so any failure in it falls back to working without one.
  let cacheWorks = true;
  const cacheFailed = (err: unknown) => {
    if (cacheWorks) post({ type: 'cache-unavailable', reason: describe(err) });
    cacheWorks = false;
  };

  let cached: (CachedPhoto | undefined)[] = items.map(() => undefined);
  if (!skipCache) {
    try {
      cached = await getManyCached(items.map((item) => item.key));
    } catch (err) {
      cacheFailed(err);
    }
  }

  let results: AnalyzeResult[] = [];
  let skipped: { name: string; reason: string }[] = [];
  let needsConversion: number[] = [];
  let toCache: [string, CachedPhoto][] = [];
  let lastPost = performance.now();

  const flush = () => {
    if (results.length || skipped.length || needsConversion.length) {
      post({ type: 'batch', results, skipped, needsConversion });
    }
    results = [];
    skipped = [];
    needsConversion = [];
    lastPost = performance.now();
  };

  const writeCache = async () => {
    const batch = toCache;
    toCache = [];
    if (!cacheWorks) return;
    try {
      await setManyCached(batch);
    } catch (err) {
      cacheFailed(err);
    }
  };

  const handle = async (item: AnalyzeItem, hit: CachedPhoto | undefined) => {
    if (hit) {
      results.push({ id: item.id, features: hit.features, thumb: hit.thumb, fromCache: true });
      return;
    }
    try {
      const photo = await analyzeImage(item.blob);
      results.push({ id: item.id, features: photo.features, thumb: photo.thumb, fromCache: false });
      toCache.push([item.key, photo]);
    } catch (err) {
      if (item.isHeic && !skipCache) needsConversion.push(item.id);
      else skipped.push({ name: item.name, reason: describe(err) });
    }
  };

  for (let i = 0; i < items.length; i++) {
    await handle(items[i], cached[i]);
    if (performance.now() - lastPost >= BATCH_INTERVAL_MS) flush();
    // Written as we go, so cancelling doesn't throw away finished work.
    if (toCache.length >= CACHE_FLUSH_SIZE) await writeCache();
  }

  flush();
  await writeCache();
}

self.onmessage = (ev: MessageEvent<AnalyzeRequest>) => {
  // 'done' must always arrive, or the UI would wait forever.
  analyzeAll(ev.data).finally(() => post({ type: 'done' }));
};
