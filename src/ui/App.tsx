import { useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  IconButton,
  Paper,
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

type Mode = 'light' | 'dark' | 'system';

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
      <Tooltip title={tooltip} disableHoverListener={!tooltip}>
        <span>
          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={!canGenerate}
            onClick={generate}
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

  const toggleMode = () => setMode(effectiveMode === 'dark' ? 'light' : 'dark');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ gap: 1 }}>
            <AutoAwesomeMosaicOutlinedIcon color="primary" />
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
            <MosaicViewer />
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
    </ThemeProvider>
  );
}
