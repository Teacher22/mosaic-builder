import { Step, StepLabel, Stepper, Typography } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';

type UiStage = 'load' | 'analyse' | 'match' | 'render' | 'done';

const STAGES: UiStage[] = ['load', 'analyse', 'match', 'render', 'done'];
const LABELS: Record<UiStage, string> = {
  load: 'Load photos',
  analyse: 'Analyse',
  match: 'Match',
  render: 'Render',
  done: 'Done',
};

export function StageStepper() {
  const stage = useMosaicStore((s) => s.stage);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const tileCount = useMosaicStore((s) => s.tiles.length);
  const stageDurations = useMosaicStore((s) => s.stageDurations);

  let effective: UiStage = 'load';
  if (analyzing) effective = 'analyse';
  else if (stage !== 'idle') effective = stage;
  else if (tileCount > 0) effective = 'load';

  const activeIndex = STAGES.indexOf(effective);

  return (
    <Stepper activeStep={activeIndex} alternativeLabel sx={{ mb: 1 }}>
      {STAGES.map((s, i) => (
        <Step key={s} completed={activeIndex > i || (s === 'done' && stage === 'done')}>
          <StepLabel>
            {LABELS[s]}
            {s !== 'load' && stageDurations[s] !== undefined && (
              <Typography variant="caption" display="block" color="text.secondary">
                {(stageDurations[s]! / 1000).toFixed(1)}s
              </Typography>
            )}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
