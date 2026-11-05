import { alpha, createTheme, type PaletteMode } from '@mui/material';

const fontFamily = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

export function buildTheme(mode: PaletteMode) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#8F82F2' : '#6C5CE7' },
      secondary: { main: '#00C2A8' },
      warning: { main: dark ? '#FFB454' : '#D9822B' },
      background: dark ? { default: '#0E0D14', paper: '#17161F' } : { default: '#F3F2F7', paper: '#FFFFFF' },
      divider: dark ? alpha('#FFFFFF', 0.09) : alpha('#17142B', 0.1),
      text: dark
        ? { primary: '#F2F1F7', secondary: alpha('#F2F1F7', 0.62) }
        : { primary: '#17142B', secondary: alpha('#17142B', 0.62) },
    },
    // Unit for sx borderRadius: 2 is the spec's 16px surface.
    shape: { borderRadius: 8 },
    typography: {
      fontFamily,
      fontSize: 13.5,
      h6: { fontWeight: 650, letterSpacing: '-0.015em', fontSize: '1.02rem' },
      h5: { fontWeight: 700, letterSpacing: '-0.025em' },
      subtitle2: { fontWeight: 600, letterSpacing: '-0.005em' },
      overline: { fontWeight: 650, letterSpacing: '0.08em', fontSize: '0.68rem', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '-0.005em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':focus-visible': { outlineOffset: 2 },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10 }, sizeLarge: { padding: '11px 20px', fontSize: '0.95rem' } },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } } },
      // describeChild keeps a button's own name for screen readers; the tooltip becomes its description.
      MuiTooltip: { defaultProps: { arrow: true, enterDelay: 350, describeChild: true } },
      MuiSlider: {
        styleOverrides: {
          root: { height: 4, padding: '10px 0' },
          thumb: { width: 14, height: 14, '&::before': { boxShadow: 'none' } },
          rail: { opacity: 0.22 },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
    },
  });
}
