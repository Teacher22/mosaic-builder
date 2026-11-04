import { describe, expect, it } from 'vitest';
import { matchCells } from '../src/core/matcher';

describe('matchCells', () => {
  it('assigns the closest tile by feature distance', () => {
    const cellFeatures = [new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1])];
    const tiles = [
      { id: 1, features: new Float32Array([0, 0, 0]) },
      { id: 2, features: new Float32Array([1, 1, 1]) },
    ];
    expect(matchCells(cellFeatures, tiles)).toEqual([1, 2]);
  });

  it('returns -1 for every cell when there are no tiles', () => {
    const cellFeatures = [new Float32Array([0, 0, 0])];
    expect(matchCells(cellFeatures, [])).toEqual([-1]);
  });
});
