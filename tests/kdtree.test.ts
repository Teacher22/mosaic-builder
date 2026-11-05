import { describe, expect, it } from 'vitest';
import { squaredDistance } from '../src/core/color';
import { KDTree, type KDPoint } from '../src/core/kdtree';
import { mulberry32 } from '../src/core/rng';

function bruteForceNearestK(query: Float32Array, points: KDPoint[], k: number) {
  return points
    .map((p) => ({ id: p.id, dist: squaredDistance(query, p.features) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);
}

function randomPoints(count: number, dims: number, rng: () => number): KDPoint[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    features: Float32Array.from({ length: dims }, () => rng() * 2 - 1),
  }));
}

describe('KDTree', () => {
  it('matches brute force nearest-k on random data', () => {
    const rng = mulberry32(42);
    const points = randomPoints(300, 27, rng);
    const tree = new KDTree(points);

    for (let q = 0; q < 20; q++) {
      const query = Float32Array.from({ length: 27 }, () => rng() * 2 - 1);
      const expected = bruteForceNearestK(query, points, 8);
      const actual = tree.nearestK(query, 8);

      expect(actual.map((m) => m.id).sort()).toEqual(expected.map((m) => m.id).sort());
      expect(actual[0].dist).toBeCloseTo(expected[0].dist, 5);
    }
  });

  it('returns at most k matches and never more than the tree holds', () => {
    const points = randomPoints(5, 3, mulberry32(1));
    const tree = new KDTree(points);
    expect(tree.nearestK(new Float32Array([0, 0, 0]), 20)).toHaveLength(5);
  });

  it('handles an empty tree', () => {
    const tree = new KDTree([]);
    expect(tree.nearestK(new Float32Array([0, 0, 0]), 5)).toEqual([]);
  });
});
