import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { computeGrid } from '../../core/grid';
import type { GroutColor, MosaicSettings } from '../../types';

const PRESETS: Record<string, { hint: string; values: Partial<MosaicSettings> }> = {
  Balanced: {
    hint: 'A clear image with photos you can still recognise',
    values: { reuseRadius: 4, usagePenalty: 1, colorCorrect: 0.7 },
  },
  'Photo-real': {
    hint: 'Closest to the target from a distance; tiles take on its colours',
    values: { reuseRadius: 2, usagePenalty: 0.5, colorCorrect: 0.9 },
  },
  'Max variety': {
    hint: 'Uses as many different photos as possible, with their colours mostly untouched',
    values: { reuseRadius: 8, usagePenalty: 2.5, colorCorrect: 0.45 },
  },
};

interface SliderRowProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

function SliderRow({ label, tooltip, value, min, max, step, onChange, format }: SliderRowProps) {
  const display = format ? format(value) : `${value}`;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Tooltip title={tooltip} placement="right">
          <Typography variant="body2" sx={{ cursor: 'help' }}>
            {label}
          </Typography>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {display}
        </Typography>
      </Stack>
      <Slider
        size="small"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

function GridSummary() {
  const settings = useMosaicStore((s) => s.settings);
  const aspect = useMosaicStore((s) => s.targetAspect) ?? 0.75;
  const photoCount = useMosaicStore((s) => s.tiles.length);
  const grid = computeGrid(1000, 1000 * aspect, settings.tilesAcross);
  const cells = grid.cols * grid.rows;
  const tilePx = Math.round(settings.outputWidth / grid.cols);
  const tooFew = photoCount > 0 && photoCount < cells / 4;

  return (
    <Stack spacing={0.75}>
      <Typography variant="caption" color="text.secondary">
        {grid.cols} × {grid.rows} = {cells.toLocaleString()} tiles, {tilePx}px each
        {settings.adaptiveDetail > 0 ? ' (more in detailed areas)' : ''}
      </Typography>
      {tooFew && (
        <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.5, py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
          {photoCount.toLocaleString()} photos for {cells.toLocaleString()} tiles: each repeats about {Math.round(cells / photoCount)} times.
          Add photos or lower Tiles across for more variety.
        </Alert>
      )}
    </Stack>
  );
}

export function SettingsPanel() {
  const settings = useMosaicStore((s) => s.settings);
  const updateSettings = useMosaicStore((s) => s.updateSettings);
  const livePreview = useMosaicStore((s) => s.livePreview);
  const setLivePreview = useMosaicStore((s) => s.setLivePreview);
  const [advanced, setAdvanced] = useState(false);

  const activePreset = Object.keys(PRESETS).find((name) =>
    Object.entries(PRESETS[name].values).every(([k, v]) => settings[k as keyof MosaicSettings] === v),
  );

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {Object.entries(PRESETS).map(([name, preset]) => (
          <Tooltip key={name} title={preset.hint}>
            <Chip
              label={name}
              size="small"
              color={activePreset === name ? 'primary' : 'default'}
              variant={activePreset === name ? 'filled' : 'outlined'}
              aria-pressed={activePreset === name}
              onClick={() => updateSettings(preset.values)}
            />
          </Tooltip>
        ))}
      </Stack>

      <SliderRow
        label="Tiles across"
        tooltip="How many columns of tiles span the image. More tiles show more of the target; fewer show more of each photo."
        value={settings.tilesAcross}
        min={10}
        max={200}
        step={1}
        onChange={(v) => updateSettings({ tilesAcross: v })}
      />
      <SliderRow
        label="Output width"
        tooltip="Width of the generated result. Export can go larger without changing the layout."
        value={settings.outputWidth}
        min={800}
        max={8000}
        step={100}
        format={(v) => `${v.toLocaleString()} px`}
        onChange={(v) => updateSettings({ outputWidth: v })}
      />
      <SliderRow
        label="Colour correct"
        tooltip="Shifts each photo's tones toward the part of the target it covers, keeping the photo's own detail. The biggest single control over how much the result looks like the target."
        value={settings.colorCorrect}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        onChange={(v) => updateSettings({ colorCorrect: v })}
      />
      <SliderRow
        label="Adaptive detail"
        tooltip="Uses smaller tiles where the target has edges and detail, and larger ones on flat areas. Try it with fewer Tiles across."
        value={settings.adaptiveDetail}
        min={0}
        max={1}
        step={0.05}
        format={(v) => (v === 0 ? 'Off' : percent(v))}
        onChange={(v) => updateSettings({ adaptiveDetail: v })}
      />

      <GridSummary />

      <Button
        size="small"
        color="inherit"
        onClick={() => setAdvanced((v) => !v)}
        aria-expanded={advanced}
        endIcon={<ExpandMoreIcon sx={{ transform: advanced ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />}
        sx={{ alignSelf: 'flex-start', color: 'text.secondary', px: 0.5 }}
      >
        More options
      </Button>
      <Collapse in={advanced}>
        <Stack spacing={1.25}>
          <SliderRow
            label="Repeat radius"
            tooltip="The same photo won't appear twice within this many tiles. Reduced automatically if there aren't enough photos."
            value={settings.reuseRadius}
            min={0}
            max={12}
            step={1}
            onChange={(v) => updateSettings({ reuseRadius: v })}
          />
          <SliderRow
            label="Usage penalty"
            tooltip="Higher spreads the mosaic across more of your photos; lower lets the best-matching photos repeat."
            value={settings.usagePenalty}
            min={0}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => updateSettings({ usagePenalty: v })}
          />
          <SliderRow
            label="Blend"
            tooltip="Washes the original target over the result. Improves likeness, but it's no longer purely your photos."
            value={settings.blend}
            min={0}
            max={0.5}
            step={0.01}
            format={percent}
            onChange={(v) => updateSettings({ blend: v })}
          />
          <SliderRow
            label="Grout"
            tooltip="Gaps between tiles, like a real tile mosaic."
            value={settings.grout}
            min={0}
            max={0.12}
            step={0.005}
            format={(v) => (v === 0 ? 'Off' : `${(v * 100).toFixed(1)}%`)}
            onChange={(v) => updateSettings({ grout: v })}
          />
          {settings.grout > 0 && (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={settings.groutColor}
              aria-label="Grout colour"
              onChange={(_, v: GroutColor | null) => v && updateSettings({ groutColor: v })}
            >
              <ToggleButton value="dark">Dark grout</ToggleButton>
              <ToggleButton value="light">Light grout</ToggleButton>
            </ToggleButtonGroup>
          )}
          <FormControlLabel
            control={<Switch size="small" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} />}
            label={
              <Typography variant="body2" color="text.secondary">
                Live preview while adjusting
              </Typography>
            }
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
