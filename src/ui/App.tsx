import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Drawer,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AutoAwesomeMosaicOutlinedIcon from '@mui/icons-material/AutoAwesomeMosaicOutlined';
import { buildTheme } from './theme';
import { useMosaicStore } from './hooks/useMosaicStore';
import { useWorkers } from './hooks/useWorkers';
import { PhotoDropzone } from './components/PhotoDropzone';
import { TargetPicker } from './components/TargetPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { MosaicViewer } from './components/MosaicViewer';
import { StageStepper } from './components/StageStepper';
import { ProgressCard } from './components/ProgressCard';
import { ActivityLog } from './components/ActivityLog';
import { ResultSummary } from './components/ResultSummary';
import { ExportDialog } from './components/ExportDialog';

type Mode = 'light' | 'dark' | 'system';

// Live low-res preview renders at a small width so a slider drag updates
// within ~1s even on a large photo set; the real Generate click still uses
// the full settings.outputWidth.
const LIVE_PREVIEW_WIDTH = 900;
const LIVE_PREVIEW_DEBOUNCE_MS = 500;

function SidebarSection({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {index}. {title}
      </Typography>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  );
}

function Sidebar() {
  const tiles = useMosaicStore((s) => s.tiles);
  const target = useMosaicStore((s) => s.target);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const rendering = useMosaicStore((s) => s.rendering);
  const resultBitmap = useMosaicStore((s) => s.resultBitmap);
  const settingsDirty = useMosaicStore((s) => s.settingsDirty);
  const { generate } = useWorkers();

  const canGenerate = tiles.length > 0 && !!target && !analyzing && !rendering;
  const tooltip = !target ? 'Pick a target image first' : tiles.length === 0 ? 'Load some photos first' : '';

  return (
    <Stack spacing={3} sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <SidebarSection index={1} title="Photos">
        <PhotoDropzone />
      </SidebarSection>
      <SidebarSection index={2} title="Target">
        <TargetPicker />
      </SidebarSection>
      <SidebarSection index={3} title="Settings">
        <SettingsPanel />
      </SidebarSection>

      {settingsDirty && resultBitmap && !rendering && (
        <Chip
          label="Settings changed. Regenerate"
          color="warning"
          variant="outlined"
          onClick={() => generate()}
          sx={{ alignSelf: 'center' }}
        />
      )}

      <Tooltip title={tooltip} disableHoverListener={!tooltip}>
        <span>
          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={!canGenerate}
            onClick={() => generate()}
            startIcon={<AutoAwesomeMosaicOutlinedIcon />}
          >
            Generate
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('system');
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const effectiveMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => buildTheme(effectiveMode), [effectiveMode]);

  const isNarrow = useMediaQuery('(max-width: 1099px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const toggleMode = () => setMode(effectiveMode === 'dark' ? 'light' : 'dark');

  const error = useMosaicStore((s) => s.error);
  const setError = useMosaicStore((s) => s.setError);
  const settings = useMosaicStore((s) => s.settings);
  const { generate } = useWorkers();

  // Live preview: when settings change while a result already exists,
  // auto-regenerate a quick low-res preview after a short debounce.
  const settingsKey = JSON.stringify(settings);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const s = useMosaicStore.getState();
      if (!s.livePreview || !s.settingsDirty || !s.target || s.tiles.length === 0 || s.rendering) return;
      generate({ outputWidthOverride: Math.min(LIVE_PREVIEW_WIDTH, s.settings.outputWidth), quiet: true });
    }, LIVE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ gap: 1 }}>
            <Box component="img" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" sx={{ width: 28, height: 28, display: 'block' }} />
            <Typography variant="h6" sx={{ flex: 1 }}>
              Mosaic Builder
            </Typography>
            {isNarrow && (
              <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open settings">
                <TuneOutlinedIcon />
              </IconButton>
            )}
            <Tooltip title={`Switch to ${effectiveMode === 'dark' ? 'light' : 'dark'} mode`}>
              <IconButton onClick={toggleMode} aria-label="Toggle theme">
                {effectiveMode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {!isNarrow && (
            <Paper
              square
              elevation={0}
              sx={{ width: 360, borderRight: 1, borderColor: 'divider', flexShrink: 0 }}
            >
              <Sidebar />
            </Paper>
          )}

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, gap: 2, minHeight: 0 }}>
            <StageStepper />
            <MosaicViewer onOpenExport={() => setExportOpen(true)} />
            <ProgressCard />
            <ResultSummary />
            <ActivityLog />
          </Box>
        </Box>
      </Box>

      {isNarrow && (
        <Drawer anchor="bottom" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Box sx={{ maxHeight: '80vh' }}>
            <Sidebar />
          </Box>
        </Drawer>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
