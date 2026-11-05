import { useMosaicStore } from './useMosaicStore';
import { cacheKey } from '../../store/cache';
import type {
  AnalyzeItem,
  AnalyzeRequest,
  AnalyzeResponse,
  ExportFormat,
  ExportRequest,
  RenderRequest,
  RenderWorkerEvent,
  Stage,
  TileRecord,
} from '../../types';

const POOL_SIZE = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
const STORE_FLUSH_MS = 120;
const LIVE_PREVIEW_WIDTH = 1000;

// Workers live at module level, not per component, so any component's Cancel
// reaches the work another component started.
let analyzeWorkers: Worker[] = [];
let analyzeFlushTimer: ReturnType<typeof setInterval> | null = null;
let nextTileId = 0;
let renderWorker: Worker | null = null;
let exportWorker: Worker | null = null;
let currentRunId = 0;
let currentExportRunId = 0;

function spawnAnalyzeWorker(): Worker {
  return new Worker(new URL('../../worker/analyze.worker.ts', import.meta.url), { type: 'module' });
}
function spawnRenderWorker(): Worker {
  return new Worker(new URL('../../worker/render.worker.ts', import.meta.url), { type: 'module' });
}

function isHeic(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
}

function targetKey(file: File): string {
  return cacheKey(file.name, file.size, file.lastModified);
}

function stopAnalyze(): void {
  analyzeWorkers.forEach((w) => w.terminate());
  analyzeWorkers = [];
  if (analyzeFlushTimer) clearInterval(analyzeFlushTimer);
  analyzeFlushTimer = null;
}

function cancelAnalyze(): void {
  stopAnalyze();
  const s = useMosaicStore.getState();
  if (!s.analyzing) return;
  s.setAnalyzing(false);
  s.addLog('info', `Stopped analysing. Kept ${s.tiles.length} photo(s) finished so far.`);
}

function cancelRender(): void {
  // Terminating is the only way to interrupt a decode that's mid-flight.
  renderWorker?.terminate();
  renderWorker = null;
  currentRunId++;
  const s = useMosaicStore.getState();
  const wasRendering = s.rendering;
  s.setRendering(false);
  s.setDrafting(false);
  s.setPreviewBitmap(null);
  s.setStage(s.resultBitmap ? 'done' : 'idle');
  if (wasRendering) s.addLog('info', 'Render cancelled.');
}

function cancelExport(): void {
  exportWorker?.terminate();
  exportWorker = null;
  currentExportRunId++;
  const s = useMosaicStore.getState();
  if (s.exporting) s.addLog('info', 'Export cancelled.');
  s.setExporting(false);
}

/** Lazily loads the HEIC decoder only when a browser that can't read HEIC meets one. */
async function convertHeic(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(converted) ? converted[0] : converted;
}

/** Target images go straight to an <img>, so HEIC must be converted first where it isn't natively readable. */
async function setTargetFile(file: File): Promise<void> {
  const s = useMosaicStore.getState();
  if (!isHeic(file)) {
    s.setTarget(file);
    return;
  }
  try {
    await createImageBitmap(file).then((b) => b.close());
    s.setTarget(file);
  } catch {
    try {
      s.addLog('info', `Converting ${file.name}...`);
      const jpeg = await convertHeic(file);
      s.setTarget(new File([jpeg], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified }));
    } catch (err) {
      const message = `Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
      s.addLog('error', message);
      s.setToast({ severity: 'error', message });
    }
  }
}

function analyzePhotos(incoming: File[], opts?: { thenGenerate?: boolean }): void {
  stopAnalyze();
  const store = useMosaicStore.getState();

  const known = new Set(store.tiles.map((t) => t.key));
  const fileById = new Map<number, { file: File; key: string }>();
  const items: AnalyzeItem[] = [];
  let duplicates = 0;
  for (const file of incoming) {
    const key = cacheKey(file.name, file.size, file.lastModified);
    if (known.has(key)) {
      duplicates++;
      continue;
    }
    known.add(key);
    const id = nextTileId++;
    fileById.set(id, { file, key });
    items.push({ id, key, name: file.name, blob: file, isHeic: isHeic(file) });
  }
  if (duplicates > 0) store.addLog('info', `Skipped ${duplicates} photo(s) already loaded.`);
  if (items.length === 0) return;

  store.startAnalyze(items.length);
  store.addLog('info', `Analysing ${items.length} photo(s)...`);

  const startedAt = performance.now();
  const poolSize = Math.min(POOL_SIZE, items.length);
  const chunkSize = Math.ceil(items.length / poolSize);
  let completed = 0;
  let cacheHits = 0;
  let converting = 0;
  let workersDone = 0;
  let pendingTiles: TileRecord[] = [];
  let cacheWarned = false;

  // Results are applied to the store in groups: thousands of separate updates
  // would each re-render the UI and copy the growing list.
  const flush = () => {
    const s = useMosaicStore.getState();
    if (pendingTiles.length > 0) {
      s.addTiles(pendingTiles);
      pendingTiles = [];
    }
    s.setAnalyzeProgress(completed, items.length);
  };
  analyzeFlushTimer = setInterval(flush, STORE_FLUSH_MS);

  const finishIfDone = () => {
    if (workersDone < analyzeWorkers.length || converting > 0) return;
    stopAnalyze();
    flush();
    const s = useMosaicStore.getState();
    s.setAnalyzing(false);
    s.incCacheHits(cacheHits);
    const elapsed = performance.now() - startedAt;
    s.setStageDuration('analyse', elapsed);
    const cacheNote = cacheHits > 0 ? `, ${cacheHits} from cache` : '';
    s.addLog('info', `Analysed ${completed} photo(s) (${(elapsed / 1000).toFixed(1)}s${cacheNote})`);
    if (opts?.thenGenerate) generate();
  };

  const convertAndResubmit = async (id: number, worker: Worker) => {
    const entry = fileById.get(id)!;
    converting++;
    try {
      const blob = await convertHeic(entry.file);
      const request: AnalyzeRequest = {
        type: 'analyze',
        skipCache: true,
        items: [{ id, key: entry.key, name: entry.file.name, blob, isHeic: true }],
      };
      if (!analyzeWorkers.includes(worker)) return;
      workersDone--; // this worker has one more 'done' to report
      worker.postMessage(request);
    } catch (err) {
      completed++;
      const reason = err instanceof Error ? err.message : String(err);
      const s = useMosaicStore.getState();
      s.addSkipped([{ name: entry.file.name, reason }]);
      s.addLog('warn', `Skipped ${entry.file.name}: ${reason}`);
    } finally {
      converting--;
      finishIfDone();
    }
  };

  for (let w = 0; w < poolSize; w++) {
    const slice = items.slice(w * chunkSize, (w + 1) * chunkSize);
    if (slice.length === 0) continue;
    const worker = spawnAnalyzeWorker();
    analyzeWorkers.push(worker);

    worker.onmessage = (ev: MessageEvent<AnalyzeResponse>) => {
      const msg = ev.data;
      if (msg.type === 'done') {
        workersDone++;
        finishIfDone();
        return;
      }
      const s = useMosaicStore.getState();
      if (msg.type === 'cache-unavailable') {
        if (!cacheWarned) s.addLog('warn', `Couldn't save the analysis cache (${msg.reason}). Everything still works, but photos will be re-read next time.`);
        cacheWarned = true;
        return;
      }
      for (const r of msg.results) {
        const entry = fileById.get(r.id)!;
        completed++;
        if (r.fromCache) cacheHits++;
        pendingTiles.push({ id: r.id, key: entry.key, name: entry.file.name, features: r.features, file: entry.file, thumb: r.thumb });
      }
      if (msg.skipped.length > 0) {
        completed += msg.skipped.length;
        s.addSkipped(msg.skipped);
        for (const f of msg.skipped) s.addLog('warn', `Skipped ${f.name}: ${f.reason}`);
      }
      for (const id of msg.needsConversion) convertAndResubmit(id, worker);
    };
    worker.onerror = (ev) => {
      const s = useMosaicStore.getState();
      s.addLog('error', `Analysis worker failed: ${ev.message}`);
      s.setToast({ severity: 'error', message: `Analysis failed: ${ev.message}` });
      workersDone++;
      finishIfDone();
    };

    const request: AnalyzeRequest = { type: 'analyze', items: slice };
    worker.postMessage(request);
  }
}

function clearAllPhotos(): void {
  stopAnalyze();
  const s = useMosaicStore.getState();
  s.setAnalyzing(false);
  s.clearPhotos();
}

function generate(opts?: { draft?: boolean }): void {
  const s = useMosaicStore.getState();
  if (!s.target || s.tiles.length === 0 || s.analyzing) return;
  const draft = !!opts?.draft;
  // A draft never interrupts a full render; a full render replaces any draft.
  if (draft && s.rendering) return;

  const runId = ++currentRunId;
  if (!renderWorker) renderWorker = spawnRenderWorker();
  const worker = renderWorker;

  if (draft) {
    s.setDrafting(true);
  } else {
    s.setDrafting(false);
    s.beginRender();
    s.setPreviewBitmap(null);
    s.setStage('match');
    s.addLog('info', `Generating ${s.settings.tilesAcross} tiles across at ${s.settings.outputWidth}px...`);
  }

  const startedAt = performance.now();
  let stageStart = startedAt;
  let prevStage: Stage | null = null;

  worker.onmessage = (ev: MessageEvent<RenderWorkerEvent>) => {
    const msg = ev.data;
    if (msg.runId !== currentRunId) {
      if (msg.type === 'preview' || msg.type === 'done') msg.bitmap.close();
      return;
    }
    const store = useMosaicStore.getState();
    switch (msg.type) {
      case 'stage': {
        if (draft) break;
        const now = performance.now();
        if (prevStage) store.setStageDuration(prevStage, now - stageStart);
        stageStart = now;
        prevStage = msg.stage;
        store.setStage(msg.stage);
        break;
      }
      case 'progress':
        if (!draft) store.setRenderProgress(msg.done, msg.total);
        break;
      case 'preview':
        store.setPreviewBitmap(msg.bitmap);
        break;
      case 'log':
        store.addLog(msg.level, msg.message);
        break;
      case 'done': {
        const now = performance.now();
        if (draft) {
          store.setResult(msg.bitmap, { ...msg.stats, totalTimeMs: now - startedAt }, msg.map, true);
          store.setDrafting(false);
          break;
        }
        if (prevStage) store.setStageDuration(prevStage, now - stageStart);
        store.setResult(msg.bitmap, { ...msg.stats, totalTimeMs: now - startedAt }, msg.map, false);
        store.setPreviewBitmap(null);
        store.setStage('done');
        store.setRendering(false);
        store.clearSettingsDirty();
        store.addLog('info', `Mosaic generated (${((now - startedAt) / 1000).toFixed(1)}s, likeness ${Math.round(msg.stats.likeness * 100)}%)`);
        break;
      }
      case 'error':
        store.setToast({ severity: 'error', message: msg.message });
        store.addLog('error', msg.message);
        store.setRendering(false);
        store.setDrafting(false);
        if (!draft) store.setStage('failed');
        break;
    }
  };

  worker.onerror = (ev) => {
    const store = useMosaicStore.getState();
    store.setToast({ severity: 'error', message: `Render failed: ${ev.message}` });
    store.addLog('error', `Render worker failed: ${ev.message}`);
    store.setRendering(false);
    store.setDrafting(false);
    store.setStage('failed');
    renderWorker?.terminate();
    renderWorker = null;
  };

  const settings = draft
    ? { ...s.settings, outputWidth: Math.min(LIVE_PREVIEW_WIDTH, s.settings.outputWidth) }
    : s.settings;
  const request: RenderRequest = {
    type: 'render',
    runId,
    targetFile: s.target,
    targetKey: targetKey(s.target),
    settings,
    tiles: s.tiles,
    draft,
  };
  worker.postMessage(request);
}

function exportMosaic(opts: { width: number; format: ExportFormat; quality: number }): void {
  const s = useMosaicStore.getState();
  if (!s.target || s.tiles.length === 0 || s.exporting) return;

  s.setExporting(true);
  s.setExportProgress(0, 0);
  s.setExportResult(null);

  const runId = ++currentExportRunId;
  if (!exportWorker) exportWorker = spawnRenderWorker();
  const worker = exportWorker;
  const startedAt = performance.now();

  worker.onmessage = (ev: MessageEvent<RenderWorkerEvent>) => {
    const msg = ev.data;
    if (msg.runId !== currentExportRunId) return;
    const store = useMosaicStore.getState();
    switch (msg.type) {
      case 'export-progress':
        store.setExportProgress(msg.done, msg.total);
        break;
      case 'log':
        store.addLog(msg.level, msg.message);
        break;
      case 'export-done': {
        store.setExportResult({
          url: URL.createObjectURL(msg.blob),
          format: msg.stats.format,
          width: msg.stats.width,
          height: msg.stats.height,
          bytes: msg.stats.bytes,
        });
        store.setExporting(false);
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        store.addLog('info', `Exported ${msg.stats.width}×${msg.stats.height} ${msg.stats.format.toUpperCase()} (${seconds}s)`);
        store.setToast({ severity: 'success', message: `Export ready in ${seconds}s` });
        // Originals decoded for a big export shouldn't stay in memory.
        exportWorker?.terminate();
        exportWorker = null;
        break;
      }
      case 'export-error':
        store.setToast({ severity: 'error', message: msg.message });
        store.addLog('error', msg.message);
        store.setExporting(false);
        exportWorker?.terminate();
        exportWorker = null;
        break;
    }
  };

  const request: ExportRequest = {
    type: 'export',
    runId,
    targetFile: s.target,
    targetKey: targetKey(s.target),
    settings: s.settings,
    tiles: s.tiles,
    exportWidth: opts.width,
    format: opts.format,
    quality: opts.quality,
  };
  worker.postMessage(request);
}

const actions = { analyzePhotos, setTargetFile, clearAllPhotos, generate, exportMosaic, cancelAnalyze, cancelRender, cancelExport };

/** Stable actions, shared by every component. */
export function useWorkers() {
  return actions;
}
