import { describe, expect, it } from 'vitest';
import { oklabToSrgbByte, squaredDistance, srgbByteToOklab } from '../src/core/color';

describe('squaredDistance', () => {
  it('is zero for identical vectors', () => {
    expect(squaredDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('matches a hand-computed distance', () => {
    expect(squaredDistance([0, 0, 0], [1, 2, 2])).toBe(1 + 4 + 4);
  });
});

describe('srgbByteToOklab', () => {
  it('maps black to L=0 and white to L=1', () => {
    const [blackL] = srgbByteToOklab(0, 0, 0);
    const [whiteL] = srgbByteToOklab(255, 255, 255);
    expect(blackL).toBeCloseTo(0, 3);
    expect(whiteL).toBeCloseTo(1, 2);
  });

  it('gives known colour pairs a larger distance than near-identical ones', () => {
    const black = srgbByteToOklab(0, 0, 0);
    const white = srgbByteToOklab(255, 255, 255);
    const almostWhite = srgbByteToOklab(250, 250, 250);

    const farApart = squaredDistance(black, white);
    const closeTogether = squaredDistance(white, almostWhite);
    expect(farApart).toBeGreaterThan(closeTogether);
  });

  it('is approximately inverted by oklabToSrgbByte', () => {
    const [L, a, b] = srgbByteToOklab(128, 64, 200);
    const [r, g, bl] = oklabToSrgbByte(L, a, b);
    expect(r).toBeGreaterThanOrEqual(125);
    expect(r).toBeLessThanOrEqual(131);
    expect(g).toBeGreaterThanOrEqual(61);
    expect(g).toBeLessThanOrEqual(67);
    expect(bl).toBeGreaterThanOrEqual(197);
    expect(bl).toBeLessThanOrEqual(203);
  });
});
