import type { PaneState } from "../state/terminalStoreTypes";
import type { PersistedPane, TerminalSession } from "../sessionTypes";
import { normalizeTerminalChatTitle } from "./terminalTitle.ts";

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
    persistenceId: pane.persistenceId || `legacy-${session.savedAtMs}-${index}`,
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
    chatTitle: normalizeTerminalChatTitle(pane.chatTitle),
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

/** What a relaunch inherits from the pane it is replacing. */
export interface RelaunchContinuity {
  /** Ask the agent to continue the conversation this pane was in. */
  resume: boolean;
  /** Output to show above the new process's own, or null for a clean start. */
  replaySnapshot: string | null;
}

/**
 * Resuming and restarting are the same relaunch with opposite intent.
 *
 * **Resume** picks a suspended pane back up: the user is returning to work
 * they left, so the output they were reading stays on screen and the agent is
 * asked to continue its conversation rather than open an empty one.
 * **Restart** is asked for on a pane that is already running or has exited,
 * and deliberately starts clean — that is the whole reason to press it.
 *
 * `siblings` is every pane in the workspace, because for an agent that can
 * only resume *the most recent* conversation, whether that is the right one
 * is not a property of this pane alone. See `ambiguousRecencyResume`.
 *
 * `conversationResumable` answers whether the agent can still find the
 * conversation this pane's id names — see `agentConversationResumable`. It is
 * passed in rather than looked up here so this stays a pure decision.
 */
export function relaunchContinuity(
  pane: PaneState,
  siblings: PaneState[] = [],
  conversationResumable = true,
): RelaunchContinuity {
  if (pane.status !== "suspended") return { resume: false, replaySnapshot: null };
  return {
    // A pane that names a conversation the agent no longer has must not ask
    // for it: `claude --resume` kills the pane over a missing id instead of
    // opening an empty chat, which is how a pane that was never typed into
    // came back as an error. Relaunching keeps the id, so once the user does
    // say something the pane is resumable again.
    //
    // The saved output still replays. "Never written" and "cleaned up after
    // `cleanupPeriodDays`" look identical from here, and dropping the second
    // one's scrollback would throw away work the user can still read.
    resume: conversationResumable && !ambiguousRecencyResume(pane, siblings),
    replaySnapshot: pane.snapshot ?? null,
  };
}

/**
 * True when "continue the last conversation here" could mean more than one
 * thing, so it must not be asked for.
 *
 * A pane carrying its own conversation id names that one exactly and is never
 * ambiguous. Without an id all Vibyra can ask for is recency, which two panes
 * of the same agent in the same folder would both resolve to — pulling them
 * into one conversation with two live processes writing to it. Those relaunch
 * clean instead, which loses the thread but never corrupts it.
 */
export function ambiguousRecencyResume(pane: PaneState, siblings: PaneState[]): boolean {
  if (pane.agentSessionId) return false;
  return siblings.some(
    (other) =>
      other.id !== pane.id &&
      other.agentId === pane.agentId &&
      (other.sourceCwd ?? null) === (pane.sourceCwd ?? null),
  );
}

/**
 * Live panes report their real id so Rust can read their scrollback; suspended
 * panes report 0 and carry the snapshot they were restored with.
 */
export function toPersistedPanes(panes: PaneState[]): PersistedPane[] {
  return panes.map((pane) => ({
    id: isSuspendedId(pane.id) ? 0 : pane.id,
    persistenceId: pane.persistenceId,
    projectId: pane.projectId,
    agentId: pane.agentId,
    title: pane.title,
    customTitle: pane.customTitle,
    chatTitle: normalizeTerminalChatTitle(pane.chatTitle),
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    sourceCwd: pane.sourceCwd,
    workspaceMode: pane.workspaceMode,
    accent: pane.accent,
    snapshot: pane.snapshot ?? null,
    agentSessionId: pane.agentSessionId ?? null,
    accountId: pane.accountId ?? null,
  }));
}
