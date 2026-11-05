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
import type { ExportFormat } from '../../types';

const SIZE_PRESETS = {
  Screen: 4000,
  Poster: 8000,
} as const;

// Rough browser canvas safety ceiling (comfortably under the common 16384px /
// ~268 MP caps) past which we warn before the user commits to an export.
const WARN_MEGAPIXELS = 56;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const target = useMosaicStore((s) => s.target);
  const stats = useMosaicStore((s) => s.stats);
  const exporting = useMosaicStore((s) => s.exporting);
  const exportProgress = useMosaicStore((s) => s.exportProgress);
  const exportResult = useMosaicStore((s) => s.exportResult);
  const { exportMosaic } = useWorkers();

  const [sizeChoice, setSizeChoice] = useState<'Screen' | 'Poster' | 'Custom'>('Screen');
  const [customWidth, setCustomWidth] = useState(stats?.outputWidth ?? 4000);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(0.9);

  const width = sizeChoice === 'Custom' ? customWidth : SIZE_PRESETS[sizeChoice];
  const aspect = stats ? stats.outputHeight / stats.outputWidth : 0.75;
  const height = Math.round(width * aspect);
  const megapixels = (width * height) / 1_000_000;

  const estimatedBytes = useMemo(() => {
    // Very rough heuristics: PNG ~0.6 bytes/px for photo-like content, JPEG
    // scales with quality. Good enough for a ballpark label, not a promise.
    const px = width * height;
    return format === 'png' ? px * 0.6 : px * (0.08 + quality * 0.25);
  }, [width, height, format, quality]);

  const tooBig = megapixels > WARN_MEGAPIXELS;

  const handleExport = () => {
    exportMosaic({ width, format, quality });
  };

  return (
    <Dialog open={open} onClose={exporting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Export mosaic</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack spacing={1}>
            <Typography variant="body2">Size</Typography>
            <Stack direction="row" spacing={1}>
              {(['Screen', 'Poster', 'Custom'] as const).map((choice) => (
                <Chip
                  key={choice}
                  label={choice === 'Custom' ? 'Custom' : `${choice} (${SIZE_PRESETS[choice]}px)`}
                  color={sizeChoice === choice ? 'primary' : 'default'}
                  variant={sizeChoice === choice ? 'filled' : 'outlined'}
                  onClick={() => setSizeChoice(choice)}
                />
              ))}
            </Stack>
            {sizeChoice === 'Custom' && (
              <Slider
                size="small"
                value={customWidth}
                min={800}
                max={10000}
                step={100}
                valueLabelDisplay="auto"
                onChange={(_, v) => setCustomWidth(v as number)}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {width} × {height}px · ~{megapixels.toFixed(0)} MP
            </Typography>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="body2">Format</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={format}
              onChange={(_, v) => v && setFormat(v)}
            >
              <ToggleButton value="png">PNG</ToggleButton>
              <ToggleButton value="jpeg">JPEG</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {format === 'jpeg' && (
            <Stack spacing={1}>
              <Typography variant="body2">Quality</Typography>
              <Slider
                size="small"
                value={quality}
                min={0.5}
                max={1}
                step={0.05}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                onChange={(_, v) => setQuality(v as number)}
              />
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Estimated file size: ~{formatBytes(estimatedBytes)}
          </Typography>

          {tooBig && (
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
              {width}×{height} is a big export ({megapixels.toFixed(0)} MP). It may be slow, and PNG can fail on
              some browsers at this size — we'll automatically fall back to JPEG if that happens.
            </Alert>
          )}

          {exporting && (
            <Stack spacing={0.5}>
              <LinearProgress
                variant={exportProgress.total ? 'determinate' : 'indeterminate'}
                value={exportProgress.total ? (exportProgress.done / exportProgress.total) * 100 : 0}
                sx={{ borderRadius: 1, height: 6 }}
              />
              <Typography variant="caption" color="text.secondary">
                Rendering export…
              </Typography>
            </Stack>
          )}

          {exportResult && !exporting && (
            <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
              Ready: {exportResult.width}×{exportResult.height} {exportResult.format.toUpperCase()} (
              {formatBytes(exportResult.bytes)})
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={exporting}>
          Close
        </Button>
        {exportResult && !exporting ? (
          <Button
            variant="contained"
            startIcon={<DownloadOutlinedIcon />}
            href={exportResult.url}
            download={`mosaic-${exportResult.width}x${exportResult.height}.${exportResult.format === 'jpeg' ? 'jpg' : 'png'}`}
          >
            Download
          </Button>
        ) : (
          <Button variant="contained" disabled={!target || exporting} onClick={handleExport}>
            {exporting ? 'Rendering…' : 'Render export'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
