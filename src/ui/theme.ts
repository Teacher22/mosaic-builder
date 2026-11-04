import { createTheme, type PaletteMode } from '@mui/material';

const fontFamily = '"Inter", "Roboto Flex", system-ui, -apple-system, "Segoe UI", sans-serif';

export function buildTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6C5CE7' },
      secondary: { main: '#00C2A8' },
      background:
        mode === 'dark'
          ? { default: '#101014', paper: '#17171c' }
          : { default: '#f5f5f7', paper: '#ffffff' },
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 12, textTransform: 'none', fontWeight: 600 },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
    },
  });
}
