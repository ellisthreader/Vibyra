/**
 * What a keydown in a terminal means for the clipboard.
 *
 * Pure and dependency-free so the rule that matters most here can be tested
 * directly: the plain chords belong to the running program. ^C is the only way
 * to interrupt an agent mid-answer and ^V is readline's quoted-insert, so
 * copy and paste take the shifted chords every native terminal already uses.
 */
export type ClipboardIntent =
  /** Not ours — xterm and the process decide. */
  | "ignore"
  /** Copy the selection, and swallow the key. */
  | "copy"
  /** Paste the clipboard, and swallow the key. */
  | "paste"
  /** Cancel WebKit's own paste so plain ^V reaches the process instead. */
  | "control-code";

/** The parts of a keydown this decision reads. */
export interface ClipboardChord {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function clipboardIntent(event: ClipboardChord): ClipboardIntent {
  if (event.altKey) return "ignore";

  if (event.code === "KeyC") {
    // Cmd+C on macOS, Ctrl+Shift+C everywhere else. Plain Ctrl+C is never
    // taken: it is the interrupt.
    const macCopy = event.metaKey && !event.ctrlKey;
    const shiftedCopy = event.ctrlKey && event.shiftKey && !event.metaKey;
    return macCopy || shiftedCopy ? "copy" : "ignore";
  }

  if (event.code !== "KeyV") return "ignore";
  // macOS keeps its own Cmd+V, which the webview pastes natively.
  if (!event.ctrlKey || event.metaKey) return "ignore";
  return event.shiftKey ? "paste" : "control-code";
}
