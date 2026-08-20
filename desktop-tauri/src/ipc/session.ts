import { invoke } from "@tauri-apps/api/core";

import type { PersistedPane, TerminalSession } from "../types";

/** Rust reads each live pane's scrollback itself, so it is not sent from here. */
export function saveTerminalSession(
  panes: PersistedPane[],
  includeSnapshots: boolean,
): Promise<void> {
  return invoke("save_terminal_session", { panes, includeSnapshots });
}

export function loadTerminalSession(): Promise<TerminalSession> {
  return invoke("load_terminal_session");
}

export function clearTerminalSession(): Promise<void> {
  return invoke("clear_terminal_session");
}

/** Releases the close veto; the window shuts as soon as this resolves. */
export function confirmClose(): Promise<void> {
  return invoke("confirm_close");
}
