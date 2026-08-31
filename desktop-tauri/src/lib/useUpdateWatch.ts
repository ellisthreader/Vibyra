import { useEffect } from "react";

import { useUpdateStore } from "../state/updateStore";

/** Long enough that a quiet week costs ~500 requests, short enough that a
 * release reaches an already-open window the same session it ships. The
 * updater plugin answers 204 when nothing is new, so a miss is one small
 * round trip. */
const POLL_INTERVAL_MS = 20 * 60 * 1000;
/** Legacy fallback for a workspace reached without a startup preflight. */
const FIRST_CHECK_DELAY_MS = 8_000;

/**
 * Keeps an open workspace aware of later releases. The startup gate normally
 * owns the first check; the delayed check remains only as a defensive fallback
 * for a host that mounts the workspace without running that gate.
 */
export function useUpdateWatch(): void {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const run = (): void => {
      void useUpdateStore.getState().check();
    };
    const first = useUpdateStore.getState().checkState === "idle"
      ? setTimeout(run, FIRST_CHECK_DELAY_MS)
      : null;
    const timer = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      if (first) clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
}
