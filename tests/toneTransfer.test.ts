import { describe, expect, it } from 'vitest';
import { applyToneTransfer, featuresToSrgb } from '../src/core/toneTransfer';
import { srgbByteToOklab } from '../src/core/color';

const SIZE = 30;

function solid(r: number, g: number, b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
  return px;
}

const uniform = (r: number, g: number, b: number) =>
  Float32Array.from({ length: 27 }, (_, i) => [r, g, b][i % 3]);

describe('applyToneTransfer', () => {
  it('leaves pixels untouched at strength 0', () => {
    const px = solid(10, 120, 240);
    applyToneTransfer(px, SIZE, SIZE, uniform(10, 120, 240), uniform(200, 20, 90), 0);
    expect(Array.from(px.slice(0, 4))).toEqual([10, 120, 240, 255]);
  });

  it('reaches the target exactly at strength 1 on a flat tile', () => {
    const px = solid(40, 200, 100);
    applyToneTransfer(px, SIZE, SIZE, uniform(40, 200, 100), uniform(180, 30, 100), 1);
    expect(px[0]).toBeCloseTo(180, -0.5);
    expect(px[1]).toBeCloseTo(30, -0.5);
    expect(px[2]).toBeCloseTo(100, -0.5);
  });

  it('moves part way at partial strength', () => {
    const px = solid(100, 100, 100);
    applyToneTransfer(px, SIZE, SIZE, uniform(100, 100, 100), uniform(200, 200, 200), 0.5);
    expect(px[0]).toBeGreaterThan(145);
    expect(px[0]).toBeLessThan(155);
  });

  it('keeps detail: a textured tile stays textured, and dark targets do not crush to black', () => {
    const px = new Uint8ClampedArray(SIZE * SIZE * 4);
    let mean = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = i % 2 === 0 ? 100 : 200;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
      mean += v;
    }
    mean /= SIZE * SIZE;
    applyToneTransfer(px, SIZE, SIZE, uniform(mean, mean, mean), uniform(50, 50, 50), 1);
    const values = new Set<number>();
    let outMean = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      values.add(px[i * 4]);
      outMean += px[i * 4];
    }
    outMean /= SIZE * SIZE;
    expect(values.size).toBeGreaterThan(1);
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(Math.abs(outMean - 50)).toBeLessThan(2);
  });

  it('follows spatial structure: top of the cell dark, bottom light', () => {
    const px = solid(128, 128, 128);
    const cell = Float32Array.from({ length: 27 }, (_, i) => (Math.floor(i / 9) === 0 ? 20 : Math.floor(i / 9) === 2 ? 235 : 128));
    applyToneTransfer(px, SIZE, SIZE, uniform(128, 128, 128), cell, 1);
    const top = px[0];
    const bottom = px[(SIZE * SIZE - 1) * 4];
    expect(top).toBeLessThan(40);
    expect(bottom).toBeGreaterThan(215);
  });

  it('copes with pure black and white tile samples without NaN', () => {
    const black = solid(0, 0, 0);
    applyToneTransfer(black, SIZE, SIZE, uniform(0, 0, 0), uniform(90, 90, 90), 1);
    expect(black[0]).toBeGreaterThan(85);
    const white = solid(255, 255, 255);
    applyToneTransfer(white, SIZE, SIZE, uniform(255, 255, 255), uniform(90, 90, 90), 1);
    expect(white[0]).toBeLessThan(95);
  });
});

describe('featuresToSrgb', () => {
  it('round-trips colours through OKLab', () => {
    const [L, a, b] = srgbByteToOklab(200, 100, 50);
    const features = Float32Array.from({ length: 27 }, (_, i) => [L, a, b][i % 3]);
    const srgb = featuresToSrgb(features);
    expect(Math.abs(srgb[0] - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(srgb[1] - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(srgb[2] - 50)).toBeLessThanOrEqual(1);
  });
});
