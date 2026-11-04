import { useCallback, useRef, useState } from 'react';
import { Box, Button, Chip, Stack, Typography, LinearProgress, Alert, AlertTitle } from '@mui/material';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

export function PhotoDropzone() {
  const { analyzePhotos } = useWorkers();
  const tiles = useMosaicStore((s) => s.tiles);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const analyzeProgress = useMosaicStore((s) => s.analyzeProgress);
  const skippedFiles = useMosaicStore((s) => s.skippedFiles);
  const clearPhotos = useMosaicStore((s) => s.clearPhotos);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(isImageFile);
      if (files.length > 0) analyzePhotos(files);
    },
    [analyzePhotos],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <Stack spacing={1.5}>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          transition: 'border-color 120ms, background-color 120ms',
        }}
      >
        <PhotoLibraryOutlinedIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Drag photos here, or click to browse
        </Typography>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </Box>

      {analyzing && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={analyzeProgress.total ? (analyzeProgress.done / analyzeProgress.total) * 100 : 0}
            sx={{ borderRadius: 1, height: 6 }}
          />
          <Typography variant="caption" color="text.secondary">
            Analysing {analyzeProgress.done} / {analyzeProgress.total}
          </Typography>
        </Box>
      )}

      {(tiles.length > 0 || skippedFiles.length > 0) && !analyzing && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip size="small" label={`${tiles.length} loaded`} color="primary" variant="outlined" />
          {skippedFiles.length > 0 && (
            <Chip size="small" label={`${skippedFiles.length} skipped`} color="warning" variant="outlined" />
          )}
          <Button size="small" onClick={() => clearPhotos()} sx={{ ml: 'auto' }}>
            Clear
          </Button>
        </Stack>
      )}

      {skippedFiles.length > 0 && !analyzing && (
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
          <AlertTitle>Some files were skipped</AlertTitle>
          {skippedFiles.slice(0, 5).map((f) => (
            <Typography key={f.name} variant="caption" display="block">
              {f.name}: {f.reason}
            </Typography>
          ))}
          {skippedFiles.length > 5 && (
            <Typography variant="caption" display="block">
              and {skippedFiles.length - 5} more
            </Typography>
          )}
        </Alert>
      )}
    </Stack>
  );
}
