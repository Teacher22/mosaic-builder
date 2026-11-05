// Shared types for worker <-> UI communication and core data structures.

export type GroutColor = 'dark' | 'light';

export interface MosaicSettings {
  tilesAcross: number;
  outputWidth: number;
  reuseRadius: number;
  /** Scale-free: 1 means a photo used its fair share of times costs one typical match distance. */
  usagePenalty: number;
  /** 0..1: how far each tile's tones move toward the target. */
  colorCorrect: number;
  /** 0..0.5: wash of the original target over the finished result. */
  blend: number;
  /** 0..1: how much of the image gets smaller tiles where the target has detail. */
  adaptiveDetail: number;
  /** 0..0.12: gap between tiles, as a fraction of the tile's width. */
  grout: number;
  groutColor: GroutColor;
  seed: number;
}

export const DEFAULT_SETTINGS: MosaicSettings = {
  tilesAcross: 60,
  outputWidth: 4000,
  reuseRadius: 4,
  usagePenalty: 1,
  colorCorrect: 0.7,
  blend: 0,
  adaptiveDetail: 0,
  grout: 0,
  groutColor: 'dark',
  seed: 1,
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

/** A photo: cheap File handle, its features and a small cached thumbnail. */
export interface TileRecord {
  id: number;
  /** Stable identity across sessions: name + size + lastModified. */
  key: string;
  name: string;
  features: FeatureVector;
  file: File;
  thumb: Blob;
}

export interface ResultStats {
  outputWidth: number;
  outputHeight: number;
  cols: number;
  rows: number;
  tilesPlaced: number;
  uniquePhotosUsed: number;
  uniquePhotosUnused: number;
  mostReusedCount: number;
  /** Repeat radius actually applied, which can be below the requested one for small libraries. */
  effectiveRadius: number;
  /** Structural similarity to the target (0..1) when both are viewed small. */
  likeness: number;
  /** Mean OKLab colour error at the same size; lower is better. */
  colorError: number;
  totalTimeMs: number;
}

/** Where every tile landed: enables the inspector, heatmap, replay and tile list. */
export interface MosaicMap {
  /** x0,y0,x1,y1 per cell, normalised to 0..1. */
  rects: Float32Array;
  tileIds: Int32Array;
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
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; ts: number }
  | { type: 'preview'; bitmap: ImageBitmap }
  | { type: 'done'; bitmap: ImageBitmap; stats: ResultStats; map: MosaicMap }
  | { type: 'error'; message: string }
  | { type: 'export-progress'; done: number; total: number }
  | { type: 'export-done'; blob: Blob; stats: ExportStats }
  | { type: 'export-error'; message: string };

/** Every event from the render worker names the run it belongs to, so stale ones can be dropped. */
export type RenderWorkerEvent = WorkerEvent & { runId: number };

export interface AnalyzeItem {
  id: number;
  key: string;
  name: string;
  /** The image bytes. A converted JPEG for HEIC files the browser can't decode natively. */
  blob: Blob;
  isHeic: boolean;
}

/** Message sent to an analyze.worker instance. */
export interface AnalyzeRequest {
  type: 'analyze';
  items: AnalyzeItem[];
  /** Skip the cache lookup: used when re-submitting a converted HEIC. */
  skipCache?: boolean;
}

export interface AnalyzeResult {
  id: number;
  features: Float32Array;
  thumb: Blob;
  fromCache: boolean;
}

export type AnalyzeResponse =
  | {
      type: 'batch';
      results: AnalyzeResult[];
      skipped: { name: string; reason: string }[];
      /** HEIC files this browser can't decode here; the main thread converts and resubmits them. */
      needsConversion: number[];
    }
  | { type: 'cache-unavailable'; reason: string }
  | { type: 'done' };

/** Message sent to the render worker to produce a result for the viewer. */
export interface RenderRequest {
  type: 'render';
  runId: number;
  targetFile: Blob;
  targetKey: string;
  settings: MosaicSettings;
  tiles: TileRecord[];
  /** Low-res live preview: no build animation, and it doesn't replace a full render's status. */
  draft: boolean;
}

/** Message sent to the render worker to produce a high-res export. */
export interface ExportRequest {
  type: 'export';
  runId: number;
  targetFile: Blob;
  targetKey: string;
  settings: MosaicSettings;
  tiles: TileRecord[];
  exportWidth: number;
  format: ExportFormat;
  quality: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  ts: number;
}
