// Shared types for worker <-> UI communication and core data structures.

export interface MosaicSettings {
  tilesAcross: number;
  outputWidth: number;
  reuseRadius: number;
  usagePenalty: number;
  colorCorrect: number; // 0..1
  blend: number; // 0..1, mosaic-wide wash of the original target over the result
}

export const DEFAULT_SETTINGS: MosaicSettings = {
  tilesAcross: 60,
  outputWidth: 2400,
  reuseRadius: 4,
  usagePenalty: 0.15,
  colorCorrect: 0,
  blend: 0,
};

export interface GridInfo {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  targetWidth: number;
  targetHeight: number;
}

/** 3x3 grid of OKLab colour samples, flattened to 27 floats (9 cells x L,a,b). */
export type FeatureVector = Float32Array;

/** A photo kept in the main-thread store: cheap File handle + its features. */
export interface TileRecord {
  id: number;
  name: string;
  features: FeatureVector;
  file: File;
}

export interface TileDescriptor {
  id: number;
  name: string;
  features: number[];
  file: File;
}

export interface ResultStats {
  outputWidth: number;
  outputHeight: number;
  tilesPlaced: number;
  uniquePhotosUsed: number;
  uniquePhotosUnused: number;
  mostReusedCount: number;
  totalTimeMs: number;
}

export type Stage = 'analyse' | 'match' | 'render' | 'done';
export type ExportFormat = 'png' | 'jpeg';

export interface ExportStats {
  width: number;
  height: number;
  format: ExportFormat;
  bytes: number;
}

export type WorkerEvent =
  | { type: 'stage'; stage: Stage; startedAt: number }
  | { type: 'progress'; stage: string; done: number; total: number; etaMs?: number }
  | { type: 'tiles-batch'; placements: { cell: number; tileId: number }[] }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; ts: number }
  | { type: 'preview'; bitmap: ImageBitmap }
  | { type: 'done'; bitmap: ImageBitmap; stats: ResultStats }
  | { type: 'error'; message: string }
  | { type: 'export-progress'; done: number; total: number }
  | { type: 'export-done'; blob: Blob; stats: ExportStats }
  | { type: 'export-error'; message: string };

/** Message sent to an analyze.worker instance. */
export interface AnalyzeRequest {
  type: 'analyze';
  files: File[];
  startId: number;
}

export type AnalyzeResponse =
  | { type: 'result'; id: number; name: string; features: number[]; fromCache: boolean }
  | { type: 'skipped'; name: string; reason: string }
  | { type: 'done' };

/** Message sent to the render.worker instance to produce the on-screen preview. */
export interface RenderRequest {
  type: 'render';
  targetFile: File;
  settings: MosaicSettings;
  tiles: TileDescriptor[];
}

/** Message sent to the render.worker instance to produce a high-res export. */
export interface ExportRequest {
  type: 'export';
  targetFile: File;
  settings: MosaicSettings;
  tiles: TileDescriptor[];
  exportWidth: number;
  format: ExportFormat;
  quality: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  ts: number;
}
