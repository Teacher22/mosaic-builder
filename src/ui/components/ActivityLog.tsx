import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMosaicStore } from '../hooks/useMosaicStore';

const COLORS: Record<string, string> = { info: 'text.secondary', warn: 'warning.main', error: 'error.main' };

export function ActivityLog() {
  const log = useMosaicStore((s) => s.log);
  const [open, setOpen] = useState(false);

  const copy = () => {
    const text = log
      .map((l) => `${new Date(l.ts).toLocaleTimeString()} [${l.level}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (log.length === 0) return null;

  return (
    <Accordion
      expanded={open}
      onChange={(_, isOpen) => setOpen(isOpen)}
      variant="outlined"
      sx={{ borderRadius: 3, '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Activity log ({log.length})</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          <Button size="small" onClick={copy}>
            Copy log
          </Button>
        </Stack>
        <Box sx={{ maxHeight: 200, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
          {log.map((entry, i) => (
            <Typography key={i} component="div" variant="caption" sx={{ color: COLORS[entry.level], display: 'block' }}>
              {new Date(entry.ts).toLocaleTimeString()} {entry.message}
            </Typography>
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
