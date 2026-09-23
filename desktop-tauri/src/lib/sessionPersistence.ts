import { saveConversationLayoutNow } from '../state/conversationTerminalStore';
import { flushSettings, useSettingsStore } from '../state/settingsStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { saveTerminalSession } from "../ipc/session";
import { useTerminalStore, type PaneState } from "../state/terminalStore";
import { lastOutputAt } from "./activity";
import { toPersistedPanes } from "./sessionRestore";
import { refreshActiveSessionIdentities, refreshSessionIdentities } from "./sessionIdentity";

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
/** The pane list the last scrollback save wrote, and when that save began. */
let checkpointed: { panes: PaneState[]; at: number } | null = null;
const reportSaveFailure = (error: unknown) => useWorkspaceStore.getState().setError(`Terminals could not be saved: ${String(error)}. Keep Vibyra open until saving succeeds.`);

/** Identity of the persisted layout — activity ticks and focus must not save. */
function signature(): string {
  return useTerminalStore
    .getState()
    .panes.map((pane) =>
      [pane.id, pane.projectId, pane.agentId, pane.agentSessionId, pane.accountId, pane.customTitle ?? pane.title, pane.status].join(":"),
    )
    .join("|");
}

/** `routine` saves (layout, heartbeat, blur) leave an unchanged settings.json
 * alone; closing, updating and pagehide still rewrite it. */
export async function saveSessionNow(includeSnapshots: boolean, routine = false): Promise<void> {
  const save = saves.catch(() => {}).then(async () => {
    if (!useTerminalStore.getState().sessionReady) throw new Error("Saved terminals have not finished restoring.");
    await flushSettings(!routine);
    saveConversationLayoutNow();
    await refreshSessionIdentities();
    const panes = useTerminalStore.getState().panes;
    const at = Date.now();
    await saveTerminalSession(toPersistedPanes(panes), includeSnapshots);
    if (includeSnapshots) checkpointed = { panes, at };
  });
  saves = save;
  await save;
}

/**
 * Whether a routine checkpoint would write anything new. The saved session is
 * the pane list plus the scrollback Rust reads, so it is current when the
 * store still holds the very array last written, no terminal has printed
 * since that save began, and no settings write is waiting on a retry.
 * `minGapMs` throttles blur, which can fire many times a minute.
 */
function checkpointDue(minGapMs: number): boolean {
  if (!checkpointed) return true;
  if (Date.now() - checkpointed.at < minGapMs) return false;
  return useTerminalStore.getState().panes !== checkpointed.panes
    || lastOutputAt() >= checkpointed.at
    || useSettingsStore.getState().saveState === "error";
}

export function startSessionPersistence(): () => void {
  lastSignature = signature();

  unsubscribe = useTerminalStore.subscribe(() => {
    const next = signature();
    if (next === lastSignature) return;
    lastSignature = next;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void saveSessionNow(false, true).catch(reportSaveFailure);
    }, METADATA_DEBOUNCE_MS);
  });

  heartbeat = setInterval(() => {
    if (checkpointDue(0)) void saveSessionNow(true, true).catch(reportSaveFailure);
  }, SNAPSHOT_INTERVAL_MS);
  const identities = setInterval(() => { void refreshActiveSessionIdentities(); }, 10_000);
  const blur = () => { if (checkpointDue(SNAPSHOT_INTERVAL_MS)) void saveSessionNow(true, true).catch(reportSaveFailure); };
  // Leaving the page is the last chance to save, so it never skips.
  const checkpoint = () => { void saveSessionNow(true).catch(reportSaveFailure); };
  window.addEventListener("blur", blur);
  window.addEventListener("pagehide", checkpoint);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (heartbeat) clearInterval(heartbeat);
    clearInterval(identities);
    window.removeEventListener("blur", blur);
    window.removeEventListener("pagehide", checkpoint);
    unsubscribe?.();
    debounceTimer = null;
    heartbeat = null;
    unsubscribe = null;
  };
}
