import type { Colors } from '../theme';
import { ansi } from './ansi';
export const terminalState = (output: string, disabled: boolean, colors: Colors, dark: boolean,
  fontSize?: number) => ({
  target: 'vibyra-terminal', type: 'state', output, disabled, fontSize,
  theme: { background: colors.workspace, foreground: colors.text, cursor: colors.accent,
    selectionBackground: colors.accentSoft, ...(dark ? ansi.dark : ansi.light) },
});
