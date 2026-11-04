import { describe, expect, it } from 'vitest';
import { squaredDistance } from '../src/core/color';

describe('squaredDistance', () => {
  it('is zero for identical vectors', () => {
    expect(squaredDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('matches a hand-computed distance', () => {
    expect(squaredDistance([0, 0, 0], [1, 2, 2])).toBe(1 + 4 + 4);
  });
});
