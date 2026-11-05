import { srgbByteToOklab } from './color';

const WINDOW = 8;
const STEP = 4;
const C1 = 0.0001;
const C2 = 0.0009;

export interface Likeness {
  /** Windowed structural similarity on lightness: 1 is identical. */
  ssim: number;
  /** Mean OKLab distance: 0 is identical. */
  colorError: number;
}

/** Compares two same-size RGBA images, normally both downscaled to viewing-distance size. */
export function computeLikeness(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Likeness {
  const n = width * height;
  const la = new Float32Array(n);
  const lb = new Float32Array(n);
  let error = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const A = srgbByteToOklab(a[p], a[p + 1], a[p + 2]);
    const B = srgbByteToOklab(b[p], b[p + 1], b[p + 2]);
    la[i] = A[0];
    lb[i] = B[0];
    error += Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  }

  let total = 0;
  let windows = 0;
  const area = WINDOW * WINDOW;
  for (let y = 0; y + WINDOW <= height; y += STEP) {
    for (let x = 0; x + WINDOW <= width; x += STEP) {
      let meanA = 0;
      let meanB = 0;
      for (let j = 0; j < WINDOW; j++) {
        for (let k = 0; k < WINDOW; k++) {
          const i = (y + j) * width + x + k;
          meanA += la[i];
          meanB += lb[i];
        }
      }
      meanA /= area;
      meanB /= area;
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let j = 0; j < WINDOW; j++) {
        for (let k = 0; k < WINDOW; k++) {
          const i = (y + j) * width + x + k;
          const dA = la[i] - meanA;
          const dB = lb[i] - meanB;
          varA += dA * dA;
          varB += dB * dB;
          cov += dA * dB;
        }
      }
      varA /= area;
      varB /= area;
      cov /= area;
      total +=
        ((2 * meanA * meanB + C1) * (2 * cov + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
      windows++;
    }
  }

  return { ssim: windows ? total / windows : 1, colorError: error / Math.max(1, n) };
}

/** Averages each `factor` x `factor` block into one pixel. Exact, so results don't depend on browser resampling. */
export function boxReduce(data: Uint8ClampedArray, width: number, height: number, factor: number): Uint8ClampedArray {
  const outW = Math.floor(width / factor);
  const outH = Math.floor(height / factor);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const area = factor * factor;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < factor; j++) {
        let p = ((y * factor + j) * width + x * factor) * 4;
        for (let k = 0; k < factor; k++, p += 4) {
          r += data[p];
          g += data[p + 1];
          b += data[p + 2];
        }
      }
      const o = (y * outW + x) * 4;
      out[o] = r / area;
      out[o + 1] = g / area;
      out[o + 2] = b / area;
      out[o + 3] = 255;
    }
  }
  return out;
}
