import { terminalTitleHints } from "../ipc/terminal";
import { useTerminalStore } from "../state/terminalStore";
import { changedTitles, titleRequests, trackStandIns } from "./paneTitlePlan";

const QUICK_MS = 3_000;
const SLOW_MS = 15_000;
/** How long a stand-in is checked quickly for the agent's own name. */
const STAND_IN_WATCH_MS = 60_000;

/**
 * Names panes after their work. The quick pass is silent unless a running agent
 * pane has no name yet, or wears a stand-in its agent is about to replace; the
 * slow pass re-reads the agents' own titles, which are read from files they
 * already wrote, so nothing is sent anywhere.
 */
export function startPaneTitles(): () => void {
  let busy = false;
  const awaiting = new Map<number, number>();
  const refresh = async (scope: "unnamed" | "all") => {
    if (busy) return;
    const now = Date.now();
    for (const [id, until] of awaiting) if (until <= now) awaiting.delete(id);
    const requests = titleRequests(useTerminalStore.getState().panes, scope, new Set(awaiting.keys()));
    if (requests.length === 0) return;
    busy = true;
    try {
      const hints = await terminalTitleHints(requests);
      const panes = useTerminalStore.getState().panes;
      const titles = changedTitles(panes, hints);
      trackStandIns(awaiting, panes, hints, titles, now + STAND_IN_WATCH_MS);
      if (Object.keys(titles).length > 0) useTerminalStore.getState().setAutoTitles(titles);
    } catch {
      // Naming is a courtesy: a failed read leaves the names as they were.
    } finally {
      busy = false;
    }
  };
  const quick = setInterval(() => void refresh("unnamed"), QUICK_MS);
  const slow = setInterval(() => void refresh("all"), SLOW_MS);
  return () => { clearInterval(quick); clearInterval(slow); };
}
