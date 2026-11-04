import { useEffect, useRef } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';

export function MosaicViewer() {
  const resultBitmap = useMosaicStore((s) => s.resultBitmap);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!resultBitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = resultBitmap.width;
    canvas.height = resultBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(resultBitmap, 0, 0);
  }, [resultBitmap]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mosaic.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        bgcolor: 'background.default',
        borderRadius: 3,
        minHeight: 0,
        overflow: 'hidden',
        p: 2,
      }}
    >
      {resultBitmap ? (
        <>
          <canvas
            ref={canvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
          />
          <Button
            startIcon={<DownloadOutlinedIcon />}
            variant="contained"
            size="small"
            onClick={download}
            sx={{ position: 'absolute', top: 16, right: 16 }}
          >
            Download PNG
          </Button>
        </>
      ) : targetUrl ? (
        <Box
          component="img"
          src={targetUrl}
          alt="Target preview"
          sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 2, opacity: 0.5 }}
        />
      ) : (
        <Stack spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
          <ImageOutlinedIcon sx={{ fontSize: 48 }} />
          <Typography variant="body2">Load photos and a target image to begin</Typography>
        </Stack>
      )}
    </Box>
  );
}
