/**
 * Finds a choice prompt a CLI is waiting on at the bottom of its screen, so a
 * phone can offer the choices as buttons. Two shapes exist:
 *
 * - numbered, like Claude Code's "Do you want to proceed? ❯ 1. Yes  2. … 3. No"
 *   (digit shortcuts), or Codex's command approval (printed y/p/Esc shortcuts);
 * - a cursor menu, like Claude Code's folder trust check ("❯ No, exit /
 *   Yes, I trust this folder" over "Enter to confirm · Esc to cancel") — the
 *   arrow keys move the ❯ and Enter confirms.
 *
 * Only the live bottom of the screen counts: a numbered list the agent wrote
 * earlier, or one followed by an empty input line, is not a prompt.
 */
export interface TerminalPrompt {
  question: string;
  /** The scope, reason and command shown above a CLI approval menu. */
  context?: string;
  /** `keys` are the exact bytes that pick this choice. */
  options: { label: string; keys: string }[];
}

const MARKER = /^[❯›>▶●]\s*/;
const NUMBERED = /^(?:[❯›>▶●○◉◯*]\s*)?(\d)[.)]\s+(.+?)\s*$/;
const INPUT_LINE = /^[>❯›]\s*$/;
const HINT = /enter to (confirm|select)|esc to cancel/i;
const CODEX_COMMAND = 'Would you like to run the following command?';
const CODEX_KEY = /\((y|p|esc)\)\s*$/i;
const UP = '\x1b[A';
const DOWN = '\x1b[B';
type Row = { text: string; indent: number };
// Box-drawing borders some CLIs draw around the prompt. Indent is kept: a label's
// wrapped rows sit further right than its number, a key hint does not.
function row(line: string): Row {
  const inner = line.replace(/^\s*[│┃|]/, '').replace(/[│┃|]\s*$/, '');
  return { text: inner.trim(), indent: inner.length - inner.trimStart().length };
}
const border = (text: string) => /^[─━╭╮╰╯┌┐└┘\s-]*$/.test(text);

function question(lines: Row[], first: number): { text: string; context?: string; codex: boolean } | null {
  // Codex places its command and a possibly question-shaped Reason between the
  // title and menu. A long wrapped command can put the title over six rows up.
  const start = Math.max(0, first - 24);
  for (let above = first - 1; above >= start; above--) {
    if (lines[above].text !== CODEX_COMMAND) continue;
    const context = lines.slice(above + 1, first).map((line) => line.text).join('\n');
    if (!context || context.length > 4096 || !/\$\s+\S/.test(context)) return null;
    return { text: CODEX_COMMAND, context, codex: true };
  }
  for (let above = first - 1; above >= Math.max(0, first - 6); above--)
    if (lines[above].text.includes('?')) return { text: lines[above].text, codex: false };
  return null;
}

function numbered(lines: Row[], end: number, below: Row[]): TerminalPrompt | null {
  // Once the CLI has answered, ordinary output or a shell prompt below the
  // menu means it is no longer waiting. Keep only wrapped labels and key hints.
  if (below.some((line) => line.indent <= lines[end].indent && !HINT.test(line.text))) return null;
  const options: { key: string; label: string }[] = [];
  let index = end;
  let wrapped: Row[] = [];
  // Walking up, a long label's wrapped rows arrive before the option they belong to.
  const label = (option: Row, text: string, rows: Row[]) =>
    [text, ...rows.filter((r) => r.indent > option.indent).map((r) => r.text)].join(' ');
  for (; index >= 0; index--) {
    const match = NUMBERED.exec(lines[index].text);
    if (!match) {
      if (!options.length || wrapped.length >= 2) break;
      wrapped.unshift(lines[index]);
      continue;
    }
    const expected = options.length ? Number(options[0].key) - 1 : Number(match[1]);
    if (Number(match[1]) !== expected) return null;
    options.unshift({ key: match[1], label: label(lines[index], match[2], options.length ? wrapped : below) });
    wrapped = [];
    if (match[1] === '1') break;
  }
  if (options.length < 2 || options[0].key !== '1') return null;
  const asked = question(lines, index);
  if (!asked) return null;
  // If Codex's title scrolled off a short screen, a question mark in Reason
  // must not make its hotkey menu look like a generic 1/2/3 menu.
  if (!asked.codex && options.filter((option) => CODEX_KEY.test(option.label)).length >= 2) return null;
  const choices = options.map((option) => {
    const hotkey = asked.codex ? CODEX_KEY.exec(option.label)?.[1]?.toLowerCase() : undefined;
    return { label: option.label, keys: hotkey === 'esc' ? '\x1b' : hotkey ?? option.key };
  });
  // A Codex menu may redraw with no key hints; do not guess that its row
  // numbers are shortcuts and accidentally send a digit to the CLI.
  if (asked.codex && choices.some((choice, i) => choice.keys === options[i].key)) return null;
  return { question: asked.text, context: asked.context, options: choices };
}

function cursorMenu(lines: Row[], end: number, below: Row[]): TerminalPrompt | null {
  // Without a numbered label, only the CLI's own key hint marks this as a menu.
  if (!below.some((r) => HINT.test(r.text))) return null;
  let first = end;
  // The ❯ line sits two columns left of its siblings' text; collect both kinds.
  const menu: Row[] = [];
  for (let index = end; index >= 0; index--) {
    const line = lines[index];
    const marked = MARKER.test(line.text);
    const textAt = marked ? line.indent + 2 : line.indent;
    if (menu.length && textAt !== menu[0].indent) break;
    menu.unshift({ text: line.text, indent: textAt });
    first = index;
  }
  const selected = menu.findIndex((r) => MARKER.test(r.text));
  if (menu.length < 2 || selected < 0 || menu.filter((r) => MARKER.test(r.text)).length > 1) return null;
  const asked = question(lines, first);
  if (!asked) return null;
  return {
    question: asked.text,
    options: menu.map((r, index) => ({
      label: r.text.replace(MARKER, ''),
      keys: (index > selected ? DOWN : UP).repeat(Math.abs(index - selected)) + '\r',
    })),
  };
}

export function findPrompt(screen: string[]): TerminalPrompt | null {
  const lines = screen.map(row).filter((line) => line.text && !border(line.text));
  let end = lines.length - 1;
  const below: Row[] = [];
  // A key hint ("Esc to cancel") may sit under the options; an empty input line may not.
  for (; end >= 0 && !NUMBERED.test(lines[end].text); end--) {
    if (INPUT_LINE.test(lines[end].text)) return null;
    if (HINT.test(lines[end].text) && end > 0 && !NUMBERED.test(lines[end - 1].text)) {
      // A cursor menu ends right above its hint.
      const menu = cursorMenu(lines, end - 1, [...below, lines[end]]);
      if (menu) return menu;
    }
    if (below.length >= 3) return null;
    below.unshift(lines[end]);
  }
  return end < 0 ? null : numbered(lines, end, below);
}
