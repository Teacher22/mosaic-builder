import { describe, expect, it } from 'vitest';
import { computeFeatures, FEATURE_LENGTH } from '../src/core/features';

function solidImage(width: number, height: number, [r, g, b]: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('computeFeatures', () => {
  it('returns FEATURE_LENGTH floats', () => {
    const data = solidImage(9, 9, [100, 150, 200]);
    expect(computeFeatures(data, 9, 9).length).toBe(FEATURE_LENGTH);
  });

  it('averages a solid colour to the same value in every cell', () => {
    const data = solidImage(30, 30, [51, 102, 204]);
    const features = computeFeatures(data, 30, 30);
    for (let i = 0; i < FEATURE_LENGTH; i += 3) {
      expect(features[i]).toBeCloseTo(51 / 255, 5);
      expect(features[i + 1]).toBeCloseTo(102 / 255, 5);
      expect(features[i + 2]).toBeCloseTo(204 / 255, 5);
    }
  });

  it('isolates distinct colours per 3x3 grid cell', () => {
    // 3x3 image: one pixel per cell, each a distinct colour.
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let cell = 0; cell < 9; cell++) {
      data[cell * 4] = cell * 25;
      data[cell * 4 + 1] = 0;
      data[cell * 4 + 2] = 0;
      data[cell * 4 + 3] = 255;
    }
    const features = computeFeatures(data, 3, 3);
    for (let cell = 0; cell < 9; cell++) {
      expect(features[cell * 3]).toBeCloseTo((cell * 25) / 255, 5);
    }
  });
});
