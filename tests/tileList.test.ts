import { describe, expect, it } from 'vitest';
import { buildTileListCsv } from '../src/core/tileList';

describe('buildTileListCsv', () => {
  const map = { rects: Float32Array.from([0, 0, 0.5, 0.5, 0.5, 0, 1, 0.5]), tileIds: Int32Array.from([7, 9]) };

  it('writes a header plus one row per tile', () => {
    const lines = buildTileListCsv(map, (id) => `p${id}.jpg`).trim().split('\n');
    expect(lines).toEqual([
      'tile,left_pct,top_pct,width_pct,height_pct,photo',
      '1,0.000,0.000,50.000,50.000,p7.jpg',
      '2,50.000,0.000,50.000,50.000,p9.jpg',
    ]);
  });

  it('quotes names containing commas and quotes', () => {
    const csv = buildTileListCsv(map, () => 'a, "b".jpg');
    expect(csv).toContain('"a, ""b"".jpg"');
  });
});
