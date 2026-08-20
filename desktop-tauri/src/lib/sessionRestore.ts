import type { PaneState } from "../state/terminalStoreTypes";
import type { PersistedPane, TerminalSession } from "../types";

// Pure mapping between the saved session and live pane state. Kept free of
// React and IPC so the id rules below can be unit-tested directly.

/**
 * Rust hands out session ids from 1 upward and **resets the counter on every
 * launch** (`pty/manager.rs`, `next_id: AtomicU64::new(1)`). A restored pane
 * therefore cannot keep its old id — it would collide with the next real
 * session and cross-wire the terminal registry and event bus.
 *
 * Suspended panes get negative ids instead. Nothing in Rust can ever produce
 * one, so the two spaces cannot overlap, and a pane swaps to its real id the
 * moment it is resumed.
 */
export function placeholderId(index: number): number {
  return -(index + 1);
}

export function isSuspendedId(id: number): boolean {
  return id < 0;
}

export function toPaneStates(session: TerminalSession): PaneState[] {
  return session.panes.map((pane, index) => ({
    id: placeholderId(index),
    projectId: pane.projectId,
    agentId: pane.agentId,
    title: pane.title,
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    sourceCwd: pane.sourceCwd,
    workspaceMode: pane.workspaceMode,
    // Deliberately dropped: a stale fingerprint must not be trusted a session
    // later. Resume re-inspects the workspace, exactly as restart does.
    safeSnapshotFingerprint: null,
    customTitle: pane.customTitle,
    osc: null,
    accent: pane.accent,
    status: "suspended",
    exitCode: null,
    visibility: "visible",
    lastFocusedAt: 0,
    snapshot: pane.snapshot,
  }));
}

/**
 * Live panes report their real id so Rust can read their scrollback; suspended
 * panes report 0 and carry the snapshot they were restored with.
 */
export function toPersistedPanes(panes: PaneState[]): PersistedPane[] {
  return panes.map((pane) => ({
    id: isSuspendedId(pane.id) ? 0 : pane.id,
    projectId: pane.projectId,
    agentId: pane.agentId,
    title: pane.title,
    customTitle: pane.customTitle,
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    sourceCwd: pane.sourceCwd,
    workspaceMode: pane.workspaceMode,
    accent: pane.accent,
    snapshot: pane.snapshot ?? null,
  }));
}
