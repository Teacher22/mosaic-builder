import { describe, expect, it } from 'vitest';
import { boxReduce, computeLikeness } from '../src/core/likeness';

function image(w: number, h: number, value: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = value(x, y);
      data[p + 3] = 255;
    }
  }
  return data;
}

describe('computeLikeness', () => {
  const gradient = image(32, 32, (x, y) => (x + y) * 4);

  it('scores identical images as perfect', () => {
    const { ssim, colorError } = computeLikeness(gradient, gradient, 32, 32);
    expect(ssim).toBeCloseTo(1, 5);
    expect(colorError).toBe(0);
  });

  it('scores structure-destroying noise lower than a slight brightness change', () => {
    const brighter = image(32, 32, (x, y) => (x + y) * 4 + 6);
    const noise = image(32, 32, (x, y) => ((x * 37 + y * 91) * 53) % 256);
    expect(computeLikeness(gradient, brighter, 32, 32).ssim).toBeGreaterThan(computeLikeness(gradient, noise, 32, 32).ssim);
    expect(computeLikeness(gradient, brighter, 32, 32).colorError).toBeLessThan(computeLikeness(gradient, noise, 32, 32).colorError);
  });
});

describe('boxReduce', () => {
  it('averages blocks exactly', () => {
    const checker = image(4, 4, (x, y) => ((x + y) % 2 === 0 ? 0 : 200));
    const out = boxReduce(checker, 4, 4, 2);
    expect(out.length).toBe(16);
    expect(out[0]).toBe(100);
    expect(out[3]).toBe(255);
  });
});
