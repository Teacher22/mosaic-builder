import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '../../types';
import type { ExportFormat, LogEntry, MosaicMap, MosaicSettings, ResultStats, Stage, TileRecord } from '../../types';

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

export interface Toast {
  severity: 'success' | 'error' | 'info';
  message: string;
}

export type ThemeChoice = 'light' | 'dark' | 'system';

const MAX_LOG_ENTRIES = 500;

interface MosaicState {
  tiles: TileRecord[];
  analyzing: boolean;
  analyzeProgress: { done: number; total: number };
  analyzeStartedAt: number;
  skippedFiles: SkippedFile[];
  cacheHits: number;

  target: File | null;
  targetUrl: string | null;
  targetAspect: number | null;

  settings: MosaicSettings;
  livePreview: boolean;
  themeChoice: ThemeChoice;
  settingsDirty: boolean;

  stage: Stage | 'idle' | 'failed';
  stageDurations: Partial<Record<Stage, number>>;
  renderProgress: { done: number; total: number };
  renderStartedAt: number;
  /** A full render is running; live-preview drafts don't count. */
  rendering: boolean;
  drafting: boolean;

  resultBitmap: ImageBitmap | null;
  /** The current result is a low-res live preview rather than a full render. */
  resultIsDraft: boolean;
  previewBitmap: ImageBitmap | null;
  stats: ResultStats | null;
  map: MosaicMap | null;

  exporting: boolean;
  exportProgress: { done: number; total: number };
  exportResult: ExportResult | null;

  log: LogEntry[];
  toast: Toast | null;

  addLog: (level: LogEntry['level'], message: string) => void;
  addTiles: (tiles: TileRecord[]) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalyzeProgress: (done: number, total: number) => void;
  startAnalyze: (total: number) => void;
  addSkipped: (files: SkippedFile[]) => void;
  incCacheHits: (n: number) => void;
  clearPhotos: () => void;
  setTarget: (file: File | null) => void;
  updateSettings: (patch: Partial<MosaicSettings>) => void;
  setLivePreview: (on: boolean) => void;
  setThemeChoice: (choice: ThemeChoice) => void;
  clearSettingsDirty: () => void;
  setStage: (stage: Stage | 'idle' | 'failed') => void;
  setStageDuration: (stage: Stage, ms: number) => void;
  setRenderProgress: (done: number, total: number) => void;
  beginRender: () => void;
  setRendering: (rendering: boolean) => void;
  setDrafting: (drafting: boolean) => void;
  setResult: (bitmap: ImageBitmap, stats: ResultStats, map: MosaicMap, isDraft: boolean) => void;
  setPreviewBitmap: (bitmap: ImageBitmap | null) => void;
  setExporting: (exporting: boolean) => void;
  setExportProgress: (done: number, total: number) => void;
  setExportResult: (result: ExportResult | null) => void;
  setToast: (toast: Toast | null) => void;
}

export const useMosaicStore = create<MosaicState>()(
  persist(
    (set, get) => ({
      tiles: [],
      analyzing: false,
      analyzeProgress: { done: 0, total: 0 },
      analyzeStartedAt: 0,
      skippedFiles: [],
      cacheHits: 0,

      target: null,
      targetUrl: null,
      targetAspect: null,

      settings: DEFAULT_SETTINGS,
      livePreview: true,
      themeChoice: 'system',
      settingsDirty: false,

      stage: 'idle',
      stageDurations: {},
      renderProgress: { done: 0, total: 0 },
      renderStartedAt: 0,
      rendering: false,
      drafting: false,

      resultBitmap: null,
      resultIsDraft: false,
      previewBitmap: null,
      stats: null,
      map: null,

      exporting: false,
      exportProgress: { done: 0, total: 0 },
      exportResult: null,

      log: [],
      toast: null,

      addLog: (level, message) =>
        set((s) => ({ log: [...s.log, { level, message, ts: Date.now() }].slice(-MAX_LOG_ENTRIES) })),

      addTiles: (tiles) => set((s) => ({ tiles: [...s.tiles, ...tiles] })),
      setAnalyzing: (analyzing) => set({ analyzing }),
      setAnalyzeProgress: (done, total) => set({ analyzeProgress: { done, total } }),
      startAnalyze: (total) =>
        set((s) => ({
          analyzing: true,
          analyzeProgress: { done: 0, total },
          analyzeStartedAt: performance.now(),
          stage: s.stage === 'failed' ? 'idle' : s.stage,
        })),
      addSkipped: (files) => set((s) => ({ skippedFiles: [...s.skippedFiles, ...files] })),
      incCacheHits: (n) => set((s) => ({ cacheHits: s.cacheHits + n })),
      clearPhotos: () =>
        set((s) => ({
          tiles: [],
          skippedFiles: [],
          analyzeProgress: { done: 0, total: 0 },
          cacheHits: 0,
          stageDurations: { ...s.stageDurations, analyse: undefined },
        })),

      setTarget: (file) => {
        const prev = get().targetUrl;
        if (prev) URL.revokeObjectURL(prev);
        const url = file ? URL.createObjectURL(file) : null;
        set({ target: file, targetUrl: url, targetAspect: null });
        if (file && url) {
          const image = new Image();
          image.onload = () => {
            if (get().targetUrl === url) set({ targetAspect: image.naturalHeight / image.naturalWidth });
          };
          image.src = url;
        }
      },

      updateSettings: (patch) =>
        set((s) => ({
          settings: { ...s.settings, ...patch },
          settingsDirty: s.resultBitmap !== null,
        })),
      setLivePreview: (livePreview) => set({ livePreview }),
      setThemeChoice: (themeChoice) => set({ themeChoice }),
      clearSettingsDirty: () => set({ settingsDirty: false }),

      setStage: (stage) => set({ stage }),
      setStageDuration: (stage, ms) => set((s) => ({ stageDurations: { ...s.stageDurations, [stage]: ms } })),

      setRenderProgress: (done, total) => set({ renderProgress: { done, total } }),
      beginRender: () =>
        set((s) => ({
          rendering: true,
          renderStartedAt: performance.now(),
          renderProgress: { done: 0, total: 0 },
          stageDurations: { analyse: s.stageDurations.analyse },
        })),
      setRendering: (rendering) => set({ rendering }),
      setDrafting: (drafting) => set({ drafting }),
      setResult: (bitmap, stats, map, isDraft) => {
        const { resultBitmap: previous } = get();
        set({ resultBitmap: bitmap, stats, map, resultIsDraft: isDraft });
        previous?.close();
      },
      setPreviewBitmap: (bitmap) => {
        const { previewBitmap: previous } = get();
        set({ previewBitmap: bitmap });
        previous?.close();
      },

      setExporting: (exporting) => set({ exporting }),
      setExportProgress: (done, total) => set({ exportProgress: { done, total } }),
      setExportResult: (result) => {
        const prev = get().exportResult;
        if (prev) URL.revokeObjectURL(prev.url);
        set({ exportResult: result });
      },

      setToast: (toast) => set({ toast }),
    }),
    {
      name: 'mosaic-builder:settings',
      version: 3,
      partialize: (s) => ({ settings: s.settings, livePreview: s.livePreview, themeChoice: s.themeChoice }),
      // Older versions stored penalty values on a different scale, so they're
      // discarded rather than reinterpreted. New fields take their defaults.
      migrate: () => ({ settings: DEFAULT_SETTINGS, livePreview: true, themeChoice: 'system' as ThemeChoice }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MosaicState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);
