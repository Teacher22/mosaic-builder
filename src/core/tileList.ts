import type { MosaicMap } from '../types';

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * One row per tile: where it sits (as percentages, so it applies at any print
 * size) and which photo goes there. Enough to assemble a mosaic by hand.
 */
export function buildTileListCsv(map: MosaicMap, nameOf: (tileId: number) => string): string {
  const rows = ['tile,left_pct,top_pct,width_pct,height_pct,photo'];
  const percent = (v: number) => (v * 100).toFixed(3);
  for (let i = 0; i < map.tileIds.length; i++) {
    const x0 = map.rects[i * 4];
    const y0 = map.rects[i * 4 + 1];
    const x1 = map.rects[i * 4 + 2];
    const y1 = map.rects[i * 4 + 3];
    rows.push([i + 1, percent(x0), percent(y0), percent(x1 - x0), percent(y1 - y0), csvField(nameOf(map.tileIds[i]))].join(','));
  }
  return rows.join('\n') + '\n';
}
