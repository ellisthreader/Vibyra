import { useEffect } from "react";

import {
  FIRST_CHECK_DELAY_MS,
  POLL_INTERVAL_MS,
  shouldCheck,
  type WatchTrigger,
} from "./updateSchedule";
import { useUpdateStore } from "../state/updateStore";

/**
 * Keeps the running app aware of published releases without a restart.
 *
 * Two layers. A five-minute interval is the floor — a release reaches an
 * already-open window within minutes of going live. On top of that, three
 * events mean "this machine just rejoined the world" and each triggers an
 * immediate look: the window regaining focus, the webview becoming visible
 * again, and the OS reporting the network came back. A lid closed over a
 * weekend therefore finds the update on the way up, not five minutes later.
 *
 * Every event path runs through `shouldCheck`, because a lid opening on a new
 * network fires all three at once. Failures are swallowed by the store — a
 * missed tick is simply retried on the next one.
 */
export function useUpdateWatch(): void {
  useEffect(() => {
    const run = (trigger: WatchTrigger): void => {
      const store = useUpdateStore.getState();
      if (!shouldCheck(trigger, store.lastCheckedAt, Date.now())) return;
      void store.check();
    };

    const first = window.setTimeout(() => run("start"), FIRST_CHECK_DELAY_MS);
    const timer = window.setInterval(() => run("interval"), POLL_INTERVAL_MS);
    const onFocus = (): void => run("wake");
    const onOnline = (): void => run("online");
    const onVisible = (): void => {
      if (document.visibilityState === "visible") run("wake");
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
