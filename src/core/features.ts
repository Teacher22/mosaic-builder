// Pure pixel-sampling logic: no DOM types beyond the plain ImageData shape,
// so this runs identically on the main thread and inside workers.
import { srgbByteToOklab } from './color';

const DIVISIONS = 3;

/**
 * Average OKLab of each cell in a DIVISIONS x DIVISIONS grid over the
 * image, flattened row-major into a single Float32Array of length
 * DIVISIONS*DIVISIONS*3. OKLab gives perceptually meaningful distances
 * (close in colour-space == looks close), unlike raw sRGB averages.
 */
export function computeFeatures(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(DIVISIONS * DIVISIONS * 3);
  const counts = new Float32Array(DIVISIONS * DIVISIONS);

  for (let y = 0; y < height; y++) {
    const gy = Math.min(DIVISIONS - 1, Math.floor((y / height) * DIVISIONS));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(DIVISIONS - 1, Math.floor((x / width) * DIVISIONS));
      const cell = gy * DIVISIONS + gx;
      const p = (y * width + x) * 4;
      const [L, a, b] = srgbByteToOklab(data[p], data[p + 1], data[p + 2]);
      const base = cell * 3;
      out[base] += L;
      out[base + 1] += a;
      out[base + 2] += b;
      counts[cell]++;
    }
  }

  for (let cell = 0; cell < DIVISIONS * DIVISIONS; cell++) {
    const base = cell * 3;
    const n = counts[cell] || 1;
    out[base] /= n;
    out[base + 1] /= n;
    out[base + 2] /= n;
  }

  return out;
}

export const FEATURE_LENGTH = DIVISIONS * DIVISIONS * 3;

/**
 * Re-weights a feature vector for matching. Squared distance splits exactly
 * into "overall colour" + "pattern inside the cell", so scaling the mean by
 * `meanWeight` shifts what matching cares about. Tone transfer can repair an
 * overall colour mismatch at draw time but can't invent structure, so the
 * more correction is applied the more matching should favour structure.
 */
export function weightFeatures(features: ArrayLike<number>, meanWeight: number): Float32Array {
  const out = new Float32Array(features.length);
  const samples = features.length / 3;
  for (let channel = 0; channel < 3; channel++) {
    let mean = 0;
    for (let i = 0; i < samples; i++) mean += features[i * 3 + channel];
    mean /= samples;
    for (let i = 0; i < samples; i++) {
      out[i * 3 + channel] = mean * meanWeight + (features[i * 3 + channel] - mean);
    }
  }
  return out;
}

/** Plain sRGB average (0..255 per channel) over a whole region, for drawing/colour-correct. */
export function computeAverageColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    r += data[p];
    g += data[p + 1];
    b += data[p + 2];
  }
  return [r / n, g / n, b / n];
}
