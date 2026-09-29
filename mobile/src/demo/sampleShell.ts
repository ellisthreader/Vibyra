/**
 * The sample terminal receives what a real one does: keys, one at a time, and
 * a whole pasted line now and then. A shell echoes them and edits a line —
 * printable characters append, backspace erases one, return submits — so this
 * does the same, returning what to draw and the lines that were entered.
 */
export interface SampleShell {
  line: string;
}
export const samplePrompt = '$ ';
export function sampleShellInput(
  shell: SampleShell,
  keys: string,
): { echo: string; entered: string[] } {
  let echo = '';
  const entered: string[] = [];
  for (const key of keys) {
    if (key === '\r' || key === '\n') {
      const text = shell.line.trim();
      shell.line = '';
      if (text) {
        entered.push(text);
        echo += '\r\nSample only — command not executed.\r\n' + samplePrompt;
      } else echo += '\r\n' + samplePrompt;
    } else if (key === '\u007f' || key === '\b') {
      if (shell.line) {
        shell.line = shell.line.slice(0, -1);
        echo += '\b \b';
      }
    } else if (key >= ' ') {
      shell.line += key;
      echo += key;
    }
  }
  return { echo, entered };
}
