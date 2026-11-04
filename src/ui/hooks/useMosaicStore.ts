import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../../types';
import type { LogEntry, MosaicSettings, ResultStats, Stage, TileRecord } from '../../types';

export interface SkippedFile {
  name: string;
  reason: string;
}

interface MosaicState {
  tiles: TileRecord[];
  analyzing: boolean;
  analyzeProgress: { done: number; total: number };
  skippedFiles: SkippedFile[];

  target: File | null;
  targetUrl: string | null;

  settings: MosaicSettings;

  stage: Stage | 'idle';
  stageDurations: Partial<Record<Stage, number>>;
  renderProgress: { done: number; total: number };
  rendering: boolean;

  resultBitmap: ImageBitmap | null;
  stats: ResultStats | null;

  log: LogEntry[];
  error: string | null;

  addLog: (level: LogEntry['level'], message: string) => void;
  setTiles: (updater: (tiles: TileRecord[]) => TileRecord[]) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalyzeProgress: (done: number, total: number) => void;
  addSkipped: (file: SkippedFile) => void;
  clearPhotos: () => void;
  setTarget: (file: File | null) => void;
  updateSettings: (patch: Partial<MosaicSettings>) => void;
  setStage: (stage: Stage | 'idle', duration?: number) => void;
  setRenderProgress: (done: number, total: number) => void;
  setRendering: (rendering: boolean) => void;
  setResult: (bitmap: ImageBitmap | null, stats: ResultStats | null) => void;
  setError: (message: string | null) => void;
}

export const useMosaicStore = create<MosaicState>((set, get) => ({
  tiles: [],
  analyzing: false,
  analyzeProgress: { done: 0, total: 0 },
  skippedFiles: [],

  target: null,
  targetUrl: null,

  settings: DEFAULT_SETTINGS,

  stage: 'idle',
  stageDurations: {},
  renderProgress: { done: 0, total: 0 },
  rendering: false,

  resultBitmap: null,
  stats: null,

  log: [],
  error: null,

  addLog: (level, message) =>
    set((s) => ({ log: [...s.log, { level, message, ts: Date.now() }] })),

  setTiles: (updater) => set((s) => ({ tiles: updater(s.tiles) })),
  setAnalyzing: (analyzing) => set({ analyzing }),
  setAnalyzeProgress: (done, total) => set({ analyzeProgress: { done, total } }),
  addSkipped: (file) => set((s) => ({ skippedFiles: [...s.skippedFiles, file] })),
  clearPhotos: () => set({ tiles: [], skippedFiles: [], analyzeProgress: { done: 0, total: 0 } }),

  setTarget: (file) => {
    const prev = get().targetUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ target: file, targetUrl: file ? URL.createObjectURL(file) : null });
  },

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  setStage: (stage, duration) =>
    set((s) => ({
      stage,
      stageDurations: duration !== undefined && stage !== 'idle' ? { ...s.stageDurations, [stage]: duration } : s.stageDurations,
    })),
  setRenderProgress: (done, total) => set({ renderProgress: { done, total } }),
  setRendering: (rendering) => set({ rendering }),
  setResult: (resultBitmap, stats) => set({ resultBitmap, stats }),
  setError: (error) => set({ error }),
}));
