import type { TitleHint, TitleRequest } from "../ipc/terminal";
import type { PaneState } from "../state/terminalStoreTypes";
import { cleanNativeTitle, nextAutoTitle } from "./promptTitle.ts";

// Which panes are worth asking about, and what to do with the answer. Kept free
// of IPC and the store so the rules can be tested on their own.

/** Agents that write their own conversation title where the Mac can read it. */
const NAMING_AGENTS = new Set(["claude", "codex"]);
/** A shell line is a command, not a request; there is nothing to name it by. */
const UNNAMEABLE = new Set(["shell", "ssh"]);

/**
 * `unnamed` is the quick pass: panes that have no work-derived name yet, so a
 * first request shows up within seconds. `all` is the slow pass that lets an
 * agent's own title, which arrives after its first reply, replace a stand-in.
 * A pane the person named is left entirely alone. `awaiting` panes wear a
 * stand-in and stay in the quick pass so the agent's name replaces it promptly.
 */
export function titleRequests(
  panes: PaneState[],
  scope: "unnamed" | "all",
  awaiting: ReadonlySet<number> = new Set(),
): TitleRequest[] {
  return panes
    .filter((pane) => pane.status === "running" && pane.id > 0 && !pane.customTitle && !UNNAMEABLE.has(pane.agentId))
    .filter((pane) => scope === "unnamed"
      ? !pane.autoTitle || awaiting.has(pane.id)
      : NAMING_AGENTS.has(pane.agentId) && pane.agentSessionId !== null)
    .map((pane) => ({ id: pane.id, agentId: pane.agentId, sessionId: pane.agentSessionId, accountId: pane.accountId }));
}

/** The panes whose automatic title should change, judged against the panes as they are now. */
export function changedTitles(panes: PaneState[], hints: TitleHint[]): Record<number, string> {
  const changed: Record<number, string> = {};
  for (const hint of hints) {
    const pane = panes.find((candidate) => candidate.id === hint.id);
    if (!pane || pane.status !== "running" || pane.customTitle) continue;
    const next = nextAutoTitle(pane.autoTitle ?? null, hint);
    if (next && next !== pane.autoTitle) changed[pane.id] = next;
  }
  return changed;
}

/**
 * Claude and Codex name a conversation seconds after its first request, so a
 * stand-in they get is watched closely until `until`; their own name, once
 * read, ends the watch. Updates `awaiting` (pane id → deadline) in place.
 */
export function trackStandIns(
  awaiting: Map<number, number>,
  panes: PaneState[],
  hints: TitleHint[],
  changed: Record<number, string>,
  until: number,
): void {
  for (const hint of hints) {
    const pane = panes.find((candidate) => candidate.id === hint.id);
    if (cleanNativeTitle(hint.nativeTitle) || !pane) awaiting.delete(hint.id);
    else if (changed[hint.id] && NAMING_AGENTS.has(pane.agentId)) awaiting.set(hint.id, until);
  }
}
