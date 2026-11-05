import { Box, Chip, FormControlLabel, Slider, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';
import type { MosaicSettings } from '../../types';

const PRESETS: Record<string, Partial<MosaicSettings>> = {
  Balanced: { reuseRadius: 4, usagePenalty: 0.15, colorCorrect: 0.15 },
  'Photo-real': { reuseRadius: 2, usagePenalty: 0.05, colorCorrect: 0.3 },
  'Max variety': { reuseRadius: 8, usagePenalty: 0.4, colorCorrect: 0 },
};

interface SliderRowProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

function SliderRow({ label, tooltip, value, min, max, step, unit, onChange, format }: SliderRowProps) {
  const display = format ? format(value) : `${value}${unit ?? ''}`;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Tooltip title={tooltip} placement="right">
          <Typography variant="body2">{label}</Typography>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {display}
        </Typography>
      </Stack>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  );
}

export function SettingsPanel() {
  const settings = useMosaicStore((s) => s.settings);
  const updateSettings = useMosaicStore((s) => s.updateSettings);
  const livePreview = useMosaicStore((s) => s.livePreview);
  const setLivePreview = useMosaicStore((s) => s.setLivePreview);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {Object.keys(PRESETS).map((name) => (
          <Chip
            key={name}
            label={name}
            size="small"
            variant="outlined"
            onClick={() => updateSettings(PRESETS[name])}
          />
        ))}
      </Stack>

      <SliderRow
        label="Tiles across"
        tooltip="How many tile columns span the output width"
        value={settings.tilesAcross}
        min={10}
        max={200}
        step={1}
        onChange={(v) => updateSettings({ tilesAcross: v })}
      />
      <SliderRow
        label="Output width"
        tooltip="Width of the exported mosaic in pixels"
        value={settings.outputWidth}
        min={800}
        max={8000}
        step={100}
        format={(v) => `${v}px`}
        onChange={(v) => updateSettings({ outputWidth: v })}
      />
      <SliderRow
        label="Repeat radius"
        tooltip="Avoid reusing the same photo within this many cells of each other"
        value={settings.reuseRadius}
        min={0}
        max={12}
        step={1}
        onChange={(v) => updateSettings({ reuseRadius: v })}
      />
      <SliderRow
        label="Usage penalty"
        tooltip="How strongly overused photos are discouraged when picking the next tile"
        value={settings.usagePenalty}
        min={0}
        max={1}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => updateSettings({ usagePenalty: v })}
      />
      <SliderRow
        label="Colour correct"
        tooltip="Tint each tile toward the target cell's colour, at draw time"
        value={settings.colorCorrect}
        min={0}
        max={0.35}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => updateSettings({ colorCorrect: v })}
      />
      <SliderRow
        label="Blend"
        tooltip="Wash the original target image over the finished mosaic, for readability at a distance"
        value={settings.blend}
        min={0}
        max={0.5}
        step={0.02}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => updateSettings({ blend: v })}
      />

      <FormControlLabel
        control={<Switch size="small" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} />}
        label={
          <Typography variant="body2" color="text.secondary">
            Live low-res preview while adjusting
          </Typography>
        }
      />
    </Stack>
  );
}
