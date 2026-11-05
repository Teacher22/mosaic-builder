import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Divider, IconButton, Paper, Slider, Tooltip, Typography, useTheme } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import FitScreenOutlinedIcon from '@mui/icons-material/FitScreenOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import VerticalSplitOutlinedIcon from '@mui/icons-material/VerticalSplitOutlined';
import WhatshotOutlinedIcon from '@mui/icons-material/WhatshotOutlined';
import BlurOnOutlinedIcon from '@mui/icons-material/BlurOnOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { EmptyState } from './EmptyState';
import type { MosaicMap } from '../../types';

const DIVIDER_HIT_WIDTH = 32;
const FIT_PADDING = 20;
const MIN_ZOOM = 0.5;
const REPLAY_MS = 2600;
const OVERLAY_WIDTH = 1600;
/** Blur, in tiles, for the squint test: enough to melt tiles into the overall image. */
const SQUINT_TILES = 0.45;

interface View {
  /** 1 fits the image in the viewer. Relative, so swapping a draft for a full render keeps your place. */
  zoom: number;
  panX: number;
  panY: number;
}
const FIT_VIEW: View = { zoom: 1, panX: 0, panY: 0 };

function cellAt(map: MosaicMap, nx: number, ny: number): number {
  const count = map.tileIds.length;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (nx >= map.rects[p] && nx < map.rects[p + 2] && ny >= map.rects[p + 1] && ny < map.rects[p + 3]) return i;
  }
  return -1;
}

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton
          size="small"
          aria-label={title.replace(/ \(.*\)$/, '')}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          color={active ? 'primary' : 'default'}
          sx={{ bgcolor: active ? 'action.selected' : 'transparent' }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function InspectorCard({ map, cell, x, y, bounds }: { map: MosaicMap; cell: number; x: number; y: number; bounds: { w: number; h: number } }) {
  const tiles = useMosaicStore((s) => s.tiles);
  const tileId = map.tileIds[cell];
  const tile = useMemo(() => tiles.find((t) => t.id === tileId), [tiles, tileId]);
  const uses = useMemo(() => {
    let n = 0;
    for (let i = 0; i < map.tileIds.length; i++) if (map.tileIds[i] === tileId) n++;
    return n;
  }, [map, tileId]);
  const thumbUrl = useMemo(() => (tile ? URL.createObjectURL(tile.thumb) : null), [tile]);
  useEffect(
    () => () => {
      if (thumbUrl) setTimeout(() => URL.revokeObjectURL(thumbUrl));
    },
    [thumbUrl],
  );
  if (!tile) return null;

  const CARD_WIDTH = 190;
  const left = x + CARD_WIDTH + 28 > bounds.w ? x - CARD_WIDTH - 16 : x + 16;
  const top = Math.min(y + 16, bounds.h - 220);

  return (
    <Paper elevation={6} sx={{ position: 'absolute', left, top: Math.max(8, top), width: CARD_WIDTH, p: 1, borderRadius: 2, pointerEvents: 'none', zIndex: 5 }}>
      {thumbUrl && <Box component="img" src={thumbUrl} alt="" sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1, display: 'block', mb: 0.75 }} />}
      <Typography variant="caption" noWrap display="block" sx={{ fontWeight: 600 }}>
        {tile.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Used {uses} {uses === 1 ? 'time' : 'times'} in this mosaic
      </Typography>
    </Paper>
  );
}

export function MosaicViewer() {
  const theme = useTheme();
  const resultBitmap = useMosaicStore((s) => s.resultBitmap);
  const previewBitmap = useMosaicStore((s) => s.previewBitmap);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const rendering = useMosaicStore((s) => s.rendering);
  const stats = useMosaicStore((s) => s.stats);
  const map = useMosaicStore((s) => s.map);
  const seed = useMosaicStore((s) => s.settings.seed);
  const updateSettings = useMosaicStore((s) => s.updateSettings);
  const { generate } = useWorkers();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(FIT_VIEW);
  const [dragging, setDragging] = useState(false);
  const [splitOn, setSplitOn] = useState(true);
  const [comparePercent, setComparePercent] = useState(50);
  const [heatmap, setHeatmap] = useState(false);
  const [squint, setSquint] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [hover, setHover] = useState<{ cell: number; x: number; y: number } | null>(null);

  const displayBitmap = (rendering && previewBitmap) || resultBitmap;
  const showResultTools = !!resultBitmap && !rendering;
  const showCompare = showResultTools && splitOn && !!targetUrl && !replaying;
  const imageW = displayBitmap?.width ?? 0;
  const imageH = displayBitmap?.height ?? 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = imageW && size.w ? Math.min((size.w - FIT_PADDING * 2) / imageW, (size.h - FIT_PADDING * 2) / imageH) : 1;
  const scale = fitScale * view.zoom;
  const left = (size.w - imageW * scale) / 2 + view.panX;
  const top = (size.h - imageH * scale) / 2 + view.panY;
  const dpr = window.devicePixelRatio || 1;
  // A full-resolution pixel at 100% is one device pixel; allow 4x past that to study a tile.
  const maxZoom = Math.max(8, 4 / dpr / Math.max(fitScale, 1e-6));

  const cancelReplay = useCallback(() => {
    if (replayRef.current !== null) cancelAnimationFrame(replayRef.current);
    replayRef.current = null;
    setReplaying(false);
  }, []);

  useEffect(() => {
    if (!displayBitmap || !canvasRef.current) return;
    cancelReplay();
    const canvas = canvasRef.current;
    canvas.width = displayBitmap.width;
    canvas.height = displayBitmap.height;
    canvas.getContext('2d')?.drawImage(displayBitmap, 0, 0);
  }, [displayBitmap, cancelReplay]);

  const zoomAround = useCallback(
    (clientX: number | null, clientY: number | null, factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const cx = clientX === null ? 0 : clientX - bounds.left - bounds.width / 2;
      const cy = clientY === null ? 0 : clientY - bounds.top - bounds.height / 2;
      setView((v) => {
        const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, v.zoom * factor));
        const k = zoom / v.zoom;
        // Keeps the point under the cursor in place.
        return { zoom, panX: cx - (cx - v.panX) * k, panY: cy - (cy - v.panY) * k };
      });
    },
    [maxZoom],
  );

  // React attaches wheel listeners as passive, so preventing page scroll needs a native one.
  const hasImage = !!displayBitmap;
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasImage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAround(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround, hasImage]);

  const fit = useCallback(() => setView(FIT_VIEW), []);
  const zoom100 = useCallback(() => {
    if (fitScale > 0) setView({ zoom: 1 / dpr / fitScale, panX: 0, panY: 0 });
  }, [fitScale, dpr]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
      panStart.current = null;
    } else {
      panStart.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, moved: false };
      setDragging(true);
    }
  };

  const updateInspector = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container || !map) return;
    const rect = stage.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const onTargetSide = showCompare && nx * 100 > comparePercent;
    if (nx < 0 || ny < 0 || nx >= 1 || ny >= 1 || onTargetSide) {
      setHover(null);
      return;
    }
    const bounds = container.getBoundingClientRect();
    const cell = cellAt(map, nx, ny);
    setHover(cell >= 0 ? { cell, x: clientX - bounds.left, y: clientY - bounds.top } : null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, (pinchStart.current.zoom * distance) / pinchStart.current.distance));
      setView((v) => ({ ...v, zoom }));
      return;
    }
    if (panStart.current) {
      const { x, y, panX, panY } = panStart.current;
      setView((v) => ({ ...v, panX: panX + e.clientX - x, panY: panY + e.clientY - y }));
      return;
    }
    if (inspect && showResultTools) updateInspector(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      setDragging(false);
    }
  };

  const moveDividerTo = (clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    // getBoundingClientRect reports the zoomed and panned box, so this holds at any zoom.
    const rect = stage.getBoundingClientRect();
    setComparePercent(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };
  const onDividerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const next: Record<string, (v: number) => number> = {
      ArrowLeft: (v) => Math.max(0, v - step),
      ArrowRight: (v) => Math.min(100, v + step),
      Home: () => 0,
      End: () => 100,
    };
    const update = next[e.key];
    if (!update) return;
    e.preventDefault();
    e.stopPropagation();
    setComparePercent(update);
  };

  // Heatmap and "where else is this photo" both draw on one overlay.
  const heatColor = theme.palette.error.main;
  const highlightColor = theme.palette.warning.main;
  const hoverColor = theme.palette.common.white;
  const hoverCell = inspect && showResultTools ? hover?.cell ?? null : null;
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !map || !imageW) return;
    canvas.width = OVERLAY_WIDTH;
    canvas.height = Math.round((OVERLAY_WIDTH * imageH) / imageW);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const rectOf = (i: number) => {
      const p = i * 4;
      return [map.rects[p] * W, map.rects[p + 1] * H, (map.rects[p + 2] - map.rects[p]) * W, (map.rects[p + 3] - map.rects[p + 1]) * H] as const;
    };

    if (heatmap) {
      const counts = new Map<number, number>();
      for (const id of map.tileIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      let max = 1;
      for (const c of counts.values()) max = Math.max(max, c);
      ctx.fillStyle = heatColor;
      for (let i = 0; i < map.tileIds.length; i++) {
        const c = counts.get(map.tileIds[i]) ?? 1;
        ctx.globalAlpha = max > 1 ? ((c - 1) / (max - 1)) * 0.85 : 0;
        ctx.fillRect(...rectOf(i));
      }
      ctx.globalAlpha = 1;
    }

    if (hoverCell !== null) {
      const id = map.tileIds[hoverCell];
      const line = Math.max(2, W / 500);
      ctx.lineWidth = line;
      ctx.strokeStyle = highlightColor;
      for (let i = 0; i < map.tileIds.length; i++) {
        if (map.tileIds[i] === id && i !== hoverCell) ctx.strokeRect(...rectOf(i));
      }
      ctx.lineWidth = line * 1.6;
      ctx.strokeStyle = hoverColor;
      ctx.strokeRect(...rectOf(hoverCell));
    }
  }, [map, imageW, imageH, heatmap, hoverCell, heatColor, highlightColor, hoverColor]);

  const replay = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = useMosaicStore.getState().resultBitmap;
    const currentMap = useMosaicStore.getState().map;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !bitmap || !currentMap || !ctx) return;
    cancelReplay();

    const redrawAll = () => ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      redrawAll();
      return;
    }

    const count = currentMap.tileIds.length;
    const order = Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => currentMap.rects[a * 4 + 1] - currentMap.rects[b * 4 + 1] || currentMap.rects[a * 4] - currentMap.rects[b * 4],
    );
    // Starts from a heavily blurred version, the same placeholder a live build shows.
    const tiny = new OffscreenCanvas(32, Math.max(1, Math.round((32 * canvas.height) / canvas.width)));
    const tinyCtx = tiny.getContext('2d')!;
    tinyCtx.imageSmoothingQuality = 'high';
    tinyCtx.drawImage(bitmap, 0, 0, tiny.width, tiny.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);

    setReplaying(true);
    const started = performance.now();
    let placed = 0;
    const W = canvas.width;
    const H = canvas.height;
    const frame = (now: number) => {
      const goal = Math.min(count, Math.ceil(((now - started) / REPLAY_MS) * count));
      for (; placed < goal; placed++) {
        const p = order[placed] * 4;
        const x = Math.round(currentMap.rects[p] * W);
        const y = Math.round(currentMap.rects[p + 1] * H);
        const w = Math.round(currentMap.rects[p + 2] * W) - x;
        const h = Math.round(currentMap.rects[p + 3] * H) - y;
        ctx.drawImage(bitmap, x, y, w, h, x, y, w, h);
      }
      if (placed < count) {
        replayRef.current = requestAnimationFrame(frame);
      } else {
        replayRef.current = null;
        setReplaying(false);
      }
    };
    replayRef.current = requestAnimationFrame(frame);
  }, [cancelReplay]);

  const reshuffle = useCallback(() => {
    updateSettings({ seed: seed + 1 });
    generate();
  }, [seed, updateSettings, generate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, [role="dialog"]')) return;
      const actions: Record<string, () => void> = {
        '+': () => zoomAround(null, null, 1.3),
        '=': () => zoomAround(null, null, 1.3),
        '-': () => zoomAround(null, null, 1 / 1.3),
        '0': fit,
        '1': zoom100,
        c: () => setSplitOn((v) => !v),
        h: () => setHeatmap((v) => !v),
        i: () => setInspect((v) => !v),
        s: () => setSquint((v) => !v),
        r: replay,
      };
      const action = actions[e.key.toLowerCase()];
      if (action && (hasImage || !['c', 'h', 'i', 's', 'r'].includes(e.key.toLowerCase()))) action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomAround, fit, zoom100, replay, hasImage]);

  const handle = 1 / scale;
  const squintPx = stats && imageW ? (imageW / stats.cols) * SQUINT_TILES : 0;
  const clip = showCompare ? `inset(0 ${100 - comparePercent}% 0 0)` : undefined;

  return (
    <Box
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      sx={{
        flex: 1,
        position: 'relative',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 2,
        bgcolor: 'action.hover',
        cursor: hasImage ? (dragging ? 'grabbing' : inspect ? 'crosshair' : 'grab') : 'default',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <AnimatePresence>
        {!hasImage && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <EmptyState />
          </motion.div>
        )}
      </AnimatePresence>

      <Box
        ref={stageRef}
        sx={{
          display: hasImage ? 'block' : 'none',
          position: 'absolute',
          left: 0,
          top: 0,
          width: imageW,
          height: imageH,
          transformOrigin: '0 0',
          transform: `translate(${left}px, ${top}px) scale(${scale})`,
          boxShadow: 8,
          overflow: 'hidden',
        }}
      >
        {showCompare && (
          <Box component="img" src={targetUrl!} alt="Target" draggable={false} sx={{ display: 'block', width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
        )}
        <Box
          component="canvas"
          ref={canvasRef}
          aria-label="Mosaic"
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            clipPath: clip,
            filter: squint && showResultTools ? `blur(${squintPx}px)` : 'none',
          }}
        />
        <Box
          component="canvas"
          ref={overlayRef}
          aria-hidden
          sx={{
            display: map && showResultTools ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            clipPath: clip,
          }}
        />
        {showCompare && (
          <Box
            role="slider"
            tabIndex={0}
            aria-label="Compare mosaic and target"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(comparePercent)}
            onPointerDown={(e) => {
              // Without this the viewer behind would start panning too.
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              if (e.currentTarget.hasPointerCapture(e.pointerId)) moveDividerTo(e.clientX);
            }}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={onDividerKeyDown}
            // Sizes are divided by the scale so the handle stays the same size on screen.
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${comparePercent}%`,
              width: `${DIVIDER_HIT_WIDTH * handle}px`,
              ml: `${(-DIVIDER_HIT_WIDTH / 2) * handle}px`,
              cursor: 'ew-resize',
              touchAction: 'none',
              outline: 'none',
              '&:focus-visible .compare-knob': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: `${2 * handle}px`, ml: `${-1 * handle}px`, bgcolor: 'common.white', boxShadow: 2 }} />
            <Box
              className="compare-knob"
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'common.white',
                color: 'grey.800',
                boxShadow: 3,
                transform: `translate(-50%, -50%) scale(${handle})`,
              }}
            >
              <CompareArrowsIcon fontSize="small" />
            </Box>
          </Box>
        )}
      </Box>

      {hoverCell !== null && hover && map && (
        <InspectorCard map={map} cell={hover.cell} x={hover.x} y={hover.y} bounds={size} />
      )}

      {hasImage && (
        <Paper
          elevation={4}
          onPointerDown={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 12,
            transform: 'translateX(-50%)',
            borderRadius: 2,
            px: 0.75,
            py: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            maxWidth: 'calc(100% - 24px)',
            overflowX: 'auto',
          }}
        >
          <ToolButton title="Zoom out (-)" onClick={() => zoomAround(null, null, 1 / 1.3)}>
            <RemoveIcon fontSize="small" />
          </ToolButton>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(scale * dpr * 100)}%
          </Typography>
          <ToolButton title="Zoom in (+)" onClick={() => zoomAround(null, null, 1.3)}>
            <AddIcon fontSize="small" />
          </ToolButton>
          <ToolButton title="Fit (0)" onClick={fit}>
            <FitScreenOutlinedIcon fontSize="small" />
          </ToolButton>
          <Tooltip title="Actual pixels (1)">
            <Button size="small" color="inherit" onClick={zoom100} sx={{ minWidth: 0, px: 0.75, fontSize: 12 }}>
              100%
            </Button>
          </Tooltip>

          {showResultTools && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <ToolButton title="Compare with target (C)" active={splitOn} onClick={() => setSplitOn((v) => !v)}>
                <VerticalSplitOutlinedIcon fontSize="small" />
              </ToolButton>
              {splitOn && (
                <Slider
                  size="small"
                  aria-label="Compare position"
                  value={comparePercent}
                  onChange={(_, v) => setComparePercent(v as number)}
                  sx={{ width: 76, mx: 1, flexShrink: 0 }}
                />
              )}
              <ToolButton title="Inspect tiles: hover to see each photo (I)" active={inspect} onClick={() => setInspect((v) => !v)}>
                <ManageSearchOutlinedIcon fontSize="small" />
              </ToolButton>
              <ToolButton title="Reuse heatmap: redder tiles are repeated more (H)" active={heatmap} onClick={() => setHeatmap((v) => !v)}>
                <WhatshotOutlinedIcon fontSize="small" />
              </ToolButton>
              <ToolButton title="Squint test: how it reads from across the room (S)" active={squint} onClick={() => setSquint((v) => !v)}>
                <BlurOnOutlinedIcon fontSize="small" />
              </ToolButton>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <ToolButton title="Replay build (R)" disabled={replaying} onClick={replay}>
                <ReplayOutlinedIcon fontSize="small" />
              </ToolButton>
              <ToolButton title="Reshuffle: same settings, a new arrangement" onClick={reshuffle}>
                <CasinoOutlinedIcon fontSize="small" />
              </ToolButton>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}
