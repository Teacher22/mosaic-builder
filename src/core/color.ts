// Pure colour helpers: OKLab conversion (M2) and the generic distance
// metric the matcher and k-d tree both use.

/** Squared Euclidean distance between two equal-length feature vectors. */
export function squaredDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

// Precomputed sRGB (0..255) -> linear-light lookup, so per-pixel conversion
// is an array read instead of a pow() call.
const SRGB_TO_LINEAR_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

/**
 * Björn Ottosson's OKLab conversion, from an 8-bit sRGB triple to [L, a, b].
 * L is roughly 0..1; a/b are roughly -0.4..0.4.
 */
export function srgbByteToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = SRGB_TO_LINEAR_LUT[r];
  const lg = SRGB_TO_LINEAR_LUT[g];
  const lb = SRGB_TO_LINEAR_LUT[b];

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

/** Inverse of srgbByteToOklab, returning clamped 0..255 sRGB bytes. */
export function oklabToSrgbByte(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toByte = (c: number) => {
    const gamma = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(gamma * 255)));
  };

  return [toByte(lr), toByte(lg), toByte(lb)];
}
