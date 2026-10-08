import { useEffect } from "react";

import { teammateApi } from "../components/teammates/api";
import { useAccountStore } from "../state/accountStore";
import { useNotificationStore } from "../state/notificationStore";
import { useProductMode } from "../state/productModeStore";
import { useTeammateFocus } from "../state/teammateFocusStore";
import { useTeammateNeeds } from "../state/teammateNeedsStore";
import { newTeammateAlerts, settledTeammateKeys, teammateNeeds, type InboxItem } from "./teammateRunNotifications";
import { windowIsFocused } from "./windowFocus";

const POLL_MS = 20_000;
/** Inbox off on the server (503) or unreachable: back off, do not hammer. */
const IDLE_MS = 5 * 60_000;

/** The teammate thread the person is looking at right now, if any. */
function watching(): string | null {
  if (!windowIsFocused() || useProductMode.getState().mode !== "agent") return null;
  return useTeammateFocus.getState().visible;
}

/**
 * Raises Mac notifications for Agent V2 teammate runs (finished, needs
 * approval, needs sign-in, failed) from the account inbox. Read-only: it never
 * marks inbox items read, so the iPhone's copy of the alert is not lost.
 */
export function useTeammateRunNotifications(): void {
  const identity = useAccountStore((s) => s.snapshot.profile?.email ?? null);
  useEffect(() => {
    const state = useNotificationStore.getState();
    const foreign = state.history.filter(item => ['openTeammate','openAgentDigest'].includes(item.action?.id??'') && item.action?.account !== identity);
    for (const item of foreign) state.dismiss(item.id);
    if (foreign.length) {
      const ids = new Set(foreign.map(item => item.id));
      const history = state.history.filter(item => !ids.has(item.id));
      useNotificationStore.setState({ history, unread: history.filter(item => !item.read).length });
    }
    if (!identity) return;
    let alive = true;
    let timer: number | undefined;
    const context = { seen: new Set<string>(), baseline: true, watching: null as string | null, account: identity };
    const poll = async () => {
      let next = POLL_MS;
      try {
        const data = await teammateApi<{ items?: InboxItem[] }>("notifications/v1/inbox");
        if (!alive) return;
        context.watching = watching();
        const notifications = useNotificationStore.getState(), settled = settledTeammateKeys(data.items ?? []);
        for (const item of notifications.visible) if (item.dedupeKey && settled.has(item.dedupeKey)) notifications.dismiss(item.id);
        const push = notifications.push;
        for (const input of newTeammateAlerts(data.items ?? [], context)) push(input);
        context.baseline = false;
        useTeammateNeeds.getState().set(teammateNeeds(data.items ?? []));
      } catch {
        next = IDLE_MS;
        // Unknown is not "still waiting": Needs you shows nothing it cannot vouch for.
        if (alive) useTeammateNeeds.getState().set([]);
      }
      if (alive) timer = window.setTimeout(() => void poll(), next);
    };
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      useTeammateNeeds.getState().set([]);
    };
  }, [identity]);
}
