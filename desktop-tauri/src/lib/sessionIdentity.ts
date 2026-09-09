import { terminalSessionIdentities } from "../ipc/terminal";
import { useTerminalStore } from "../state/terminalStore";

let pending: Promise<void> | null = null;

/** Refresh before saving as well as while running; multiple panes never race probes. */
export function refreshSessionIdentities(): Promise<void> {
  if (pending) return pending;
  const panes = useTerminalStore.getState().panes.filter((p) => p.status === "running" && p.agentId === "codex");
  if (!panes.length) return Promise.resolve();
  pending = terminalSessionIdentities(panes.map(({ id, accountId }) => ({ id, accountId })))
    .then((identities) => {
      useTerminalStore.setState((state) => ({
        panes: state.panes.map((pane) => {
          const identity = identities.find((entry) => entry.id === pane.id);
          return identity && pane.status === "running" && pane.agentSessionId !== identity.sessionId
            ? { ...pane, agentSessionId: identity.sessionId } : pane;
        }),
      }));
    })
    // Inspection is advisory. If unavailable, keep the last known ID or use
    // the CLI chooser. It must never prevent a workspace checkpoint.
    .catch(() => {})
    .finally(() => { pending = null; });
  return pending;
}
