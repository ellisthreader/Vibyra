import type { Terminal } from '@xterm/xterm';
import { findPrompt } from './promptChoices';

/** Read settled CLI choices once per output burst, reporting only changes. */
export function promptReporter(terminal: Terminal, post: (payload: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = 'null';
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const buffer = terminal.buffer.active;
      const screen: string[] = [];
      for (let row = buffer.baseY; row < buffer.baseY + terminal.rows; row++)
        screen.push(buffer.getLine(row)?.translateToString(true) ?? '');
      const prompt = findPrompt(screen);
      const encoded = JSON.stringify(prompt);
      if (encoded === previous) return;
      previous = encoded;
      post({ type: 'prompt', prompt });
    }, 400);
  };
}
