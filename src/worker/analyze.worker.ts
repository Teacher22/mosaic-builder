// Module worker: decodes photos to a square thumbnail + feature vector.
// Runs off the main thread so loading thousands of photos never freezes the UI.
import { computeFeatures } from '../core/features';
import type { AnalyzeRequest, AnalyzeResponse } from '../types';

const THUMB_SIZE = 160;

const canvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
}

async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    if (isHeic(file)) {
      const heic2any = (await import('heic2any')).default;
      const converted = (await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })) as Blob;
      return createImageBitmap(converted, { imageOrientation: 'from-image' });
    }
    throw err;
  }
}

async function analyzeOne(file: File, id: number): Promise<AnalyzeResponse> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await decodeToBitmap(file);

    // Centre-crop to a square, then draw at thumbnail resolution.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    bitmap.close();
    bitmap = undefined;

    const imageData = ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
    const features = computeFeatures(imageData.data, THUMB_SIZE, THUMB_SIZE);

    return { type: 'result', id, name: file.name, features: Array.from(features) };
  } catch (err) {
    bitmap?.close();
    return { type: 'skipped', name: file.name, reason: err instanceof Error ? err.message : String(err) };
  }
}

self.onmessage = async (ev: MessageEvent<AnalyzeRequest>) => {
  const { files, startId } = ev.data;

  for (let i = 0; i < files.length; i++) {
    const result = await analyzeOne(files[i], startId + i);
    (self as unknown as Worker).postMessage(result);
  }

  (self as unknown as Worker).postMessage({ type: 'done' } satisfies AnalyzeResponse);
};
