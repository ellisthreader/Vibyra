import { useEffect } from "react";

import { useUpdateStore } from "../state/updateStore";

/** Long enough that a quiet week costs ~500 requests, short enough that a
 * release reaches an already-open window the same session it ships. The
 * updater plugin answers 204 when nothing is new, so a miss is one small
 * round trip. */
const POLL_INTERVAL_MS = 20 * 60 * 1000;
/** The workspace mount races terminal spawn and session restore; letting
 * those settle first keeps the first check off the startup critical path. */
const FIRST_CHECK_DELAY_MS = 8_000;

/**
 * Keeps the running app aware of published releases without a restart: one
 * check shortly after launch, then every 20 minutes for as long as the window
 * is open. Failures are swallowed by the store — a missed tick is retried.
 */
export function useUpdateWatch(): void {
  useEffect(() => {
    const run = (): void => {
      void useUpdateStore.getState().check();
    };
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    const timer = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
}
