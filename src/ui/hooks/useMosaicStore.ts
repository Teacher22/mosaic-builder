import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '../../types';
import type { ExportFormat, LogEntry, MosaicSettings, ResultStats, Stage, TileRecord } from '../../types';

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface ExportResult {
  url: string;
  format: ExportFormat;
  width: number;
  height: number;
  bytes: number;
}

interface MosaicState {
  tiles: TileRecord[];
  analyzing: boolean;
  analyzeProgress: { done: number; total: number };
  skippedFiles: SkippedFile[];
  cacheHits: number;

  target: File | null;
  targetUrl: string | null;

  settings: MosaicSettings;
  livePreview: boolean;
  settingsDirty: boolean;

  stage: Stage | 'idle';
  stageDurations: Partial<Record<Stage, number>>;
  renderProgress: { done: number; total: number };
  rendering: boolean;

  resultBitmap: ImageBitmap | null;
  previewBitmap: ImageBitmap | null;
  stats: ResultStats | null;

  exporting: boolean;
  exportProgress: { done: number; total: number };
  exportResult: ExportResult | null;

  log: LogEntry[];
  error: string | null;

  addLog: (level: LogEntry['level'], message: string) => void;
  setTiles: (updater: (tiles: TileRecord[]) => TileRecord[]) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalyzeProgress: (done: number, total: number) => void;
  addSkipped: (file: SkippedFile) => void;
  incCacheHits: (n: number) => void;
  clearPhotos: () => void;
  setTarget: (file: File | null) => void;
  updateSettings: (patch: Partial<MosaicSettings>) => void;
  setLivePreview: (on: boolean) => void;
  clearSettingsDirty: () => void;
  setStage: (stage: Stage | 'idle') => void;
  setStageDuration: (stage: Stage, ms: number) => void;
  resetStageDurations: () => void;
  setRenderProgress: (done: number, total: number) => void;
  setRendering: (rendering: boolean) => void;
  setResult: (bitmap: ImageBitmap | null, stats: ResultStats | null) => void;
  setPreviewBitmap: (bitmap: ImageBitmap | null) => void;
  setExporting: (exporting: boolean) => void;
  setExportProgress: (done: number, total: number) => void;
  setExportResult: (result: ExportResult | null) => void;
  setError: (message: string | null) => void;
}

export const useMosaicStore = create<MosaicState>()(
  persist(
    (set, get) => ({
      tiles: [],
      analyzing: false,
      analyzeProgress: { done: 0, total: 0 },
      skippedFiles: [],
      cacheHits: 0,

      target: null,
      targetUrl: null,

      settings: DEFAULT_SETTINGS,
      livePreview: true,
      settingsDirty: false,

      stage: 'idle',
      stageDurations: {},
      renderProgress: { done: 0, total: 0 },
      rendering: false,

      resultBitmap: null,
      previewBitmap: null,
      stats: null,

      exporting: false,
      exportProgress: { done: 0, total: 0 },
      exportResult: null,

      log: [],
      error: null,

      addLog: (level, message) =>
        set((s) => ({ log: [...s.log, { level, message, ts: Date.now() }] })),

      setTiles: (updater) => set((s) => ({ tiles: updater(s.tiles) })),
      setAnalyzing: (analyzing) => set({ analyzing }),
      setAnalyzeProgress: (done, total) => set({ analyzeProgress: { done, total } }),
      addSkipped: (file) => set((s) => ({ skippedFiles: [...s.skippedFiles, file] })),
      incCacheHits: (n) => set((s) => ({ cacheHits: s.cacheHits + n })),
      clearPhotos: () =>
        set({ tiles: [], skippedFiles: [], analyzeProgress: { done: 0, total: 0 }, cacheHits: 0 }),

      setTarget: (file) => {
        const prev = get().targetUrl;
        if (prev) URL.revokeObjectURL(prev);
        set({ target: file, targetUrl: file ? URL.createObjectURL(file) : null });
      },

      updateSettings: (patch) =>
        set((s) => ({
          settings: { ...s.settings, ...patch },
          settingsDirty: s.resultBitmap !== null,
        })),
      setLivePreview: (livePreview) => set({ livePreview }),
      clearSettingsDirty: () => set({ settingsDirty: false }),

      setStage: (stage) => set({ stage }),
      setStageDuration: (stage, ms) => set((s) => ({ stageDurations: { ...s.stageDurations, [stage]: ms } })),
      resetStageDurations: () => set({ stageDurations: {} }),

      setRenderProgress: (done, total) => set({ renderProgress: { done, total } }),
      setRendering: (rendering) => set({ rendering }),
      setResult: (resultBitmap, stats) => set({ resultBitmap, stats }),
      setPreviewBitmap: (previewBitmap) => set({ previewBitmap }),

      setExporting: (exporting) => set({ exporting }),
      setExportProgress: (done, total) => set({ exportProgress: { done, total } }),
      setExportResult: (result) => {
        const prev = get().exportResult;
        if (prev) URL.revokeObjectURL(prev.url);
        set({ exportResult: result });
      },

      setError: (error) => set({ error }),
    }),
    {
      name: 'mosaic-builder:settings',
      partialize: (s) => ({ settings: s.settings, livePreview: s.livePreview }),
    },
  ),
);
