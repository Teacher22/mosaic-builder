import { squaredDistance } from './color';
import { KDTree } from './kdtree';
import { mulberry32, shuffle } from './rng';
import type { FeatureVector } from '../types';

const INITIAL_K = 12;
/** Past this many candidates a better tile is vanishingly unlikely; stop widening unless everything was rejected. */
const MAX_SCORED_K = 192;
const SCALE_SAMPLE_CELLS = 256;
const DEFAULT_REFINE_PASSES = 2;

export interface MatchSettings {
  reuseRadius: number;
  /**
   * 0 = pure best colour match; 1 = a photo used its fair share of times
   * (cells / tiles) costs as much as a typical cell's best-match distance.
   * Scale-free on purpose: an absolute penalty on squared OKLab distances
   * swamps the colour signal and turns the mosaic into confetti.
   */
  usagePenalty: number;
  seed?: number;
  refinePasses?: number;
}

/**
 * Largest usable radius <= requested. A cell can only be guaranteed a legal
 * tile if its neighbourhood is smaller than the library; we also leave half
 * the library free so the choice isn't forced to terrible matches.
 */
export function effectiveReuseRadius(requested: number, tileCount: number, cellsPerBase = 1): number {
  let r = Math.max(0, Math.floor(requested));
  while (r > 0 && (2 * r + 1) * (2 * r + 1) * cellsPerBase - 1 >= tileCount / 2) r--;
  return r;
}

/**
 * Assigns a tile to each cell: greedy in a seeded-random order (so repeats
 * don't streak along a raster scan), then refinement passes that re-choose
 * each cell knowing its whole neighbourhood, recovering the good matches
 * cells early in the order blocked for cells late in the order.
 *
 * Score = distance + normalised usage penalty; no tile repeats within the
 * effective Chebyshev radius, measured in base grid cells. `baseCellOf` maps
 * each cell to its base grid cell for adaptive layouts, where a base cell can
 * hold several smaller tiles. Without it there is one cell per base cell.
 */
export function matchGrid(
  cols: number,
  rows: number,
  cellFeatures: FeatureVector[],
  tree: KDTree,
  tileCount: number,
  settings: MatchSettings,
  baseCellOf?: ArrayLike<number>,
): number[] {
  const cellCount = cellFeatures.length;
  const assignment = new Array<number>(cellCount).fill(-1);
  if (tileCount === 0) return assignment;

  const usage = new Map<number, number>();
  const rng = mulberry32(settings.seed ?? 1);
  const order = shuffle(
    Array.from({ length: cellCount }, (_, i) => i),
    rng,
  );
  const baseCount = cols * rows;
  const R = effectiveReuseRadius(settings.reuseRadius, tileCount, cellCount / Math.max(1, baseCount));

  // Cells per base grid cell, so neighbourhood checks work for any layout.
  const cellsInBase: number[][] = Array.from({ length: baseCount }, () => []);
  for (let i = 0; i < cellCount; i++) cellsInBase[baseCellOf ? baseCellOf[i] : i].push(i);

  // Typical best-match distance across a sample of cells: the unit of the penalty.
  let distanceScale = 0;
  const sampleCount = Math.min(SCALE_SAMPLE_CELLS, cellCount);
  for (let i = 0; i < sampleCount; i++) {
    distanceScale += tree.nearestK(cellFeatures[order[i]], 1)[0]?.dist ?? 0;
  }
  distanceScale = Math.max(distanceScale / Math.max(1, sampleCount), 1e-6);
  const fairShare = Math.max(1, cellCount / tileCount);
  const penaltyPerUse = (settings.usagePenalty * distanceScale) / fairShare;

  const isBlocked = (cell: number, tileId: number): boolean => {
    if (R <= 0) return false;
    const base = baseCellOf ? baseCellOf[cell] : cell;
    const row = Math.floor(base / cols);
    const col = base % cols;
    for (let dr = -R; dr <= R; dr++) {
      const r2 = row + dr;
      if (r2 < 0 || r2 >= rows) continue;
      const rowBase = r2 * cols;
      for (let dc = -R; dc <= R; dc++) {
        const c2 = col + dc;
        if (c2 < 0 || c2 >= cols) continue;
        const others = cellsInBase[rowBase + c2];
        for (let i = 0; i < others.length; i++) {
          if (others[i] !== cell && assignment[others[i]] === tileId) return true;
        }
      }
    }
    return false;
  };

  const choose = (cell: number): number => {
    const feature = cellFeatures[cell];
    let k = Math.min(INITIAL_K, tileCount);
    for (;;) {
      const candidates = tree.nearestK(feature, k);
      let bestId = -1;
      let bestScore = Infinity;
      let farthest = 0;
      for (const cand of candidates) {
        if (cand.dist > farthest) farthest = cand.dist;
        if (isBlocked(cell, cand.id)) continue;
        const score = cand.dist + penaltyPerUse * (usage.get(cand.id) ?? 0);
        if (score < bestScore) {
          bestScore = score;
          bestId = cand.id;
        }
      }
      // Any tile outside this set is at least `farthest` away, and penalties
      // only add, so the current best is optimal once it beats `farthest`.
      const exhausted = k >= tileCount;
      if (bestId !== -1 && (exhausted || bestScore <= farthest || k >= MAX_SCORED_K)) return bestId;
      if (exhausted) return candidates[0].id; // last resort: repeat rather than leave a hole
      k = Math.min(k * 2, tileCount);
    }
  };

  const place = (cell: number): void => {
    const tileId = choose(cell);
    assignment[cell] = tileId;
    usage.set(tileId, (usage.get(tileId) ?? 0) + 1);
  };

  for (const cell of order) place(cell);

  const passes = settings.refinePasses ?? DEFAULT_REFINE_PASSES;
  for (let pass = 0; pass < passes; pass++) {
    for (const cell of order) {
      const current = assignment[cell];
      usage.set(current, (usage.get(current) ?? 1) - 1);
      assignment[cell] = -1;
      place(cell);
    }
  }

  return assignment;
}

/** Mean feature distance of an assignment; lower is closer to the target. Used to compare strategies in tests. */
export function assignmentError(
  assignment: number[],
  cellFeatures: FeatureVector[],
  featuresById: Map<number, FeatureVector>,
): number {
  let sum = 0;
  for (let i = 0; i < assignment.length; i++) {
    sum += squaredDistance(cellFeatures[i], featuresById.get(assignment[i])!);
  }
  return sum / Math.max(1, assignment.length);
}
