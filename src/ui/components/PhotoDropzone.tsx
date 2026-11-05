import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Stack, Typography, LinearProgress, Alert, AlertTitle, Tooltip } from '@mui/material';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { useMosaicStore } from '../hooks/useMosaicStore';
import { useWorkers } from '../hooks/useWorkers';
import { clearCache } from '../../store/cache';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

const THUMB_STRIP_LIMIT = 40;

function ThumbnailStrip({ files }: { files: File[] }) {
  // Object URLs are a side effect, so they're created/revoked from an
  // effect (not useMemo, which React may invoke more than once per commit
  // under StrictMode/concurrent rendering and would leave <img> pointed at
  // an already-revoked blob URL).
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const created = files.slice(0, THUMB_STRIP_LIMIT).map((f) => URL.createObjectURL(f));
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto', pb: 0.5 }}>
      {urls.map((url, i) => (
        <Box
          key={i}
          component="img"
          src={url}
          alt=""
          sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1, flexShrink: 0, bgcolor: 'action.hover' }}
        />
      ))}
      {files.length > THUMB_STRIP_LIMIT && (
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontSize: 11,
            color: 'text.secondary',
          }}
        >
          +{files.length - THUMB_STRIP_LIMIT}
        </Box>
      )}
    </Stack>
  );
}

export function PhotoDropzone() {
  const { analyzePhotos } = useWorkers();
  const tiles = useMosaicStore((s) => s.tiles);
  const analyzing = useMosaicStore((s) => s.analyzing);
  const analyzeProgress = useMosaicStore((s) => s.analyzeProgress);
  const skippedFiles = useMosaicStore((s) => s.skippedFiles);
  const cacheHits = useMosaicStore((s) => s.cacheHits);
  const clearPhotos = useMosaicStore((s) => s.clearPhotos);
  const addLog = useMosaicStore((s) => s.addLog);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  const handleClearCache = useCallback(async () => {
    await clearCache();
    addLog('info', 'Cleared the photo analysis cache.');
  }, [addLog]);

  const tileFiles = useMemo(() => tiles.map((t) => t.file), [tiles]);

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
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            // Reset so re-selecting the exact same file(s) still fires change.
            e.target.value = '';
          }}
        />
      </Box>

      <Button
        size="small"
        variant="text"
        startIcon={<FolderOpenOutlinedIcon fontSize="small" />}
        onClick={() => folderInputRef.current?.click()}
        sx={{ alignSelf: 'flex-start' }}
      >
        Choose a whole folder
      </Button>
      <input
        ref={folderInputRef}
        type="file"
        hidden
        multiple
        // @ts-expect-error -- non-standard but supported in Chrome and Safari
        webkitdirectory=""
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

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

      {tiles.length > 0 && !analyzing && <ThumbnailStrip files={tileFiles} />}

      {(tiles.length > 0 || skippedFiles.length > 0) && !analyzing && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip size="small" label={`${tiles.length} loaded`} color="primary" variant="outlined" />
          {cacheHits > 0 && <Chip size="small" label={`${cacheHits} from cache`} variant="outlined" />}
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

      <Tooltip title="Forget cached thumbnails/features for all photos, so the next analysis re-decodes everything">
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteSweepOutlinedIcon fontSize="small" />}
          onClick={handleClearCache}
          sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
        >
          Clear cache
        </Button>
      </Tooltip>
    </Stack>
  );
}
