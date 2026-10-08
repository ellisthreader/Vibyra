import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { sendMenuBarStatus } from "../ipc/menuBar";
import { useAgentAttention } from "../state/agentAttentionStore";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useNotificationStore } from "../state/notificationStore";
import { usePhoneStore } from "../state/phoneStore";
import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTeammateNeeds } from "../state/teammateNeedsStore";
import { useTerminalStore } from "../state/terminalStore";
import { buildMenuBarSnapshot } from "./menuBarSnapshot";
import { openNeedsYou } from "./needsYou";
import { runNotificationAction } from "./notificationActions";
import { isMac } from "./platform";

/** Coalesces bursts (a tick can move several panes at once). */
const SEND_DELAY_MS = 250;
/** Recent rows age out with no store change, so re-check once a minute. */
const AGE_CHECK_MS = 60_000;

function snapshot() {
  const settings = useSettingsStore.getState().settings;
  const terminals = useTerminalStore.getState();
  return buildMenuBarSnapshot({
    enabled: settings?.notifications?.activityStatusEnabled !== false,
    panes: terminals.panes,
    activity: terminals.activity,
    chats: useAgentAttention.getState().runs,
    teammates: useTeammateNeeds.getState().items,
    phones: usePhoneStore.getState().status?.pending.length ?? 0,
    projects: settings?.projects ?? [],
    history: useNotificationStore.getState().history,
    now: Date.now(),
  });
}

async function openChat(sessionId: string): Promise<void> {
  const run = useAgentAttention.getState().runs[sessionId];
  if (!run) return openNeedsYou();
  await useProjectStore.getState().activate(run.projectId);
  useConversationTerminals.getState().reveal(sessionId);
  useAgentAttention.getState().markSeen(sessionId);
}

/** A menu row was clicked; the window is already in front. */
function open(key: string): void {
  const [kind, rest] = [key.slice(0, 2), key.slice(2)];
  if (kind === "t:" && /^\d+$/.test(rest)) runNotificationAction({ id: "focusSession", label: "", arg: Number(rest) });
  else if (kind === "c:") void openChat(rest);
  else if (kind === "m:") runNotificationAction({ id: "openTeammate", label: "", arg: rest });
  else openNeedsYou();
}

/**
 * Mirrors live agent activity into the menu bar item and the Dock badge
 * (`menu_bar_status.rs`). Reads the stores the window already keeps; sends only
 * when the snapshot actually changes, so a quiet workspace costs nothing.
 */
export function useMenuBarStatus(): void {
  useEffect(() => {
    // The glyph is a macOS template image and only macOS badges the Dock.
    if (!isMac) return;
    let last = "";
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      const next = snapshot();
      const text = JSON.stringify(next);
      if (text === last) return;
      last = text;
      void sendMenuBarStatus(next).catch(() => { last = ""; });
    };
    const schedule = () => { if (timer === undefined) timer = window.setTimeout(flush, SEND_DELAY_MS); };
    const stores = [useTerminalStore, useSettingsStore, useAgentAttention, useTeammateNeeds, usePhoneStore, useNotificationStore];
    const offs = stores.map((store) => (store as { subscribe: (fn: () => void) => () => void }).subscribe(schedule));
    const ageing = window.setInterval(schedule, AGE_CHECK_MS);
    const clicks = listen<string>("menu-bar:open", ({ payload }) => open(payload));
    schedule();
    return () => {
      offs.forEach((off) => off());
      window.clearInterval(ageing);
      window.clearTimeout(timer);
      void clicks.then((off) => off());
    };
  }, []);
}
