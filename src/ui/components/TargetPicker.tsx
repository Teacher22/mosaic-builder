import { useCallback, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { computeGrid } from '../../core/grid';
import { isImageFile } from '../files';

/** Past this density the overlay lines merge into a solid wash. */
const MAX_GRID_OVERLAY_COLS = 120;

export function TargetPicker() {
  const target = useMosaicStore((s) => s.target);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const targetAspect = useMosaicStore((s) => s.targetAspect);
  const tilesAcross = useMosaicStore((s) => s.settings.tilesAcross);
  const setTarget = useMosaicStore((s) => s.setTarget);
  const { setTargetFile } = useWorkers();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(
    (file: File | undefined) => {
      if (file && isImageFile(file)) setTargetFile(file);
    },
    [setTargetFile],
  );

  const grid = targetAspect ? computeGrid(1000, 1000 * targetAspect, tilesAcross) : null;

  return (
    <Stack spacing={1}>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Choose target image"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: target ? 'none' : '1.5px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 1.5,
          py: target ? 0 : 3,
          px: target ? 0 : 2,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'action.selected' : target ? 'action.hover' : 'transparent',
          overflow: 'hidden',
          transition: 'all 140ms',
          '&:hover': { borderColor: 'primary.main', bgcolor: target ? 'action.hover' : 'action.hover' },
        }}
      >
        {target && targetUrl ? (
          <Box sx={{ position: 'relative', display: 'inline-block', verticalAlign: 'top', lineHeight: 0 }}>
            <Box component="img" src={targetUrl} alt="Target preview" sx={{ maxWidth: '100%', maxHeight: 170, display: 'block' }} />
            {grid && grid.cols <= MAX_GRID_OVERLAY_COLS && (
              <Box
                aria-hidden
                sx={(theme) => {
                  const line = alpha(theme.palette.common.white, 0.28);
                  return {
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
                    backgroundSize: `${100 / grid.cols}% ${100 / grid.rows}%`,
                  };
                }}
              />
            )}
          </Box>
        ) : (
          <Stack alignItems="center" spacing={1}>
            <ImageOutlinedIcon sx={{ fontSize: 30, color: 'primary.main' }} />
            <Typography variant="body2" color="text.secondary">
              Drop the image to rebuild, or click to browse
            </Typography>
          </Stack>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Box>
      {target && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
            {target.name}
          </Typography>
          <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => setTarget(null)}>
            Clear
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
