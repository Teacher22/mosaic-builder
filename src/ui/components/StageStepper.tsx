import { Box, Stack, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useMosaicStore } from '../hooks/useMosaicStore';

type UiStage = 'load' | 'analyse' | 'match' | 'render' | 'done';
type StepState = 'pending' | 'active' | 'complete' | 'failed';

const STAGES: UiStage[] = ['load', 'analyse', 'match', 'render', 'done'];
const LABELS: Record<UiStage, string> = {
  load: 'Load photos',
  analyse: 'Analyse',
  match: 'Match',
  render: 'Render',
  done: 'Done',
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function StageStepper() {
  const stage = useMosaicStore((s) => s.stage);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const hasPhotos = useMosaicStore((s) => s.tiles.length > 0);
  const durations = useMosaicStore((s) => s.stageDurations);

  const failed = stage === 'failed';
  const stateOf = (name: UiStage): StepState => {
    if (name === 'load') return hasPhotos || analyzing ? 'complete' : 'active';
    if (name === 'analyse') return analyzing ? 'active' : hasPhotos ? 'complete' : 'pending';
    if (failed) return name === 'done' ? 'pending' : durations[name] !== undefined ? 'complete' : 'failed';
    if (name === 'match') return stage === 'match' ? 'active' : stage === 'render' || stage === 'done' ? 'complete' : 'pending';
    if (name === 'render') return stage === 'render' ? 'active' : stage === 'done' ? 'complete' : 'pending';
    return stage === 'done' ? 'complete' : 'pending';
  };

  return (
    <Stack component="ol" direction="row" alignItems="center" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0, flexWrap: 'wrap' }} useFlexGap>
      {STAGES.map((name, i) => {
        const state = stateOf(name);
        const duration = name === 'analyse' || name === 'match' || name === 'render' ? durations[name] : undefined;
        return (
          <Stack key={name} component="li" direction="row" alignItems="center" spacing={0.5} aria-current={state === 'active' ? 'step' : undefined}>
            {i > 0 && <Box sx={{ width: 14, height: '1px', bgcolor: 'divider' }} />}
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'common.white',
                bgcolor:
                  state === 'complete' ? 'secondary.main' : state === 'active' ? 'primary.main' : state === 'failed' ? 'error.main' : 'action.disabledBackground',
                '@keyframes stagePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                animation: state === 'active' ? 'stagePulse 1.3s ease-in-out infinite' : 'none',
              }}
            >
              {state === 'complete' && <CheckIcon sx={{ fontSize: 11 }} />}
              {state === 'failed' && <CloseIcon sx={{ fontSize: 11 }} />}
            </Box>
            <Typography variant="caption" sx={{ fontWeight: state === 'active' ? 650 : 500 }} color={state === 'pending' ? 'text.disabled' : state === 'failed' ? 'error.main' : 'text.primary'}>
              {LABELS[name]}
            </Typography>
            {duration !== undefined && (
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatDuration(duration)}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
