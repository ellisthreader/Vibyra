import type { Colors } from '../theme';
import { ansi } from './ansi';
import type { TerminalGrid } from './TerminalSurface.types';

export const TERMINAL_TARGET = 'vibyra-terminal';

/** Everything about the terminal that is not its text. Sent when any of it
 *  changes. `grid` is the computer's own, drawn as it is and zoomed; without
 *  it the phone lays out for its own width and reports that. */
export const terminalState = (
  disabled: boolean,
  colors: Colors,
  dark: boolean,
  fontSize?: number,
  grid?: TerminalGrid | null,
) => ({
  target: TERMINAL_TARGET,
  type: 'state',
  disabled,
  fontSize,
  ...(grid ? { grid } : {}),
  theme: {
    background: colors.workspace,
    foreground: colors.text,
    cursor: colors.accent,
    selectionBackground: colors.accentSoft,
    ...(dark ? ansi.dark : ansi.light),
  },
});

/** Bytes to draw. A reset clears first; `grid` is the width they were drawn for. */
export const terminalOutput = (data: string, reset: boolean, grid?: TerminalGrid | null) => ({
  target: TERMINAL_TARGET,
  type: 'output',
  data,
  reset,
  ...(reset && grid ? { grid } : {}),
});

export const terminalScroll = () => ({ target: TERMINAL_TARGET, type: 'scroll', to: 'bottom' });
