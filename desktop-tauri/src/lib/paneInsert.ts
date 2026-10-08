import type { PaneState, TerminalStore } from "../state/terminalStoreTypes";

// Kept free of IPC and store imports so the placement rules can be tested
// directly — resuming a pane must never leave the old one behind.

/**
 * Places a freshly spawned pane. With `replaces` it takes that pane's slot and
 * inherits focus/zoom from it, so resuming never reorders the grid; otherwise
 * it is appended.
 */
export function insertPane(
  state: TerminalStore,
  pane: PaneState,
  replaces?: number,
): Partial<TerminalStore> {
  if (replaces === undefined) {
    return { panes: [...state.panes, pane], focusedId: pane.id };
  }
  const activity = { ...state.activity };
  delete activity[replaces];
  return {
    panes: state.panes.map((candidate) => (candidate.id === replaces ? pane : candidate)),
    focusedId: pane.id,
    zoomedId: state.zoomedId === replaces ? pane.id : state.zoomedId,
    activity,
  };
}
