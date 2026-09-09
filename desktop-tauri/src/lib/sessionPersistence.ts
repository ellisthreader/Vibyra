import { saveTerminalSession } from "../ipc/session";
import { useTerminalStore } from "../state/terminalStore";
import { toPersistedPanes } from "./sessionRestore";
import { refreshSessionIdentities } from "./sessionIdentity";

// Two save rhythms, because the two halves of the session cost very different
// amounts to write:
//
//   * Layout (which panes, their order, titles) is tiny and changes often, so
//     it is written shortly after every change.
//   * Scrollback can be hundreds of kilobytes per pane, so it is captured on
//     close — the case that matters — plus a slow heartbeat that limits how
//     much output a crash can cost.

const METADATA_DEBOUNCE_MS = 1_000;
const SNAPSHOT_INTERVAL_MS = 30_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let lastSignature = "";
let saves: Promise<void> = Promise.resolve();

/** Identity of the persisted layout — activity ticks and focus must not save. */
function signature(): string {
  return useTerminalStore
    .getState()
    .panes.map((pane) =>
      [pane.id, pane.projectId, pane.agentId, pane.agentSessionId, pane.accountId, pane.customTitle ?? pane.title, pane.status].join(":"),
    )
    .join("|");
}

export async function saveSessionNow(includeSnapshots: boolean): Promise<void> {
  const save = saves.catch(() => {}).then(async () => {
    if (!useTerminalStore.getState().sessionReady) return;
    await refreshSessionIdentities();
    const panes = toPersistedPanes(useTerminalStore.getState().panes);
    await saveTerminalSession(panes, includeSnapshots);
  });
  saves = save;
  await save;
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
  const identities = setInterval(() => { void refreshSessionIdentities(); }, 10_000);
  const checkpoint = () => { void saveSessionNow(true).catch(() => {}); };
  window.addEventListener("blur", checkpoint);
  window.addEventListener("pagehide", checkpoint);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (heartbeat) clearInterval(heartbeat);
    clearInterval(identities);
    window.removeEventListener("blur", checkpoint);
    window.removeEventListener("pagehide", checkpoint);
    unsubscribe?.();
    debounceTimer = null;
    heartbeat = null;
    unsubscribe = null;
  };
}
