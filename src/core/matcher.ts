import { KDTree } from './kdtree';
import { mulberry32, shuffle } from './rng';
import type { FeatureVector } from '../types';

const INITIAL_K = 12;

export interface MatchSettings {
  reuseRadius: number;
  usagePenalty: number;
  seed?: number;
}

/**
 * Matches each grid cell to a tile: query the k-d tree for the nearest
 * candidates, reject any used within a Chebyshev radius R of the cell
 * (kills visible repeats), score the rest by distance + usage penalty, and
 * take the best. Widens K when every candidate is rejected; as a last
 * resort (K already covers every tile) ignores the reuse rule entirely.
 * Cells are visited in a seeded-random order so repeats don't streak along
 * a raster scan.
 */
export function matchGrid(
  cols: number,
  rows: number,
  cellFeatures: FeatureVector[],
  tree: KDTree,
  tileCount: number,
  settings: MatchSettings,
): number[] {
  const cellCount = cols * rows;
  const assignment = new Array<number>(cellCount).fill(-1);
  if (tileCount === 0) return assignment;

  const usage = new Map<number, number>();
  const rng = mulberry32(settings.seed ?? 1);
  const order = shuffle(
    Array.from({ length: cellCount }, (_, i) => i),
    rng,
  );

  const R = settings.reuseRadius;

  const isRejected = (cell: number, tileId: number): boolean => {
    if (R <= 0) return false;
    const row = Math.floor(cell / cols);
    const col = cell % cols;
    for (let dr = -R; dr <= R; dr++) {
      const r2 = row + dr;
      if (r2 < 0 || r2 >= rows) continue;
      const rowBase = r2 * cols;
      for (let dc = -R; dc <= R; dc++) {
        if (dr === 0 && dc === 0) continue;
        const c2 = col + dc;
        if (c2 < 0 || c2 >= cols) continue;
        if (assignment[rowBase + c2] === tileId) return true;
      }
    }
    return false;
  };

  for (const cell of order) {
    const feature = cellFeatures[cell];
    let k = Math.min(INITIAL_K, tileCount);
    let chosen = -1;

    for (;;) {
      const candidates = tree.nearestK(feature, k);
      const ignoreReuse = k >= tileCount;

      let bestId = -1;
      let bestScore = Infinity;
      for (const cand of candidates) {
        if (!ignoreReuse && isRejected(cell, cand.id)) continue;
        const score = cand.dist + settings.usagePenalty * (usage.get(cand.id) ?? 0);
        if (score < bestScore) {
          bestScore = score;
          bestId = cand.id;
        }
      }

      if (bestId !== -1) {
        chosen = bestId;
        break;
      }
      k = Math.min(k * 2, tileCount);
    }

    assignment[cell] = chosen;
    usage.set(chosen, (usage.get(chosen) ?? 0) + 1);
  }

  return assignment;
}
