import type { PaneState } from "../state/terminalStoreTypes";

// The last line of defence for a pane that was asked to continue a conversation.
//
// Everything upstream narrows the chance of naming one the agent will refuse:
// the rollout picker no longer mistakes a subagent's thread for the pane's own,
// and the preflight drops an id whose transcript has gone. Neither can ever be
// complete. A conversation can be archived between the check and the launch;
// another process can already hold the thread, which Codex reports as `already
// has an active writer` before exiting 1; and the next CLI release can invent a
// refusal nobody has seen yet.
//
// So this layer does not try to predict the refusal. It notices that a pane
// launched to continue a conversation died almost immediately, and puts a
// working pane back in its place with the output the user was reading still on
// it. Losing the thread is a disappointment; losing the terminal as well is
// what made this a morning of dead panes.

/** How long after launch an exit still reads as "the agent refused to start". */
export const RECOVERY_WINDOW_MS = 15_000;

/** Agents Vibyra can ask to continue a conversation at all. */
const RESUMABLE_AGENTS = new Set(["claude", "codex", "gemini"]);

/**
 * Resume launches that have not yet been accounted for, keyed by the pane's
 * persistence id — the numeric session id belongs to the process, and the
 * whole point here is that the process may be about to die.
 */
const attempts = new Map<string, number>();

export function noteResumeAttempt(persistenceId: string, now = Date.now()): void {
  attempts.set(persistenceId, now);
}

/** Drops an attempt without acting on it — the pane was closed or hibernated. */
export function forgetResumeAttempt(persistenceId: string): void {
  attempts.delete(persistenceId);
}

/**
 * Claims the single recovery a resume attempt is allowed, if this exit earns it.
 *
 * The claim is consumed whether or not the recovery then succeeds, and that is
 * what makes a relaunch loop impossible: a pane that dies a second time comes
 * back as an ordinary failed pane showing the agent's own error, rather than
 * being restarted forever by Vibyra.
 */
export function claimFailedResume(
  persistenceId: string,
  code: number | null,
  now = Date.now(),
): boolean {
  const startedAt = attempts.get(persistenceId);
  if (startedAt === undefined) return false;
  attempts.delete(persistenceId);
  // Zero is the agent finishing its work, and a null code is the pane being
  // killed by Vibyra or the user. Neither is a refusal to start.
  if (code === null || code === 0) return false;
  // Past the window the pane plainly did start: whatever ended it is the run's
  // own business, and restarting it would throw away work rather than save it.
  return now - startedAt <= RECOVERY_WINDOW_MS;
}

/**
 * Whether a restored pane is quietly starting a new conversation.
 *
 * A pane that cannot resume still comes back with its old scrollback painted
 * above the new process, so it looks exactly like one that did. Saying nothing
 * is how a fresh conversation passes for a continued one until the user asks it
 * something it has no memory of.
 */
export function startsNewConversation(pane: PaneState, resuming: boolean): boolean {
  return !resuming && pane.status === "suspended" && RESUMABLE_AGENTS.has(pane.agentId);
}
