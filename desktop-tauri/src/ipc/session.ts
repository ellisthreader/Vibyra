import { invoke } from "@tauri-apps/api/core";

import type { PersistedPane, TerminalSession } from "../sessionTypes";

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

/**
 * Tells Rust whether a UI capable of answering the close veto is mounted.
 * Rust closes immediately when it is not — otherwise the sign-in screen, which
 * mounts no workspace, could never be closed.
 */
export function armCloseGuard(armed: boolean): Promise<void> {
  return invoke("arm_close_guard", { armed });
}

/** "I heard you" — sent the moment a close request arrives, before the user is
 * asked anything, so Rust's watchdog knows the webview is alive. */
export function ackCloseRequest(): Promise<void> {
  return invoke("ack_close_request");
}
