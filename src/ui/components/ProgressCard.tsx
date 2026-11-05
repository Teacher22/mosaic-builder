import { useEffect, useState } from 'react';
import { Box, Button, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatSeconds(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** Matching is quick and has no finer progress, so it counts as a small first slice of the whole. */
const MATCH_SHARE = 0.1;

export function ProgressCard() {
  const analyzing = useMosaicStore((s) => s.analyzing);
  const rendering = useMosaicStore((s) => s.rendering);
  const analyzeProgress = useMosaicStore((s) => s.analyzeProgress);
  const analyzeStartedAt = useMosaicStore((s) => s.analyzeStartedAt);
  const renderProgress = useMosaicStore((s) => s.renderProgress);
  const renderStartedAt = useMosaicStore((s) => s.renderStartedAt);
  const skipped = useMosaicStore((s) => s.skippedFiles.length);
  const stage = useMosaicStore((s) => s.stage);
  const outputWidth = useMosaicStore((s) => s.settings.outputWidth);
  const aspect = useMosaicStore((s) => s.targetAspect) ?? 0.75;
  const { cancelAnalyze, cancelRender } = useWorkers();
  const now = useNow(analyzing || rendering);

  if (!analyzing && !rendering) return null;

  const progress = analyzing ? analyzeProgress : renderProgress;
  const startedAt = analyzing ? analyzeStartedAt : renderStartedAt;
  const elapsed = Math.max(0, now - startedAt);
  const stageFraction = progress.total ? progress.done / progress.total : 0;
  const overall = analyzing ? stageFraction : stage === 'render' ? MATCH_SHARE + (1 - MATCH_SHARE) * stageFraction : 0;
  const rate = elapsed > 300 && progress.done > 0 ? progress.done / (elapsed / 1000) : 0;
  const etaMs = overall > 0.03 && overall < 1 ? (elapsed / overall) * (1 - overall) : null;
  const heading = analyzing ? 'Analysing photos' : stage === 'render' ? 'Placing tiles' : 'Matching photos to the target';
  const unit = analyzing ? 'photos' : 'tiles';
  const megapixels = (outputWidth * outputWidth * aspect) / 1_000_000;

  return (
    <Paper elevation={4} sx={{ p: 1.5, borderRadius: 2, width: 'min(460px, 100%)' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">{heading}</Typography>
          <Button size="small" color="inherit" onClick={analyzing ? cancelAnalyze : cancelRender}>
            Cancel
          </Button>
        </Stack>
        <LinearProgress variant="determinate" value={overall * 100} aria-label="Overall progress" sx={{ borderRadius: 1, height: 6 }} />
        {!analyzing && (
          <LinearProgress
            variant={stage === 'render' ? 'determinate' : 'indeterminate'}
            value={stageFraction * 100}
            color="secondary"
            aria-label="Current stage progress"
            sx={{ borderRadius: 1, height: 3 }}
          />
        )}
        <Stack direction="row" justifyContent="space-between" flexWrap="wrap" useFlexGap columnGap={1.5} sx={{ fontVariantNumeric: 'tabular-nums' }}>
          <Typography variant="caption" color="text.secondary">
            {progress.total ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} ${unit}` : 'Working...'}
            {rate > 0 ? ` · ${Math.round(rate).toLocaleString()}/s` : ''}
            {analyzing && skipped > 0 ? ` · ${skipped} skipped` : ''}
          </Typography>
          <Box component="span">
            <Typography variant="caption" color="text.secondary">
              {formatSeconds(elapsed)} elapsed{etaMs !== null ? ` · ~${formatSeconds(etaMs)} left` : ''}
            </Typography>
          </Box>
        </Stack>
        {!analyzing && (
          <Typography variant="caption" color="text.secondary">
            Output {outputWidth.toLocaleString()} × {Math.round(outputWidth * aspect).toLocaleString()} ≈ {Math.round(megapixels)} MP
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
