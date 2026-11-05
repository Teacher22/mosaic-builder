import { useCallback, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';

export function TargetPicker() {
  const target = useMosaicStore((s) => s.target);
  const targetUrl = useMosaicStore((s) => s.targetUrl);
  const setTarget = useMosaicStore((s) => s.setTarget);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(
    (file: File | undefined) => {
      if (file && file.type.startsWith('image/')) setTarget(file);
    },
    [setTarget],
  );

  return (
    <Stack spacing={1.5}>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 3,
          p: target ? 0 : 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          overflow: 'hidden',
          transition: 'border-color 120ms, background-color 120ms',
        }}
      >
        {target && targetUrl ? (
          <Box
            component="img"
            src={targetUrl}
            alt="Target preview"
            sx={{ width: '100%', maxHeight: 160, objectFit: 'contain', display: 'block', bgcolor: 'action.hover' }}
          />
        ) : (
          <>
            <ImageOutlinedIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Drop a target image, or click to browse
            </Typography>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
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
          <Button size="small" onClick={() => setTarget(null)}>
            Clear
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
