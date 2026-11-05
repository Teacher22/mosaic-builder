import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { clearCache } from '../../store/cache';
import { filesFromDrop, isImageFile } from '../files';

const THUMB_STRIP_LIMIT = 24;

function ThumbnailStrip() {
  const tiles = useMosaicStore((s) => s.tiles);
  const shown = useMemo(() => tiles.slice(0, THUMB_STRIP_LIMIT), [tiles]);
  const [urls, setUrls] = useState<string[]>([]);
  // Object URLs are a side effect: creating them in useMemo can leave <img>
  // pointing at a revoked URL under StrictMode.
  useEffect(() => {
    const created = shown.map((t) => URL.createObjectURL(t.thumb));
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [shown]);

  return (
    <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5, scrollbarWidth: 'thin' }}>
      {urls.map((url, i) => (
        <motion.img
          key={url}
          src={url}
          alt=""
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.02 }}
          style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
        />
      ))}
      {tiles.length > THUMB_STRIP_LIMIT && (
        <Box
          sx={{
            minWidth: 38,
            height: 38,
            px: 0.5,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            bgcolor: 'action.hover',
            fontSize: 11,
            color: 'text.secondary',
          }}
        >
          +{(tiles.length - THUMB_STRIP_LIMIT).toLocaleString()}
        </Box>
      )}
    </Box>
  );
}

export function PhotoDropzone() {
  const { analyzePhotos, clearAllPhotos } = useWorkers();
  const tileCount = useMosaicStore((s) => s.tiles.length);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const progress = useMosaicStore((s) => s.analyzeProgress);
  const skippedFiles = useMosaicStore((s) => s.skippedFiles);
  const cacheHits = useMosaicStore((s) => s.cacheHits);
  const addLog = useMosaicStore((s) => s.addLog);
  const setToast = useMosaicStore((s) => s.setToast);
  const [dragOver, setDragOver] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      const images = files.filter(isImageFile);
      if (images.length > 0) analyzePhotos(images);
      else if (files.length > 0) setToast({ severity: 'info', message: 'No image files found there.' });
    },
    [analyzePhotos, setToast],
  );

  const handleInputFiles = useCallback(
    (input: HTMLInputElement) => {
      const files = Array.from(input.files ?? []);
      // Reset so re-selecting the exact same file(s) still fires change.
      input.value = '';
      // The browser just spent a while building the file list in this same task; yield first so the page never stalls.
      setTimeout(() => handleFiles(files));
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      filesFromDrop(e.dataTransfer).then(handleFiles);
    },
    [handleFiles],
  );

  const handleClearCache = useCallback(async () => {
    await clearCache();
    addLog('info', 'Cleared the photo analysis cache.');
    setToast({ severity: 'success', message: 'Cache cleared.' });
  }, [addLog, setToast]);

  const hasPhotos = tileCount > 0 || skippedFiles.length > 0;

  return (
    <Stack spacing={1.25}>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Add photos"
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
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: '1.5px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 1.5,
          py: hasPhotos ? 1.25 : 3,
          px: 2,
          display: 'flex',
          flexDirection: hasPhotos ? 'row' : 'column',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          bgcolor: dragOver ? 'action.selected' : 'transparent',
          transition: 'all 140ms',
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
      >
        <AddPhotoAlternateOutlinedIcon sx={{ fontSize: hasPhotos ? 20 : 30, color: 'primary.main' }} />
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {hasPhotos ? 'Add more photos' : 'Drop photos or a folder, or click to browse'}
        </Typography>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            handleInputFiles(e.target);
          }}
        />
      </Box>

      <input
        ref={folderInputRef}
        type="file"
        hidden
        multiple
        // @ts-expect-error -- non-standard but supported in Chrome and Safari
        webkitdirectory=""
        onChange={(e) => {
          handleInputFiles(e.target);
        }}
      />

      {analyzing && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={progress.total ? (progress.done / progress.total) * 100 : 0}
            sx={{ borderRadius: 1, height: 5 }}
          />
          <Typography variant="caption" color="text.secondary">
            Analysing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
          </Typography>
        </Box>
      )}

      {tileCount > 0 && !analyzing && <ThumbnailStrip />}

      {hasPhotos && !analyzing && (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${tileCount.toLocaleString()} loaded`} color="primary" variant="outlined" />
          {cacheHits > 0 && <Chip size="small" label={`${cacheHits.toLocaleString()} from cache`} variant="outlined" />}
          {skippedFiles.length > 0 && (
            <Chip
              size="small"
              label={`${skippedFiles.length} skipped`}
              color="warning"
              variant="outlined"
              onClick={() => setShowSkipped((v) => !v)}
              aria-expanded={showSkipped}
            />
          )}
        </Stack>
      )}

      <Collapse in={showSkipped && skippedFiles.length > 0 && !analyzing} unmountOnExit>
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1.5, maxHeight: 160, overflowY: 'auto' }}>
          {skippedFiles.map((f, i) => (
            <Typography key={`${f.name}-${i}`} variant="caption" display="block">
              <strong>{f.name}</strong>: {f.reason}
            </Typography>
          ))}
        </Alert>
      </Collapse>

      <Stack direction="row" spacing={0.5} alignItems="center">
        <Button size="small" startIcon={<FolderOpenOutlinedIcon fontSize="small" />} onClick={() => folderInputRef.current?.click()}>
          Choose folder
        </Button>
        <Box sx={{ flex: 1 }} />
        {hasPhotos && (
          <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={clearAllPhotos}>
            Clear
          </Button>
        )}
        <Tooltip title="Forget stored thumbnails and analysis for all photos, so the next load re-reads everything">
          <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={handleClearCache}>
            Clear cache
          </Button>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
