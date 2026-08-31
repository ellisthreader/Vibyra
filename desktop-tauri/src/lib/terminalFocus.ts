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

/**
 * Whether a mousedown on the pane needs focus moved by hand.
 *
 * xterm focuses itself for a press on its own element. A press anywhere else
 * in the pane — the empty run above a bottom-anchored prompt — would instead
 * leave focus on the host div, and the prompt would ignore typing until the
 * user happened to click on the text itself.
 */
export function clickNeedsTerminalFocus(
  target: EventTarget | null,
  termElement: Node | undefined,
): boolean {
  // Deliberately not `target instanceof Node`: that global does not exist
  // outside a DOM, so the guard threw where this logic is unit-tested.
  if (!termElement || !target) return true;
  return !termElement.contains(target as Node);
}
