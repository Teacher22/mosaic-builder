import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Collapse,
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
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AutoAwesomeMosaicOutlinedIcon from '@mui/icons-material/AutoAwesomeMosaicOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { buildTheme } from './theme';
import { useMosaicStore } from './hooks/useMosaicStore';
import { useWorkers } from './hooks/useWorkers';
import { PhotoDropzone } from './components/PhotoDropzone';
import { filesFromDrop, isImageFile } from './files';
import { TargetPicker } from './components/TargetPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { MosaicViewer } from './components/MosaicViewer';
import { StageStepper } from './components/StageStepper';
import { ProgressCard } from './components/ProgressCard';
import { ActivityLog } from './components/ActivityLog';
import { ResultSummary } from './components/ResultSummary';
import { ExportDialog } from './components/ExportDialog';

const LIVE_PREVIEW_DEBOUNCE_MS = 200;

function SidebarSection({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Typography variant="overline" color="text.secondary" component="h2" sx={{ m: 0, mb: 0.75, display: 'block' }}>
        {index}. {title}
      </Typography>
      {children}
    </Box>
  );
}

function Sidebar({ onGenerate }: { onGenerate?: () => void }) {
  const tileCount = useMosaicStore((s) => s.tiles.length);
  const target = useMosaicStore((s) => s.target);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const rendering = useMosaicStore((s) => s.rendering);
  const resultBitmap = useMosaicStore((s) => s.resultBitmap);
  const settingsDirty = useMosaicStore((s) => s.settingsDirty);
  const { generate } = useWorkers();

  const canGenerate = tileCount > 0 && !!target && !analyzing && !rendering;
  const tooltip = analyzing
    ? 'Still analysing photos'
    : tileCount === 0 && !target
      ? 'Add photos and a target image first'
      : !target
        ? 'Pick a target image first'
        : tileCount === 0
          ? 'Add some photos first'
          : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack spacing={2.5} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <SidebarSection index={1} title="Photos">
          <PhotoDropzone />
        </SidebarSection>
        <SidebarSection index={2} title="Target">
          <TargetPicker />
        </SidebarSection>
        <SidebarSection index={3} title="Settings">
          <SettingsPanel />
        </SidebarSection>
      </Stack>
      <Stack spacing={1} sx={{ p: 2, pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
        {settingsDirty && resultBitmap && !rendering && (
          <Typography variant="caption" color="warning.main" textAlign="center">
            Settings changed. Regenerate for full quality.
          </Typography>
        )}
        <Tooltip title={tooltip} disableHoverListener={!tooltip}>
          <span>
            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={!canGenerate}
              onClick={() => {
                generate();
                onGenerate?.();
              }}
              startIcon={<AutoAwesomeMosaicOutlinedIcon />}
            >
              {rendering ? 'Generating...' : 'Generate'}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}

export default function App() {
  const themeChoice = useMosaicStore((s) => s.themeChoice);
  const setThemeChoice = useMosaicStore((s) => s.setThemeChoice);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const effectiveMode = themeChoice === 'system' ? (prefersDark ? 'dark' : 'light') : themeChoice;
  const theme = useMemo(() => buildTheme(effectiveMode), [effectiveMode]);

  const isNarrow = useMediaQuery('(max-width: 1099px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const toast = useMosaicStore((s) => s.toast);
  const setToast = useMosaicStore((s) => s.setToast);
  const settings = useMosaicStore((s) => s.settings);
  const rendering = useMosaicStore((s) => s.rendering);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const hasResult = useMosaicStore((s) => !!s.resultBitmap);
  const logCount = useMosaicStore((s) => s.log.length);
  const { generate, analyzePhotos, setTargetFile } = useWorkers();

  // Live preview: when settings change while a result exists, render a quick
  // low-res draft. A new change supersedes any draft still in progress.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    const timer = setTimeout(() => {
      const s = useMosaicStore.getState();
      if (s.livePreview && s.settingsDirty && s.resultBitmap && !s.rendering) generate({ draft: true });
    }, LIVE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [settingsKey, generate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'g') generate();
      else if (key === 'e' && useMosaicStore.getState().resultBitmap) setExportOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generate]);

  // Dropping on the main area: one image becomes the target, many become photos.
  const onHeroDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    filesFromDrop(e.dataTransfer).then((files) => {
      const images = files.filter(isImageFile);
      if (images.length === 1) setTargetFile(images[0]);
      else if (images.length > 1) analyzePhotos(images);
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
          <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar variant="dense" sx={{ gap: 1, minHeight: 52 }}>
              <Box component="img" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" sx={{ width: 26, height: 26, display: 'block' }} />
              <Typography variant="h6" component="h1" sx={{ whiteSpace: 'nowrap' }}>
                Mosaic Builder
              </Typography>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                {!isNarrow && <StageStepper />}
              </Box>
              {isNarrow && (
                <Tooltip title="Photos and settings">
                  <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open photos and settings">
                    <TuneOutlinedIcon />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={`Switch to ${effectiveMode === 'dark' ? 'light' : 'dark'} mode`}>
                <IconButton onClick={() => setThemeChoice(effectiveMode === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
                  {effectiveMode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              {hasResult && (
                <Tooltip title="Export (E)">
                  <span>
                    <Button variant="contained" size="small" disabled={rendering} startIcon={<FileDownloadOutlinedIcon />} onClick={() => setExportOpen(true)}>
                      Export…
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Toolbar>
          </AppBar>

          <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {!isNarrow && (
              <Paper square elevation={0} sx={{ width: 340, borderRight: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Sidebar />
              </Paper>
            )}

            <Box
              component="main"
              onDragOver={(e) => {
                e.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false);
              }}
              onDrop={onHeroDrop}
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                p: 1.5,
                gap: 1,
                minHeight: 0,
                position: 'relative',
                outline: dropActive ? '2px dashed' : 'none',
                outlineColor: 'primary.main',
                outlineOffset: -8,
              }}
            >
              <MosaicViewer />

              <AnimatePresence>
                {(rendering || analyzing) && (
                  <motion.div
                    key="progress"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.18 }}
                    style={{ position: 'absolute', left: 0, right: 0, top: 24, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 4 }}
                  >
                    <Box sx={{ pointerEvents: 'auto', width: 'min(460px, 90%)' }}>
                      <ProgressCard />
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>

              <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 28 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ResultSummary />
                </Box>
                <Tooltip title="Activity log">
                  <Chip
                    size="small"
                    variant={logOpen ? 'filled' : 'outlined'}
                    icon={<ReceiptLongOutlinedIcon />}
                    label={logCount}
                    aria-label="Toggle activity log"
                    aria-expanded={logOpen}
                    onClick={() => setLogOpen((v) => !v)}
                  />
                </Tooltip>
              </Stack>
              <Collapse in={logOpen} unmountOnExit>
                <ActivityLog />
              </Collapse>
            </Box>
          </Box>
        </Box>

        {isNarrow && (
          <Drawer anchor="bottom" open={drawerOpen} onClose={() => setDrawerOpen(false)} keepMounted>
            <Box sx={{ height: '82dvh' }}>
              <Sidebar onGenerate={() => setDrawerOpen(false)} />
            </Box>
          </Drawer>
        )}

        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

        <Snackbar
          open={!!toast}
          autoHideDuration={toast?.severity === 'error' ? 8000 : 3500}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setToast(null);
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {toast ? (
            <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ borderRadius: 1.5 }}>
              {toast.message}
            </Alert>
          ) : undefined}
        </Snackbar>
      </MotionConfig>
    </ThemeProvider>
  );
}
