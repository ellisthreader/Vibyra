import type { Terminal } from "@xterm/xterm";

import { readClipboardPaste } from "../ipc/tools";
import { useWorkspaceStore } from "../state/workspaceStore";
import { shellQuotePath } from "./terminalDrop";
import { terminalPasteKey } from "./platform";

/**
 * Mac uses Command+V; Control+Shift+V also pastes on every platform.
 * Plain Control+V stays a control code the running program owns (^V is
 * readline's quoted-insert, and CLIs bind it themselves).
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

export function attachTerminalClipboard(term: Terminal): void {
  term.attachCustomKeyEventHandler((event) => {
    if (terminalPasteKey(event)) {
      event.preventDefault();
      void pasteIntoTerminal(term);
      return false;
    }
    if (event.type !== "keydown" || event.code !== "KeyV") return true;
    // Plain Ctrl+V belongs to the running CLI, including on Mac.
    if (!event.ctrlKey || event.metaKey || event.altKey) return true;
    // WebKit pastes from the keydown's default action, so both branches have
    // to cancel it: one to paste on our terms, the other so the process sees
    // ^V instead of the clipboard.
    event.preventDefault();
    if (!event.shiftKey) return true;
    void pasteIntoTerminal(term);
    return false;
  });
}
