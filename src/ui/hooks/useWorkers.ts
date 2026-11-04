import { useCallback, useRef } from 'react';
import { useMosaicStore } from './useMosaicStore';
import type { AnalyzeRequest, AnalyzeResponse, RenderRequest, Stage, WorkerEvent } from '../../types';

const POOL_SIZE = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);

export function useWorkers() {
  const analyzeWorkersRef = useRef<Worker[]>([]);
  const renderWorkerRef = useRef<Worker | null>(null);

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

  const analyzePhotos = useCallback((files: File[]) => {
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
            useMosaicStore.getState().setAnalyzing(false);
            useMosaicStore.getState().addLog('info', `Analysed ${completed} photo(s) (${elapsed}s)`);
          }
        }
      };

      const request: AnalyzeRequest = { type: 'analyze', files: slice, startId };
      worker.postMessage(request);
    }
  }, [cancelAnalyze]);

  const generate = useCallback(() => {
    const s = useMosaicStore.getState();
    if (!s.target || s.tiles.length === 0 || s.rendering) return;

    cancelRender();
    s.setRendering(true);
    s.setError(null);
    if (s.resultBitmap) s.resultBitmap.close();
    s.setResult(null, null);

    const worker = new Worker(new URL('../../worker/render.worker.ts', import.meta.url), { type: 'module' });
    renderWorkerRef.current = worker;

    const stageStarts: Partial<Record<Stage, number>> = {};
    const startedAt = performance.now();

    worker.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const msg = ev.data;
      const store = useMosaicStore.getState();
      switch (msg.type) {
        case 'stage':
          stageStarts[msg.stage] = msg.startedAt;
          store.setStage(msg.stage);
          store.addLog('info', `Stage: ${msg.stage}`);
          break;
        case 'progress':
          store.setRenderProgress(msg.done, msg.total);
          break;
        case 'tiles-batch':
          break;
        case 'log':
          store.addLog(msg.level, msg.message);
          break;
        case 'done': {
          store.setStage('done', performance.now() - startedAt);
          store.setResult(msg.bitmap, { ...msg.stats, totalTimeMs: performance.now() - startedAt });
          store.setRendering(false);
          const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
          store.addLog('info', `Mosaic generated (${seconds}s)`);
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

    const request: RenderRequest = {
      type: 'render',
      targetFile: s.target,
      settings: s.settings,
      tiles: s.tiles.map((t) => ({ id: t.id, name: t.name, features: Array.from(t.features), file: t.file })),
    };
    worker.postMessage(request);
  }, [cancelRender]);

  return { analyzePhotos, generate, cancelAnalyze, cancelRender };
}
