import { Box, Button, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';

export function ProgressCard() {
  const analyzing = useMosaicStore((s) => s.analyzing);
  const rendering = useMosaicStore((s) => s.rendering);
  const analyzeProgress = useMosaicStore((s) => s.analyzeProgress);
  const renderProgress = useMosaicStore((s) => s.renderProgress);
  const stage = useMosaicStore((s) => s.stage);
  const { cancelAnalyze, cancelRender } = useWorkers();

  if (!analyzing && !rendering) return null;

  const progress = analyzing ? analyzeProgress : renderProgress;
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const label = analyzing ? 'Analysing photos' : `Rendering (${stage})`;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2">{label}</Typography>
          <Button size="small" color="inherit" onClick={analyzing ? cancelAnalyze : cancelRender}>
            Cancel
          </Button>
        </Stack>
        <LinearProgress variant="determinate" value={pct} sx={{ borderRadius: 1, height: 6 }} />
        <Box>
          <Typography variant="caption" color="text.secondary">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
