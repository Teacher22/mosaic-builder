import { useCallback, useRef } from 'react';
import { useMosaicStore } from './useMosaicStore';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ExportFormat,
  ExportRequest,
  RenderRequest,
  Stage,
  WorkerEvent,
} from '../../types';

const POOL_SIZE = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

export function useWorkers() {
  const analyzeWorkersRef = useRef<Worker[]>([]);
  const renderWorkerRef = useRef<Worker | null>(null);
  const exportWorkerRef = useRef<Worker | null>(null);

  const cancelAnalyze = useCallback(() => {
    analyzeWorkersRef.current.forEach((w) => w.terminate());
    analyzeWorkersRef.current = [];
    useMosaicStore.getState().setAnalyzing(false);
  }, []);

  const cancelRender = useCallback(() => {
    renderWorkerRef.current?.terminate();
    renderWorkerRef.current = null;
    useMosaicStore.getState().setRendering(false);
    useMosaicStore.getState().setStage('idle');
  }, []);

  const cancelExport = useCallback(() => {
    exportWorkerRef.current?.terminate();
    exportWorkerRef.current = null;
    useMosaicStore.getState().setExporting(false);
  }, []);

  const analyzePhotos = useCallback(
    (files: File[]) => {
      cancelAnalyze();
      const store = useMosaicStore.getState();
      store.clearPhotos();
      if (files.length === 0) return;

      store.setAnalyzing(true);
      store.setAnalyzeProgress(0, files.length);
      store.addLog('info', `Analysing ${files.length} photo(s)...`);

      const startedAt = performance.now();
      const poolSize = Math.min(POOL_SIZE, files.length);
      const chunkSize = Math.ceil(files.length / poolSize);
      let completed = 0;
      let cacheHits = 0;
      let workersDone = 0;
      let activeWorkerCount = 0;

      for (let w = 0; w < poolSize; w++) {
        const startId = w * chunkSize;
        const slice = files.slice(startId, startId + chunkSize);
        if (slice.length === 0) continue;
        activeWorkerCount++;

        const worker = new Worker(new URL('../../worker/analyze.worker.ts', import.meta.url), { type: 'module' });
        analyzeWorkersRef.current.push(worker);

        worker.onmessage = (ev: MessageEvent<AnalyzeResponse>) => {
          const msg = ev.data;
          const s = useMosaicStore.getState();
          if (msg.type === 'result') {
            completed++;
            if (msg.fromCache) cacheHits++;
            s.setTiles((tiles) => [
              ...tiles,
              { id: msg.id, name: msg.name, features: Float32Array.from(msg.features), file: files[msg.id] },
            ]);
            s.setAnalyzeProgress(completed, files.length);
          } else if (msg.type === 'skipped') {
            completed++;
            s.addSkipped({ name: msg.name, reason: msg.reason });
            s.addLog('warn', `Skipped ${msg.name}: ${msg.reason}`);
            s.setAnalyzeProgress(completed, files.length);
          } else if (msg.type === 'done') {
            worker.terminate();
            analyzeWorkersRef.current = analyzeWorkersRef.current.filter((x) => x !== worker);
            workersDone++;
            if (workersDone === activeWorkerCount) {
              const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
              const store2 = useMosaicStore.getState();
              store2.setAnalyzing(false);
              store2.incCacheHits(cacheHits);
              const cacheNote = cacheHits > 0 ? `, ${cacheHits} from cache` : '';
              store2.addLog('info', `Analysed ${completed} photo(s) (${elapsed}s${cacheNote})`);
            }
          }
        };

        const request: AnalyzeRequest = { type: 'analyze', files: slice, startId };
        worker.postMessage(request);
      }
    },
    [cancelAnalyze],
  );

  const generate = useCallback(
    (opts?: { outputWidthOverride?: number; quiet?: boolean }) => {
      const s = useMosaicStore.getState();
      if (!s.target || s.tiles.length === 0 || s.rendering) return;

      cancelRender();
      s.setRendering(true);
      s.setError(null);
      s.resetStageDurations();
      if (s.resultBitmap) s.resultBitmap.close();
      if (s.previewBitmap) s.previewBitmap.close();
      s.setPreviewBitmap(null);
      s.setResult(null, null);

      const worker = new Worker(new URL('../../worker/render.worker.ts', import.meta.url), { type: 'module' });
      renderWorkerRef.current = worker;

      const stageStartTimes: Partial<Record<Stage, number>> = {};
      let prevStage: Stage | null = null;
      const startedAt = performance.now();

      worker.onmessage = (ev: MessageEvent<WorkerEvent>) => {
        const msg = ev.data;
        const store = useMosaicStore.getState();
        switch (msg.type) {
          case 'stage': {
            const now = performance.now();
            if (prevStage) store.setStageDuration(prevStage, now - stageStartTimes[prevStage]!);
            stageStartTimes[msg.stage] = now;
            prevStage = msg.stage;
            store.setStage(msg.stage);
            if (!opts?.quiet) store.addLog('info', `Stage: ${msg.stage}`);
            break;
          }
          case 'progress':
            store.setRenderProgress(msg.done, msg.total);
            break;
          case 'tiles-batch':
            break;
          case 'preview': {
            const prev = useMosaicStore.getState().previewBitmap;
            if (prev) prev.close();
            store.setPreviewBitmap(msg.bitmap);
            break;
          }
          case 'log':
            store.addLog(msg.level, msg.message);
            break;
          case 'done': {
            const now = performance.now();
            if (prevStage) store.setStageDuration(prevStage, now - stageStartTimes[prevStage]!);
            const prevPreview = useMosaicStore.getState().previewBitmap;
            if (prevPreview) {
              prevPreview.close();
              store.setPreviewBitmap(null);
            }
            store.setStage('done');
            store.setResult(msg.bitmap, { ...msg.stats, totalTimeMs: now - startedAt });
            store.setRendering(false);
            if (!opts?.quiet) {
              store.clearSettingsDirty();
              store.addLog('info', `Mosaic generated (${((now - startedAt) / 1000).toFixed(1)}s)`);
            }
            renderWorkerRef.current = null;
            worker.terminate();
            break;
          }
          case 'error':
            store.setError(msg.message);
            store.addLog('error', msg.message);
            store.setRendering(false);
            renderWorkerRef.current = null;
            worker.terminate();
            break;
        }
      };

      const settings = opts?.outputWidthOverride
        ? { ...s.settings, outputWidth: opts.outputWidthOverride }
        : s.settings;

      const request: RenderRequest = {
        type: 'render',
        targetFile: s.target,
        settings,
        tiles: s.tiles.map((t) => ({ id: t.id, name: t.name, features: Array.from(t.features), file: t.file })),
      };
      worker.postMessage(request);
    },
    [cancelRender],
  );

  const exportMosaic = useCallback((opts: { width: number; format: ExportFormat; quality: number }) => {
    const s = useMosaicStore.getState();
    if (!s.target || s.tiles.length === 0 || s.exporting) return;

    cancelExport();
    s.setExporting(true);
    s.setExportProgress(0, 0);
    s.setError(null);

    const worker = new Worker(new URL('../../worker/render.worker.ts', import.meta.url), { type: 'module' });
    exportWorkerRef.current = worker;
    const startedAt = performance.now();

    worker.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const msg = ev.data;
      const store = useMosaicStore.getState();
      switch (msg.type) {
        case 'export-progress':
          store.setExportProgress(msg.done, msg.total);
          break;
        case 'log':
          store.addLog(msg.level, msg.message);
          break;
        case 'export-done': {
          const url = URL.createObjectURL(msg.blob);
          store.setExportResult({
            url,
            format: msg.stats.format,
            width: msg.stats.width,
            height: msg.stats.height,
            bytes: msg.stats.bytes,
          });
          store.setExporting(false);
          const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
          store.addLog(
            'info',
            `Exported ${msg.stats.width}×${msg.stats.height} ${msg.stats.format.toUpperCase()} (${seconds}s)`,
          );
          exportWorkerRef.current = null;
          worker.terminate();
          break;
        }
        case 'export-error':
          store.setError(msg.message);
          store.addLog('error', msg.message);
          store.setExporting(false);
          exportWorkerRef.current = null;
          worker.terminate();
          break;
      }
    };

    const request: ExportRequest = {
      type: 'export',
      targetFile: s.target,
      settings: s.settings,
      tiles: s.tiles.map((t) => ({ id: t.id, name: t.name, features: Array.from(t.features), file: t.file })),
      exportWidth: opts.width,
      format: opts.format,
      quality: opts.quality,
    };
    worker.postMessage(request);
  }, [cancelExport]);

  return { analyzePhotos, generate, exportMosaic, cancelAnalyze, cancelRender, cancelExport };
}
