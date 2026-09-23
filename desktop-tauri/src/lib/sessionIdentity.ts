import { terminalSessionIdentities } from "../ipc/terminal";
import { useTerminalStore, type PaneState } from "../state/terminalStore";
import { lastOutputAt } from "./activity";

let pending: Promise<void> | null = null;
/** When the last probe began. Output stamped at or after it may belong to a
 * conversation the probe did not see yet. */
let probedAt = 0;

const runningCodex = () =>
  useTerminalStore.getState().panes.filter((p) => p.status === "running" && p.agentId === "codex");

/** Refresh before saving as well as while running; multiple panes never race probes. */
export function refreshSessionIdentities(): Promise<void> {
  if (pending) return pending;
  const panes = runningCodex();
  if (!panes.length) return Promise.resolve();
  const previous = probedAt;
  probedAt = Date.now();
  pending = terminalSessionIdentities(panes.map(({ id, accountId }) => ({ id, accountId })))
    .then((identities) => {
      const changed = (pane: PaneState) => {
        const identity = identities.find((entry) => entry.id === pane.id);
        return identity && pane.status === "running" && pane.agentSessionId !== identity.sessionId ? identity : null;
      };
      // Unchanged ids must not hand every `panes` subscriber a new array.
      if (!useTerminalStore.getState().panes.some(changed)) return;
      useTerminalStore.setState((state) => ({
        panes: state.panes.map((pane) => {
          const identity = changed(pane);
          return identity ? { ...pane, agentSessionId: identity.sessionId } : pane;
        }),
      }));
    })
    // Inspection is advisory. If unavailable, keep the last known ID or use
    // the CLI chooser. It must never prevent a workspace checkpoint. A failed
    // probe saw nothing, so the output before it still counts as unprobed.
    .catch(() => { probedAt = previous; })
    .finally(() => { pending = null; });
  return pending;
}

/**
 * The running-pane rhythm. A Codex pane only starts or switches conversation
 * while it prints (launch banner, `/new`, the first reply), so a probe after a
 * quiet interval could only find the ids already known — skip it. A pane that
 * printed is probed within one tick, which keeps its id captured before exit.
 */
export function refreshActiveSessionIdentities(): Promise<void> {
  if (!runningCodex().some((pane) => lastOutputAt(pane.id) >= probedAt)) return Promise.resolve();
  return refreshSessionIdentities();
}
