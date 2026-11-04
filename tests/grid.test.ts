import { describe, expect, it } from 'vitest';
import { computeGrid } from '../src/core/grid';

describe('computeGrid', () => {
  it('derives square cells from the target width and tile count', () => {
    const grid = computeGrid(1000, 500, 10);
    expect(grid.cols).toBe(10);
    expect(grid.cellWidth).toBe(100);
    expect(grid.rows).toBe(5);
    expect(grid.cellHeight).toBe(100);
  });

  it('always produces at least one row and column', () => {
    const grid = computeGrid(100, 100, 1);
    expect(grid.cols).toBeGreaterThanOrEqual(1);
    expect(grid.rows).toBeGreaterThanOrEqual(1);
  });
});
