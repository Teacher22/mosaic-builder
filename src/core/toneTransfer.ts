import { oklabToSrgbByte } from './color';

const DIVISIONS = 3;

/** Converts a 27-float OKLab feature vector to its 9 sRGB samples (27 bytes as numbers). */
export function featuresToSrgb(features: ArrayLike<number>): Float32Array {
  const out = new Float32Array(features.length);
  for (let i = 0; i < features.length; i += 3) {
    const [r, g, b] = oklabToSrgbByte(features[i], features[i + 1], features[i + 2]);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

const gains = new Float32Array(DIVISIONS * DIVISIONS * 3);
const offsets = new Float32Array(DIVISIONS * DIVISIONS * 3);
const rowGains = new Float32Array(DIVISIONS * 3);
const rowOffsets = new Float32Array(DIVISIONS * 3);

/**
 * Moves a tile's tones toward the target cell, region by region, while
 * keeping the photo's own detail. Each 3x3 region gets a per-channel linear
 * map taking the tile's mean to `mean + strength * (target - mean)`:
 * darkening scales toward 0 and lightening scales toward 255, so unlike a
 * plain offset nothing clips, and unlike an alpha overlay contrast survives.
 * Maps are bilinearly interpolated across the tile, so regions don't show
 * seams. Mutates `pixels` (RGBA) in place.
 */
export function applyToneTransfer(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tileSrgb: ArrayLike<number>,
  cellSrgb: ArrayLike<number>,
  strength: number,
): void {
  if (strength <= 0) return;

  for (let i = 0; i < gains.length; i++) {
    const mean = tileSrgb[i];
    const desired = mean + strength * (cellSrgb[i] - mean);
    if (desired <= mean) {
      gains[i] = mean > 0 ? desired / mean : 1;
      offsets[i] = mean > 0 ? 0 : desired;
    } else {
      const gain = mean < 255 ? (255 - desired) / (255 - mean) : 1;
      gains[i] = gain;
      offsets[i] = 255 * (1 - gain);
    }
  }

  const last = DIVISIONS - 1;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(last, ((y + 0.5) / height) * DIVISIONS - 0.5));
    const y0 = Math.min(last - 1, Math.floor(fy));
    const ty = fy - y0;
    for (let c = 0; c < DIVISIONS * 3; c++) {
      const a = y0 * DIVISIONS * 3 + c;
      const b = a + DIVISIONS * 3;
      rowGains[c] = gains[a] + (gains[b] - gains[a]) * ty;
      rowOffsets[c] = offsets[a] + (offsets[b] - offsets[a]) * ty;
    }

    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4) {
      const fx = Math.max(0, Math.min(last, ((x + 0.5) / width) * DIVISIONS - 0.5));
      const x0 = Math.min(last - 1, Math.floor(fx));
      const tx = fx - x0;
      for (let ch = 0; ch < 3; ch++) {
        const a = x0 * 3 + ch;
        const b = a + 3;
        const gain = rowGains[a] + (rowGains[b] - rowGains[a]) * tx;
        const offset = rowOffsets[a] + (rowOffsets[b] - rowOffsets[a]) * tx;
        pixels[p + ch] = pixels[p + ch] * gain + offset;
      }
    }
  }
}
