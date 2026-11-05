/** Finest tile is a quarter of a base cell's width. */
export const UNITS_PER_BASE = 4;

export interface LayoutCell {
  /** Position and size in finest units (UNITS_PER_BASE per base grid cell). */
  x: number;
  y: number;
  size: number;
  /** Index of the base grid cell containing it. */
  base: number;
}

/** Value at the given top fraction: quantile(values, 0.25) is exceeded by about a quarter of them. */
function topFractionThreshold(values: number[], fraction: number): number {
  if (values.length === 0 || fraction <= 0) return Infinity;
  const sorted = values.slice().sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * Lays out square tiles over the base grid. With `amount` 0 that's one tile
 * per base cell. Higher amounts split the cells with the most visual detail
 * into 2x2, then the busiest of those into 2x2 again, so edges and faces get
 * fine tiles while flat sky keeps large, recognisable photos.
 * `detail` measures a region in finest units.
 */
export function buildCells(
  cols: number,
  rows: number,
  amount: number,
  detail: (x: number, y: number, size: number) => number,
): LayoutCell[] {
  const U = UNITS_PER_BASE;
  const cells: LayoutCell[] = [];
  const baseCells = Array.from({ length: cols * rows }, (_, base) => ({
    x: (base % cols) * U,
    y: Math.floor(base / cols) * U,
    size: U,
    base,
  }));

  if (amount <= 0) return baseCells;

  const splitOnce = (cell: LayoutCell): LayoutCell[] => {
    const size = cell.size / 2;
    return [
      { x: cell.x, y: cell.y, size, base: cell.base },
      { x: cell.x + size, y: cell.y, size, base: cell.base },
      { x: cell.x, y: cell.y + size, size, base: cell.base },
      { x: cell.x + size, y: cell.y + size, size, base: cell.base },
    ];
  };

  const baseScores = baseCells.map((c) => detail(c.x, c.y, c.size));
  const firstCut = topFractionThreshold(baseScores, Math.min(1, amount * 0.6));
  const medium: LayoutCell[] = [];
  baseCells.forEach((cell, i) => {
    // Perfectly flat cells never split, however high the amount.
    if (baseScores[i] > firstCut && baseScores[i] > 0) medium.push(...splitOnce(cell));
    else cells.push(cell);
  });

  const mediumScores = medium.map((c) => detail(c.x, c.y, c.size));
  const secondCut = topFractionThreshold(mediumScores, Math.min(1, amount * 0.35));
  medium.forEach((cell, i) => {
    if (mediumScores[i] > secondCut && mediumScores[i] > 0) cells.push(...splitOnce(cell));
    else cells.push(cell);
  });

  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}
