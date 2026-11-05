import { describe, expect, it } from 'vitest';
import { KDTree, type KDPoint } from '../src/core/kdtree';
import { assignmentError, effectiveReuseRadius, matchGrid } from '../src/core/matcher';
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

  it('keeps the radius achievable for small libraries', () => {
    expect(effectiveReuseRadius(4, 60)).toBe(2);
    expect(effectiveReuseRadius(4, 2000)).toBe(4);
    expect(effectiveReuseRadius(3, 5)).toBe(0);
    expect(effectiveReuseRadius(0, 2000)).toBe(0);
  });

  // The regression that made mosaics look like confetti: a fixed penalty per
  // use dwarfs squared OKLab distances, so selection ignored colour entirely.
  it('default-strength penalty still prefers colour over evenly spreading usage', () => {
    const rng = mulberry32(5);
    const tileCount = 60;
    const tiles: KDPoint[] = Array.from({ length: tileCount }, (_, id) => ({
      id,
      features: Float32Array.from({ length: 27 }, () => rng() * 0.8 - 0.4),
    }));
    const byId = new Map(tiles.map((t) => [t.id, t.features]));
    const cols = 60;
    const rows = 45;
    // Pale, nearly uniform target: only a handful of tiles genuinely fit.
    const cells = Array.from({ length: cols * rows }, () =>
      Float32Array.from({ length: 27 }, () => 0.3 + rng() * 0.01),
    );
    const tree = new KDTree(tiles);
    const unpenalised = matchGrid(cols, rows, cells, tree, tileCount, { reuseRadius: 2, usagePenalty: 0, seed: 1 });
    const balanced = matchGrid(cols, rows, cells, tree, tileCount, { reuseRadius: 2, usagePenalty: 0.5, seed: 1 });
    expect(assignmentError(balanced, cells, byId)).toBeLessThan(assignmentError(unpenalised, cells, byId) * 1.25);
    // ...and a real penalty does spread usage over more photos than none at all.
    expect(new Set(balanced).size).toBeGreaterThanOrEqual(new Set(unpenalised).size);
  });

  it('refinement passes never make the assignment worse on average', () => {
    const rng = mulberry32(11);
    const tileCount = 300;
    const tiles: KDPoint[] = Array.from({ length: tileCount }, (_, id) => ({
      id,
      features: Float32Array.from({ length: 27 }, () => rng()),
    }));
    const byId = new Map(tiles.map((t) => [t.id, t.features]));
    const cells = Array.from({ length: 900 }, () => Float32Array.from({ length: 27 }, () => rng()));
    const tree = new KDTree(tiles);
    const base = { reuseRadius: 4, usagePenalty: 0, seed: 2 };
    const greedy = matchGrid(30, 30, cells, tree, tileCount, { ...base, refinePasses: 0 });
    const refined = matchGrid(30, 30, cells, tree, tileCount, { ...base, refinePasses: 2 });
    expect(assignmentError(refined, cells, byId)).toBeLessThanOrEqual(assignmentError(greedy, cells, byId));
  });

  it('matches 3000 cells against 2000 tiles in under 2s (M2 acceptance)', () => {
    const rng = mulberry32(21);
    const tiles: KDPoint[] = Array.from({ length: 2000 }, (_, id) => ({
      id,
      features: Float32Array.from({ length: 27 }, () => rng()),
    }));
    const cells = Array.from({ length: 3000 }, () => Float32Array.from({ length: 27 }, () => rng()));
    const tree = new KDTree(tiles);
    const started = performance.now();
    matchGrid(60, 50, cells, tree, tiles.length, { reuseRadius: 4, usagePenalty: 0.5, seed: 1 });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
