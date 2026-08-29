import type { Terminal } from "@xterm/xterm";

import { readClipboardPaste, writeClipboardText } from "../ipc/tools";
import { useWorkspaceStore } from "../state/workspaceStore";
import { clipboardIntent } from "./terminalClipboardKeys";
import { shellQuotePath } from "./terminalDrop";

/**
 * The terminal's clipboard, in both directions.
 *
 * Both go through Rust rather than the page. xterm paints its own selection
 * instead of making a DOM one, and the app sets `user-select: none`, so
 * WebKit's own copy has nothing to reach; and WebKit exposes no image flavour
 * to the page, which paste needs. `terminalClipboardKeys` owns which chord
 * means what.
 */

/** Types the clipboard into `term`; a copied image is typed as its path. */
async function pasteIntoTerminal(term: Terminal): Promise<void> {
  try {
    const payload = await readClipboardPaste();
    if (payload.kind === "text") term.paste(payload.text);
    else if (payload.kind === "image") term.paste(`${shellQuotePath(payload.path)} `);
  } catch (error) {
    useWorkspaceStore.getState().setError(`Paste failed: ${String(error)}`);
  }
}

/** Copies what is selected in `term`, if anything. */
async function copyFromTerminal(term: Terminal): Promise<void> {
  const selection = term.getSelection();
  if (!selection) return;
  try {
    await writeClipboardText(selection);
  } catch (error) {
    useWorkspaceStore.getState().setError(`Copy failed: ${String(error)}`);
  }
}

export function attachTerminalClipboard(term: Terminal, container: HTMLElement): void {
  // xterm keeps one custom handler, so copy and paste share it.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    const intent = clipboardIntent(event);
    if (intent === "ignore") return true;

    // WebKit acts on the keydown's default action, so every branch that gets
    // this far cancels it — including the one that wants the process to see
    // the control code rather than the clipboard.
    event.preventDefault();
    if (intent === "control-code") return true;
    // Copy is swallowed even with nothing selected: letting the chord through
    // would reach the process as ^C and interrupt whatever it was doing,
    // which is the opposite of what someone reaching for copy wants.
    if (intent === "copy") void copyFromTerminal(term);
    else void pasteIntoTerminal(term);
    return false;
  });

  // Right-clicking a selection copies it, the way a terminal is expected to
  // behave. With nothing selected the event is left alone, so no menu the
  // webview would otherwise show is suppressed for no reason.
  container.addEventListener("contextmenu", (event) => {
    if (!term.hasSelection()) return;
    event.preventDefault();
    void copyFromTerminal(term);
  });
}
