import { createContext, useContext } from 'react';

export const palettes = {
  dark: {
    background: '#0E0F12', rail: '#13151A', surface: '#181A20', elevated: '#20232A',
    workspace: '#101115', border: '#2B2F38', text: '#F5F7FA', muted: '#A6ADBA',
    accent: '#5B7CFA', accentSoft: 'rgba(91,124,250,0.14)', action: '#4667E8',
    onAction: '#FFFFFF', success: '#37C78A', warning: '#E8A94B', error: '#F06472',
    scrim: 'rgba(0,0,0,0.60)',
  },
  light: {
    background: '#F4F5F7', rail: '#FAFAFB', surface: '#FFFFFF', elevated: '#F0F2F5',
    workspace: '#FBFBFC', border: '#D9DDE4', text: '#171A21', muted: '#626A78',
    accent: '#315BD8', accentSoft: 'rgba(49,91,216,0.09)', action: '#315BD8',
    onAction: '#FFFFFF', success: '#147A57', warning: '#A96812', error: '#C9364B',
    scrim: 'rgba(0,0,0,0.35)',
  },
};
export type Colors = typeof palettes.dark;
export const ThemeContext = createContext<{ colors: Colors; dark: boolean }>({
  colors: palettes.dark, dark: true,
});
export const useTheme = () => useContext(ThemeContext);
