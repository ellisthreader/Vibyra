import type { PaneState } from "../state/terminalStoreTypes";
import type { PersistedPane, TerminalSession } from "../sessionTypes";

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
    resumeCwd: pane.resumeCwd ?? null,
    workspaceMode: pane.workspaceMode,
    // Deliberately dropped: a stale fingerprint must not be trusted a session
    // later. New worktrees are re-inspected; resume validates its existing path.
    safeSnapshotFingerprint: null,
    customTitle: pane.customTitle,
    osc: null,
    accent: pane.accent,
    agentSessionId: pane.agentSessionId ?? null,
    // Restored on the login it ran as, so resuming does not silently move a
    // conversation to a different account's folder.
    accountId: pane.accountId ?? null,
    status: "suspended",
    exitCode: null,
    visibility: "visible",
    // When the pane was last in front of the user, as far as anything knows:
    // the moment the session was written. Zero would be the epoch, which the
    // Home card renders as "20687d ago".
    lastFocusedAt: session.savedAtMs,
    snapshot: pane.snapshot,
  }));
}

/**
 * The project a launch should open, or null to stay on Home.
 *
 * `projectStore.init` opens on Home, which is the right first screen for a
 * fresh launch. A launch that restored panes is not fresh: the user left
 * terminals open in a project, and a Home screen that *counts* them ("4
 * sessions idle") while showing none is indistinguishable from nothing having
 * been restored at all.
 *
 * Which project is not simply the active one. `activeProjectId` records the
 * last project *opened*, which drifts away from where the panes are the moment
 * the user looks at another project before quitting — and then every restored
 * pane is filtered out of a workspace that has none of its own. So the active
 * project wins only if it actually holds restored panes; otherwise the panes
 * decide, by weight of numbers.
 */
export function restoredProjectId(
  panes: PaneState[],
  activeProjectId: string | null,
): string | null {
  const restored = panes.filter((pane) => pane.status === "suspended");
  if (restored.length === 0) return null;
  if (restored.some((pane) => pane.projectId === activeProjectId)) return activeProjectId;
  const counts = new Map<string, number>();
  for (const pane of restored) {
    counts.set(pane.projectId, (counts.get(pane.projectId) ?? 0) + 1);
  }
  // Ties go to the project the first restored pane is in: panes keep the order
  // the user had them in, so that is the leftmost one on their grid.
  let best = restored[0].projectId;
  for (const [projectId, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = projectId;
  }
  return best;
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
    resumeCwd: pane.resumeCwd ?? null,
    workspaceMode: pane.workspaceMode,
    accent: pane.accent,
    snapshot: pane.snapshot ?? null,
    agentSessionId: pane.agentSessionId ?? null,
    accountId: pane.accountId ?? null,
  }));
}
