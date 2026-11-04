// Pure pixel-sampling logic: no DOM types beyond the plain ImageData shape,
// so this runs identically on the main thread and inside workers.

const DIVISIONS = 3;

/**
 * Average RGB (0..1) of each cell in a DIVISIONS x DIVISIONS grid over the
 * image, flattened row-major into a single Float32Array of length
 * DIVISIONS*DIVISIONS*3.
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
      const base = cell * 3;
      out[base] += data[p];
      out[base + 1] += data[p + 1];
      out[base + 2] += data[p + 2];
      counts[cell]++;
    }
  }

  for (let cell = 0; cell < DIVISIONS * DIVISIONS; cell++) {
    const base = cell * 3;
    const n = counts[cell] || 1;
    out[base] = out[base] / n / 255;
    out[base + 1] = out[base + 1] / n / 255;
    out[base + 2] = out[base + 2] / n / 255;
  }

  return out;
}

export const FEATURE_LENGTH = DIVISIONS * DIVISIONS * 3;
