import { useEffect, useState } from 'react';
import { Chip, Stack, Tooltip } from '@mui/material';
import { animate, useReducedMotion } from 'framer-motion';
import { useMosaicStore } from '../hooks/useMosaicStore';

function useCountUp(value: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 0.6, ease: 'easeOut', onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduced]);
  return shown;
}

function likenessColor(percent: number): 'success' | 'warning' | 'default' {
  if (percent >= 70) return 'success';
  if (percent >= 40) return 'warning';
  return 'default';
}

export function ResultSummary() {
  const stats = useMosaicStore((s) => s.stats);
  const isDraft = useMosaicStore((s) => s.resultIsDraft);
  const likenessPercent = stats ? Math.max(0, Math.round(stats.likeness * 100)) : 0;
  const likeness = useCountUp(likenessPercent);
  const placed = useCountUp(stats?.tilesPlaced ?? 0);
  if (!stats) return null;

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
      {isDraft && (
        <Tooltip title="A fast low-resolution preview of your current settings. Generate for full quality.">
          <Chip size="small" label="Live preview" color="primary" variant="outlined" />
        </Tooltip>
      )}
      <Tooltip title="How closely the mosaic's structure matches the target when both are viewed small, like from across a room. Measured with SSIM on the actual result.">
        <Chip size="small" label={`Likeness ${Math.round(likeness)}%`} color={likenessColor(likenessPercent)} />
      </Tooltip>
      <Chip size="small" variant="outlined" label={`${stats.outputWidth.toLocaleString()} × ${stats.outputHeight.toLocaleString()}`} />
      <Chip size="small" variant="outlined" label={`${Math.round(placed).toLocaleString()} tiles`} />
      <Chip size="small" variant="outlined" label={`${stats.uniquePhotosUsed.toLocaleString()} photos used`} />
      <Chip size="small" variant="outlined" label={`${stats.uniquePhotosUnused.toLocaleString()} unused`} />
      <Chip size="small" variant="outlined" label={`Most reused: ${stats.mostReusedCount}×`} />
      <Chip size="small" variant="outlined" label={`${(stats.totalTimeMs / 1000).toFixed(1)}s`} />
    </Stack>
  );
}
