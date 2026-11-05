import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { createDemoFiles } from '../demo';

const DEMO_COLOR_CORRECT = 0.85;

export function EmptyState() {
  const hasTarget = useMosaicStore((s) => !!s.target);
  const tileCount = useMosaicStore((s) => s.tiles.length);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const rendering = useMosaicStore((s) => s.rendering);
  const updateSettings = useMosaicStore((s) => s.updateSettings);
  const { analyzePhotos, setTargetFile } = useWorkers();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const startDemo = async () => {
    setLoadingDemo(true);
    try {
      const { photos, target } = await createDemoFiles();
      await setTargetFile(target);
      // Generated tiles are busier than real photos, so they need more correction to read well.
      updateSettings({ colorCorrect: DEMO_COLOR_CORRECT });
      analyzePhotos(photos, { thenGenerate: true });
    } finally {
      setLoadingDemo(false);
    }
  };

  if (targetUrl) {
    const message = rendering ? 'Working out where each photo goes...' : tileCount > 0 ? 'Ready. Press Generate.' : analyzing ? 'Analysing your photos...' : 'Now add the photos to build it from.';
    return (
      <Stack alignItems="center" spacing={2} sx={{ maxWidth: '80%', maxHeight: '90%', pointerEvents: 'none' }}>
        <Box component="img" src={targetUrl} alt="" sx={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 1, opacity: 0.55 }} />
        <Typography variant="subtitle2" color="text.secondary">
          {message}
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 440, px: 2, textAlign: 'center' }} onPointerDown={(e) => e.stopPropagation()}>
      <Box component="img" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" sx={{ width: 76, height: 76 }} />
      <Typography variant="h5">Rebuild any image from your own photos</Typography>
      <Typography variant="body2" color="text.secondary">
        {tileCount > 0 || hasTarget
          ? 'Now pick the image you want to rebuild.'
          : 'Add a folder of photos and a target image on the left. Thousands of your photos become one big picture you can zoom right into.'}
      </Typography>
      <Button variant="outlined" onClick={startDemo} disabled={loadingDemo || analyzing}>
        {loadingDemo ? 'Preparing demo...' : 'Try a demo with generated images'}
      </Button>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary', pt: 0.5 }}>
        <LockOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography variant="caption">Everything stays on your device. Nothing is uploaded.</Typography>
      </Stack>
    </Stack>
  );
}
