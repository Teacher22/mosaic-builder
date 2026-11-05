import { describe, expect, it } from 'vitest';
import { buildCells, UNITS_PER_BASE } from '../src/core/layout';

const area = (cells: { size: number }[]) => cells.reduce((sum, c) => sum + c.size * c.size, 0);

describe('buildCells', () => {
  it('gives one tile per base cell with amount 0', () => {
    const cells = buildCells(5, 4, 0, () => 1);
    expect(cells.length).toBe(20);
    expect(cells.every((c) => c.size === UNITS_PER_BASE)).toBe(true);
  });

  it('covers the image exactly once at any amount', () => {
    const detail = (x: number, y: number) => (x * 7 + y * 13) % 11;
    for (const amount of [0.2, 0.6, 1]) {
      const cells = buildCells(8, 6, amount, detail);
      expect(area(cells)).toBe(8 * 6 * UNITS_PER_BASE * UNITS_PER_BASE);
      const seen = new Set<string>();
      for (const c of cells) {
        for (let y = c.y; y < c.y + c.size; y++) {
          for (let x = c.x; x < c.x + c.size; x++) {
            const key = `${x},${y}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        }
      }
    }
  });

  it('puts small tiles where the detail is and leaves flat areas alone', () => {
    // Detail only in the left half.
    const detail = (x: number) => (x < 4 * UNITS_PER_BASE ? 50 + x : 0);
    const cells = buildCells(8, 8, 1, detail);
    const left = cells.filter((c) => c.x < 4 * UNITS_PER_BASE);
    const right = cells.filter((c) => c.x >= 4 * UNITS_PER_BASE);
    expect(right.every((c) => c.size === UNITS_PER_BASE)).toBe(true);
    expect(left.some((c) => c.size < UNITS_PER_BASE)).toBe(true);
  });

  it('records the base cell each tile sits in', () => {
    const cells = buildCells(6, 6, 1, (x, y) => x + y);
    for (const c of cells) {
      expect(c.base).toBe(Math.floor(c.y / UNITS_PER_BASE) * 6 + Math.floor(c.x / UNITS_PER_BASE));
    }
  });
});
