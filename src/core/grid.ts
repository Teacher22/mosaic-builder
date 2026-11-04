import type { GridInfo } from '../types';

/** Square tiles in v1: cell size is derived from the target width and tile count. */
export function computeGrid(targetWidth: number, targetHeight: number, tilesAcross: number): GridInfo {
  const cols = Math.max(1, Math.round(tilesAcross));
  const cellWidth = targetWidth / cols;
  const rows = Math.max(1, Math.round(targetHeight / cellWidth));
  const cellHeight = targetHeight / rows;
  return { cols, rows, cellWidth, cellHeight, targetWidth, targetHeight };
}
