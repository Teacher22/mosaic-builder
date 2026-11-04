import { squaredDistance } from './color';
import type { FeatureVector } from '../types';

export interface MatchableTile {
  id: number;
  features: FeatureVector;
}

/**
 * M1 baseline: brute-force nearest neighbour per cell, in cell order, no
 * reuse constraints. M2 replaces this with a k-d tree plus a reuse radius
 * and usage penalty to kill visible repeats.
 */
export function matchCells(cellFeatures: FeatureVector[], tiles: MatchableTile[]): number[] {
  if (tiles.length === 0) return cellFeatures.map(() => -1);

  const assignment: number[] = new Array(cellFeatures.length);
  for (let i = 0; i < cellFeatures.length; i++) {
    let bestId = tiles[0].id;
    let bestDist = Infinity;
    for (const tile of tiles) {
      const d = squaredDistance(cellFeatures[i], tile.features);
      if (d < bestDist) {
        bestDist = d;
        bestId = tile.id;
      }
    }
    assignment[i] = bestId;
  }
  return assignment;
}
