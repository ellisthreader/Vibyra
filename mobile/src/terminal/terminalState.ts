import type { Colors } from '../theme';
export const terminalState = (output: string, disabled: boolean, colors: Colors) => ({
  target: 'vibyra-terminal', type: 'state', output, disabled,
  theme: { background: colors.workspace, foreground: colors.text, cursor: colors.accent,
    selectionBackground: colors.accentSoft },
});
