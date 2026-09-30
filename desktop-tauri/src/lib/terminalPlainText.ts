// Raw terminal bytes as the text they drew — pure, so it can be tested
// without a terminal. The assistant reads a pane through this when its xterm
// is not mounted (another project, a hibernated pane, a saved run).

/**
 * Raw terminal output → roughly what it rendered as. Not an emulator: enough
 * to drop escape sequences, honour carriage returns and erased lines, and
 * collapse a spinner redrawing itself into its last frame.
 */
export function plainText(raw: string): string {
  const cleaned = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC: titles, links
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "") // DCS/SOS/PM/APC
    .replace(/\x1b\[[0-9;?]*[ -/]*([@-~])/g, (_, final: string) => (final === "K" ? ERASE : "")) // CSI
    .replace(/\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMNOZc]/g, "");
  const lines = cleaned.split("\n").map(renderLine);
  // A status line redrawn in place leaves one copy per frame; keep the last.
  return lines.filter((line, index) => line.trim() && line !== lines[index + 1]).join("\n");
}

const ERASE = "\u0001";

/** A carriage return starts the next write at column 0, over what was there;
 * an erase-line clears it. Everything else that is not printable goes. */
function renderLine(line: string): string {
  let shown = "";
  for (const part of line.split("\r")) {
    const erased = part.lastIndexOf(ERASE);
    const text = (erased === -1 ? part : part.slice(erased + 1)).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    shown = erased === -1 ? text + shown.slice(text.length) : text;
  }
  return shown.trimEnd();
}


/** An agent TUI's frame: borders, the empty input box and the mode footer.
 * Read as content, "⏵⏵ accept edits on" became "Claude is waiting for edits
 * to be accepted" — the last line on screen is usually one of these. */
export function isChrome(line: string): boolean {
  const bare = line.trim();
  return /^[\s│┃|╭╮╰╯─━┌┐└┘>❯]*$/.test(bare)
    || /^⏵|\b(accept edits|bypass permissions|plan mode) on\b|\? for shortcuts|esc to interrupt\)?$/.test(bare);
}
