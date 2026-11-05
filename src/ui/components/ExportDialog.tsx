import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { buildTileListCsv } from '../../core/tileList';
import type { ExportFormat } from '../../types';

const SIZE_PRESETS = { Screen: 4000, Poster: 8000 } as const;
type SizeChoice = keyof typeof SIZE_PRESETS | 'Custom';

// Common limits are 16384 px a side and ~268 MP. The worker tests the real limit before rendering.
const MAX_SIDE = 16000;
const WARN_MEGAPIXELS = 100;
const PRINT_DPI = 300;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const target = useMosaicStore((s) => s.target);
  const stats = useMosaicStore((s) => s.stats);
  const map = useMosaicStore((s) => s.map);
  const tiles = useMosaicStore((s) => s.tiles);
  const resultIsDraft = useMosaicStore((s) => s.resultIsDraft);
  const exporting = useMosaicStore((s) => s.exporting);
  const exportProgress = useMosaicStore((s) => s.exportProgress);
  const exportResult = useMosaicStore((s) => s.exportResult);
  const { exportMosaic, cancelExport } = useWorkers();

  const [sizeChoice, setSizeChoice] = useState<SizeChoice>('Screen');
  const [customWidth, setCustomWidth] = useState(6000);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(0.9);

  const aspect = stats ? stats.outputHeight / stats.outputWidth : 0.75;
  const maxWidth = Math.floor(aspect > 1 ? MAX_SIDE / aspect : MAX_SIDE);
  const width = Math.min(maxWidth, sizeChoice === 'Custom' ? customWidth : SIZE_PRESETS[sizeChoice]);
  const height = Math.round(width * aspect);
  const megapixels = (width * height) / 1_000_000;

  const estimatedBytes = useMemo(() => {
    // Measured on real mosaics: tile detail compresses poorly, so PNG is about 1.9 bytes per pixel.
    const px = width * height;
    return format === 'png' ? px * 1.9 : px * (0.1 + quality * quality * 0.7);
  }, [width, height, format, quality]);

  const printInches = { w: width / PRINT_DPI, h: height / PRINT_DPI };
  const ready = exportResult && !exporting && exportResult.width === width;
  const percent = exportProgress.total ? (exportProgress.done / exportProgress.total) * 100 : 0;

  const downloadTileList = () => {
    if (!map) return;
    const names = new Map(tiles.map((t) => [t.id, t.name]));
    const csv = buildTileListCsv(map, (id) => names.get(id) ?? '');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mosaic-tile-list.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={exporting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Export mosaic</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 0.5 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Size</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {(['Screen', 'Poster', 'Custom'] as const).map((choice) => (
                <Chip
                  key={choice}
                  label={choice === 'Custom' ? 'Custom' : `${choice} (${SIZE_PRESETS[choice].toLocaleString()} px)`}
                  color={sizeChoice === choice ? 'primary' : 'default'}
                  variant={sizeChoice === choice ? 'filled' : 'outlined'}
                  aria-pressed={sizeChoice === choice}
                  disabled={exporting}
                  onClick={() => setSizeChoice(choice)}
                />
              ))}
            </Stack>
            {sizeChoice === 'Custom' && (
              <Slider
                size="small"
                aria-label="Custom width"
                value={Math.min(customWidth, maxWidth)}
                min={800}
                max={maxWidth}
                step={100}
                valueLabelDisplay="auto"
                disabled={exporting}
                onChange={(_, v) => setCustomWidth(v as number)}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {width.toLocaleString()} × {height.toLocaleString()} px · {megapixels.toFixed(0)} MP
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Prints at {PRINT_DPI} DPI: {printInches.w.toFixed(1)} × {printInches.h.toFixed(1)} in ({(printInches.w * 2.54).toFixed(0)} × {(printInches.h * 2.54).toFixed(0)} cm)
            </Typography>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Format</Typography>
            <ToggleButtonGroup exclusive size="small" value={format} aria-label="Format" disabled={exporting} onChange={(_, v) => v && setFormat(v)}>
              <ToggleButton value="png">PNG</ToggleButton>
              <ToggleButton value="jpeg">JPEG</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {format === 'jpeg' && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Quality</Typography>
              <Slider
                size="small"
                aria-label="JPEG quality"
                value={quality}
                min={0.5}
                max={1}
                step={0.05}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                disabled={exporting}
                onChange={(_, v) => setQuality(v as number)}
              />
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Estimated file size: ~{formatBytes(estimatedBytes)}
          </Typography>

          {megapixels > WARN_MEGAPIXELS && (
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1.5 }}>
              {megapixels.toFixed(0)} MP is very large. It may take a while and some browsers can refuse it. If PNG fails, the export falls back to JPEG.
            </Alert>
          )}

          {exporting && (
            <Stack spacing={0.5}>
              <LinearProgress
                variant={exportProgress.total && percent < 100 ? 'determinate' : 'indeterminate'}
                value={percent}
                sx={{ borderRadius: 1, height: 6 }}
              />
              <Typography variant="caption" color="text.secondary">
                {percent < 100 ? `Rendering ${Math.round(percent)}%` : 'Encoding file...'}
              </Typography>
            </Stack>
          )}

          {ready && (
            <Alert severity="success" variant="outlined" sx={{ borderRadius: 1.5 }}>
              Ready: {exportResult.width.toLocaleString()} × {exportResult.height.toLocaleString()} {exportResult.format.toUpperCase()} ({formatBytes(exportResult.bytes)})
            </Alert>
          )}

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary" sx={{ pr: 1 }}>
              Building it by hand? Get a list of which photo goes where.
            </Typography>
            <Button size="small" disabled={!map || resultIsDraft} onClick={downloadTileList} sx={{ flexShrink: 0 }}>
              Tile list (CSV)
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {exporting ? (
          <Button color="inherit" onClick={cancelExport}>
            Cancel
          </Button>
        ) : (
          <Button color="inherit" onClick={onClose}>
            Close
          </Button>
        )}
        {ready ? (
          <Button
            variant="contained"
            startIcon={<DownloadOutlinedIcon />}
            href={exportResult.url}
            download={`mosaic-${exportResult.width}x${exportResult.height}.${exportResult.format === 'jpeg' ? 'jpg' : 'png'}`}
          >
            Download
          </Button>
        ) : (
          <Button variant="contained" disabled={!target || exporting} onClick={() => exportMosaic({ width, format, quality })}>
            {exporting ? 'Rendering...' : 'Render export'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
