import { saveTerminalSession } from "../ipc/session";
import { useTerminalStore } from "../state/terminalStore";
import { toPersistedPanes } from "./sessionRestore";

// Two save rhythms, because the two halves of the session cost very different
// amounts to write:
//
//   * Layout (which panes, their order, titles) is tiny and changes often, so
//     it is written shortly after every change.
//   * Scrollback can be hundreds of kilobytes per pane, so it is captured on
//     close — the case that matters — plus a slow heartbeat that limits how
//     much output a crash can cost.

const METADATA_DEBOUNCE_MS = 1_000;
const SNAPSHOT_INTERVAL_MS = 120_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let lastSignature = "";
let saveQueue: Promise<void> = Promise.resolve();

/** Identity of the persisted layout — activity ticks and focus must not save. */
function signature(): string {
  return useTerminalStore
    .getState()
    .panes.map((pane) =>
      [pane.id, pane.projectId, pane.agentId, pane.customTitle, pane.chatTitle, pane.title, pane.status]
        .join(":"),
    )
    .join("|");
}

export function saveSessionNow(includeSnapshots: boolean): Promise<void> {
  const save = saveQueue.then(() => {
    const panes = toPersistedPanes(useTerminalStore.getState().panes);
    return saveTerminalSession(panes, includeSnapshots);
  });
  saveQueue = save.catch(() => {});
  return save;
}

export function startSessionPersistence(): () => void {
  lastSignature = signature();

  unsubscribe = useTerminalStore.subscribe(() => {
    const next = signature();
    if (next === lastSignature) return;
    lastSignature = next;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void saveSessionNow(false).catch(() => {});
    }, METADATA_DEBOUNCE_MS);
  });

  heartbeat = setInterval(() => {
    void saveSessionNow(true).catch(() => {});
  }, SNAPSHOT_INTERVAL_MS);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    debounceTimer = null;
    heartbeat = null;
    unsubscribe = null;
  };
}
