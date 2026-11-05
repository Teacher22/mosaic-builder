import { useEffect, useRef } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useMosaicStore } from '../hooks/useMosaicStore';

const COLORS: Record<string, string> = { info: 'text.secondary', warn: 'warning.main', error: 'error.main' };

export function ActivityLog() {
  const log = useMosaicStore((s) => s.log);
  const setToast = useMosaicStore((s) => s.setToast);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  const copy = () => {
    const text = log.map((l) => `${new Date(l.ts).toLocaleTimeString()} [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).then(
      () => setToast({ severity: 'success', message: 'Log copied.' }),
      () => setToast({ severity: 'error', message: "Couldn't copy the log." }),
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">Activity log</Typography>
        <Button size="small" onClick={copy} disabled={log.length === 0}>
          Copy log
        </Button>
      </Stack>
      <Box sx={{ maxHeight: 150, overflowY: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
        {log.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            Nothing yet.
          </Typography>
        )}
        {log.map((entry, i) => (
          <Box key={i} sx={{ color: COLORS[entry.level] }}>
            {new Date(entry.ts).toLocaleTimeString()} {entry.message}
          </Box>
        ))}
        <div ref={endRef} />
      </Box>
    </Paper>
  );
}
