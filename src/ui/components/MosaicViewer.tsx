import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import CenterFocusWeakOutlinedIcon from '@mui/icons-material/CenterFocusWeakOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const clampScale = (s: number) => Math.min(8, Math.max(0.2, s));
const DIVIDER_HIT_WIDTH = 32;

export function MosaicViewer({ onOpenExport }: { onOpenExport: () => void }) {
  const resultBitmap = useMosaicStore((s) => s.resultBitmap);
  const previewBitmap = useMosaicStore((s) => s.previewBitmap);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const rendering = useMosaicStore((s) => s.rendering);
  const { generate } = useWorkers();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [comparePercent, setComparePercent] = useState(50);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const displayBitmap = resultBitmap ?? previewBitmap;

  useEffect(() => {
    if (!displayBitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = displayBitmap.width;
    canvas.height = displayBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(displayBitmap, 0, 0);
  }, [displayBitmap]);

  // Reset the view whenever a fresh result lands, not on every snapshot.
  // Adjusted during render (React's recommended pattern for "state that
  // depends on a prop changing") rather than in an effect, so it commits
  // in the same pass instead of triggering an extra render.
  const [lastResultForView, setLastResultForView] = useState(resultBitmap);
  if (resultBitmap !== lastResultForView) {
    setLastResultForView(resultBitmap);
    setTransform({ scale: 1, x: 0, y: 0 });
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setTransform((t) => ({ ...t, scale: clampScale(t.scale * factor) }));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y };
    setIsDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setTransform((t) => ({ ...t, x: dragState.current!.originX + dx, y: dragState.current!.originY + dy }));
  };
  const onPointerUp = () => {
    dragState.current = null;
    setIsDragging(false);
  };

  // getBoundingClientRect reports the zoomed and panned box, so the divider
  // tracks the pointer exactly at any zoom level.
  const moveDividerTo = (clientX: number) => {
    const wrap = stageWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setComparePercent(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Without this the viewer behind would start panning the image too.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) moveDividerTo(e.clientX);
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
    setComparePercent(update);
  };

  const zoomBy = (factor: number) => setTransform((t) => ({ ...t, scale: clampScale(t.scale * factor) }));
  const resetView = () => setTransform({ scale: 1, x: 0, y: 0 });
  const zoom100 = () => {
    const canvas = canvasRef.current;
    const wrap = stageWrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const fitWidth = rect.width / transform.scale;
    setTransform({ scale: clampScale(canvas.width / fitWidth), x: 0, y: 0 });
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mosaic.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const showCompare = !!resultBitmap && !!targetUrl;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        bgcolor: 'background.default',
        borderRadius: 3,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Box
        onWheel={displayBitmap ? onWheel : undefined}
        onPointerDown={displayBitmap ? onPointerDown : undefined}
        onPointerMove={displayBitmap ? onPointerMove : undefined}
        onPointerUp={displayBitmap ? onPointerUp : undefined}
        onPointerLeave={onPointerUp}
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          p: 2,
          cursor: displayBitmap ? 'grab' : 'default',
          touchAction: 'none',
        }}
      >
        {displayBitmap ? (
          <Box
            ref={stageWrapRef}
            sx={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 60ms linear',
              borderRadius: 1.5,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {showCompare && (
              <Box
                component="img"
                src={targetUrl}
                alt="Target"
                draggable={false}
                sx={{ display: 'block', width: '100%', height: 'auto' }}
              />
            )}
            <Box
              component="canvas"
              ref={canvasRef}
              sx={{
                display: 'block',
                width: '100%',
                height: 'auto',
                position: showCompare ? 'absolute' : 'static',
                inset: 0,
                clipPath: showCompare ? `inset(0 ${100 - comparePercent}% 0 0)` : undefined,
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
                onPointerDown={onDividerPointerDown}
                onPointerMove={onDividerPointerMove}
                onKeyDown={onDividerKeyDown}
                // Sizes are divided by the zoom so the handle stays the same
                // size on screen however far the image is scaled.
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${comparePercent}%`,
                  width: `${DIVIDER_HIT_WIDTH / transform.scale}px`,
                  ml: `${-DIVIDER_HIT_WIDTH / 2 / transform.scale}px`,
                  cursor: 'ew-resize',
                  touchAction: 'none',
                  outline: 'none',
                  '&:focus-visible .compare-knob': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '50%',
                    width: `${2 / transform.scale}px`,
                    ml: `${-1 / transform.scale}px`,
                    bgcolor: 'common.white',
                    boxShadow: 2,
                  }}
                />
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
                    transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
                  }}
                >
                  <CompareArrowsIcon fontSize="small" />
                </Box>
              </Box>
            )}
          </Box>
        ) : targetUrl ? (
          <Box component="img" src={targetUrl} alt="Target preview" sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 2, opacity: 0.5 }} />
        ) : (
          <Stack spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
            <ImageOutlinedIcon sx={{ fontSize: 48 }} />
            <Typography variant="body2">Load photos and a target image to begin</Typography>
          </Stack>
        )}
      </Box>

      {displayBitmap && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ position: 'absolute', top: 16, right: 16, bgcolor: 'background.paper', borderRadius: 2, p: 0.5, boxShadow: 1 }}
        >
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={() => zoomBy(1 / 1.3)}>
              <ZoomOutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit">
            <IconButton size="small" onClick={resetView}>
              <CenterFocusWeakOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" onClick={zoom100}>
            100%
          </Button>
          <Tooltip title="Zoom in">
            <IconButton size="small" onClick={() => zoomBy(1.3)}>
              <ZoomInOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      {resultBitmap && (
        <Stack direction="row" spacing={1} sx={{ position: 'absolute', top: 16, left: 16 }}>
          <Tooltip title="Replay build">
            <IconButton size="small" onClick={() => generate()} disabled={rendering} sx={{ bgcolor: 'background.paper', boxShadow: 1 }}>
              <ReplayOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      {resultBitmap && (
        <Stack direction="row" spacing={1} sx={{ position: 'absolute', bottom: 16, right: 16 }}>
          <Button startIcon={<DownloadOutlinedIcon />} variant="outlined" size="small" onClick={download} sx={{ bgcolor: 'background.paper' }}>
            Quick PNG
          </Button>
          <Button startIcon={<FileDownloadOutlinedIcon />} variant="contained" size="small" onClick={onOpenExport}>
            Export…
          </Button>
        </Stack>
      )}

      {showCompare && (
        // Right padding keeps the "Target" label clear of the download buttons.
        <Box sx={{ pl: 3, pr: '260px', pb: 1.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              Mosaic
            </Typography>
            <Slider size="small" value={comparePercent} onChange={(_, v) => setComparePercent(v as number)} />
            <Typography variant="caption" color="text.secondary">
              Target
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
