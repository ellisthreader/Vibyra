interface TerminalFocusHost {
  readonly isConnected: boolean;
  closest(selector: string): Element | null;
}

interface MountedTerminalFocus {
  id: number;
  focusedId: number | null;
  active: boolean;
  host: TerminalFocusHost;
  modalOpen: boolean;
  focus: () => void;
}

interface RestorableTerminalFocus {
  focusedId: number | null;
  setFocus(id: number): void;
}

/**
 * Transfers the store's logical focus to a newly mounted xterm.
 *
 * Terminal creation waits for the bundled font, so the pane can become
 * logically focused before xterm's textarea exists. Re-checking every guard
 * at handoff time prevents a late mount from stealing focus from another pane
 * or from a modal that opened while the terminal was being prepared.
 */
export function focusMountedTerminal(context: MountedTerminalFocus): boolean {
  const { id, focusedId, active, host, modalOpen, focus } = context;
  if (
    !active ||
    focusedId !== id ||
    !host.isConnected ||
    host.closest("[inert]") !== null ||
    modalOpen
  ) {
    return false;
  }
  focus();
  return true;
}

/** Restores focus after a clicked overlay unmounts, without stealing it if the
 * user selected another pane before the next animation frame. */
export function restoreTerminalFocusAfterOverlay(
  id: number | null,
  readFocus: () => RestorableTerminalFocus,
  schedule: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
): void {
  if (id === null) return;
  schedule(() => {
    const terminals = readFocus();
    if (terminals.focusedId === id) terminals.setFocus(id);
  });
}
