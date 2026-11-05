import { describe, expect, it } from 'vitest';
import { KDTree, type KDPoint } from '../src/core/kdtree';
import { matchGrid } from '../src/core/matcher';
import { mulberry32 } from '../src/core/rng';

describe('matchGrid', () => {
  it('assigns the closest tile by feature distance when there is no reuse pressure', () => {
    const cellFeatures = [new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1])];
    const tiles: KDPoint[] = [
      { id: 1, features: new Float32Array([0, 0, 0]) },
      { id: 2, features: new Float32Array([1, 1, 1]) },
    ];
    const tree = new KDTree(tiles);
    const assignment = matchGrid(2, 1, cellFeatures, tree, tiles.length, { reuseRadius: 0, usagePenalty: 0 });
    expect(assignment).toEqual([1, 2]);
  });

  it('returns -1 for every cell when there are no tiles', () => {
    const cellFeatures = [new Float32Array([0, 0, 0])];
    const tree = new KDTree([]);
    expect(matchGrid(1, 1, cellFeatures, tree, 0, { reuseRadius: 0, usagePenalty: 0 })).toEqual([-1]);
  });

  it('never repeats a tile within the Chebyshev reuse radius', () => {
    const cols = 10;
    const rows = 10;
    const rng = mulberry32(7);
    const tileCount = 50;
    const tiles: KDPoint[] = Array.from({ length: tileCount }, (_, id) => ({
      id,
      features: Float32Array.from({ length: 27 }, () => rng() * 2 - 1),
    }));
    const tree = new KDTree(tiles);

    // Cluster target cells around a single region of colour-space so the
    // matcher is under real pressure to reuse tiles, not just picking
    // distinct natural neighbours by chance.
    const cellFeatures = Array.from({ length: cols * rows }, () => Float32Array.from({ length: 27 }, () => 0.1));

    const R = 2;
    const assignment = matchGrid(cols, rows, cellFeatures, tree, tileCount, {
      reuseRadius: R,
      usagePenalty: 0.1,
      seed: 3,
    });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileId = assignment[row * cols + col];
        for (let dr = -R; dr <= R; dr++) {
          for (let dc = -R; dc <= R; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r2 = row + dr;
            const c2 = col + dc;
            if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) continue;
            expect(assignment[r2 * cols + c2]).not.toBe(tileId);
          }
        }
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const rng = mulberry32(99);
    const tiles: KDPoint[] = Array.from({ length: 20 }, (_, id) => ({
      id,
      features: Float32Array.from({ length: 27 }, () => rng() * 2 - 1),
    }));
    const tree = new KDTree(tiles);
    const cellFeatures = Array.from({ length: 16 }, () => Float32Array.from({ length: 27 }, () => rng() * 2 - 1));

    const settings = { reuseRadius: 2, usagePenalty: 0.1, seed: 123 };
    const a = matchGrid(4, 4, cellFeatures, tree, tiles.length, settings);
    const b = matchGrid(4, 4, cellFeatures, tree, tiles.length, settings);
    expect(a).toEqual(b);
  });
});
