// Pure colour-distance helpers. M1 operates directly on sRGB averages;
// M2 swaps this module for an OKLab conversion without touching callers.

/** Squared Euclidean distance between two equal-length feature vectors. */
export function squaredDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}
