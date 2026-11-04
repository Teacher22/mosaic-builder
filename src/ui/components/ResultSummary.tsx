import { Chip, Stack } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';

export function ResultSummary() {
  const stats = useMosaicStore((s) => s.stats);
  if (!stats) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip size="small" label={`${stats.outputWidth} × ${stats.outputHeight}`} />
      <Chip size="small" label={`${stats.tilesPlaced.toLocaleString()} tiles`} />
      <Chip size="small" label={`${stats.uniquePhotosUsed.toLocaleString()} photos used`} />
      <Chip size="small" label={`${stats.uniquePhotosUnused.toLocaleString()} unused`} />
      <Chip size="small" label={`Most reused: ${stats.mostReusedCount}×`} />
      <Chip size="small" label={`${(stats.totalTimeMs / 1000).toFixed(1)}s`} />
    </Stack>
  );
}
