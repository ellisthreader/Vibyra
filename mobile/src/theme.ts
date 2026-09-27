import { createContext, useContext } from 'react';

export const palettes = {
  dark: {
    background: '#0E0F12',
    rail: '#13151A',
    surface: '#181A20',
    elevated: '#20232A',
    workspace: '#101115',
    border: '#2B2F38',
    text: '#F5F7FA',
    muted: '#A6ADBA',
    accent: '#5B7CFA',
    accentSoft: 'rgba(91,124,250,0.14)',
    action: '#4667E8',
    onAction: '#FFFFFF',
    success: '#37C78A',
    warning: '#E8A94B',
    error: '#F06472',
    scrim: 'rgba(0,0,0,0.60)',
    successSoft: 'rgba(55,199,138,0.10)',
    errorSoft: 'rgba(240,100,114,0.10)',
  },
  light: {
    background: '#F4F5F7',
    rail: '#FAFAFB',
    surface: '#FFFFFF',
    elevated: '#F0F2F5',
    workspace: '#FBFBFC',
    border: '#D9DDE4',
    text: '#171A21',
    muted: '#626A78',
    accent: '#315BD8',
    accentSoft: 'rgba(49,91,216,0.09)',
    action: '#315BD8',
    onAction: '#FFFFFF',
    success: '#147A57',
    warning: '#A96812',
    error: '#C9364B',
    scrim: 'rgba(0,0,0,0.35)',
    successSoft: 'rgba(20,122,87,0.07)',
    errorSoft: 'rgba(201,54,75,0.07)',
  },
};
export type Colors = typeof palettes.dark;
/**
 * The accents a person can pick. Only the four interaction roles move; status colours
 * and every neutral stay put, so an accent never makes a selection read as "connected"
 * or "error". Each pair is held to 4.5:1 by `tests/accentContrast.test.ts`. Graphite's
 * dark button is near-white, which is why `onAction` is a role and not a literal.
 */
type AccentRoles = Pick<Colors, 'accent' | 'accentSoft' | 'action' | 'onAction'>;
export const accents = {
  cobalt: {
    name: 'Cobalt',
    dark: {
      accent: '#5B7CFA',
      accentSoft: 'rgba(91,124,250,0.14)',
      action: '#4667E8',
      onAction: '#FFFFFF',
    },
    light: {
      accent: '#315BD8',
      accentSoft: 'rgba(49,91,216,0.09)',
      action: '#315BD8',
      onAction: '#FFFFFF',
    },
  },
  sky: {
    name: 'Sky',
    dark: {
      accent: '#4FB3F6',
      accentSoft: 'rgba(79,179,246,0.14)',
      action: '#1F6FB8',
      onAction: '#FFFFFF',
    },
    light: {
      accent: '#0B67B0',
      accentSoft: 'rgba(11,103,176,0.09)',
      action: '#0B67B0',
      onAction: '#FFFFFF',
    },
  },
  teal: {
    name: 'Teal',
    dark: {
      accent: '#2EC4B6',
      accentSoft: 'rgba(46,196,182,0.14)',
      action: '#0F766E',
      onAction: '#FFFFFF',
    },
    light: {
      accent: '#0B7069',
      accentSoft: 'rgba(11,112,105,0.09)',
      action: '#0B7069',
      onAction: '#FFFFFF',
    },
  },
  ember: {
    name: 'Ember',
    dark: {
      accent: '#FF8A4C',
      accentSoft: 'rgba(255,138,76,0.14)',
      action: '#C2410C',
      onAction: '#FFFFFF',
    },
    light: {
      accent: '#BF3F0B',
      accentSoft: 'rgba(191,63,11,0.09)',
      action: '#BF3F0B',
      onAction: '#FFFFFF',
    },
  },
  graphite: {
    name: 'Graphite',
    dark: {
      accent: '#E6E9EF',
      accentSoft: 'rgba(230,233,239,0.12)',
      action: '#F5F7FA',
      onAction: '#0E0F12',
    },
    light: {
      accent: '#2A2F3A',
      accentSoft: 'rgba(23,26,33,0.07)',
      action: '#171A21',
      onAction: '#FFFFFF',
    },
  },
} satisfies Record<string, { name: string; dark: AccentRoles; light: AccentRoles }>;
export type AccentId = keyof typeof accents;
export const accentIds = Object.keys(accents) as AccentId[];
export const isAccentId = (value: unknown): value is AccentId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(accents, value);
const built = new Map<string, Colors>();
/** One object per theme and accent, never a fresh one per render: effects keyed on
 *  `colors` (the terminal's theme push among them) would otherwise run every frame. */
export function paletteFor(dark: boolean, accent: AccentId = 'cobalt'): Colors {
  const base = dark ? palettes.dark : palettes.light;
  const id = isAccentId(accent) ? accent : 'cobalt';
  if (id === 'cobalt') return base;
  const key = `${dark ? 'dark' : 'light'}:${id}`;
  let colors = built.get(key);
  if (!colors) built.set(key, (colors = { ...base, ...accents[id][dark ? 'dark' : 'light'] }));
  return colors;
}
export const ThemeContext = createContext<{ colors: Colors; dark: boolean }>({
  colors: palettes.dark,
  dark: true,
});
export const useTheme = () => useContext(ThemeContext);
