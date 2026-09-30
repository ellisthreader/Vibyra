import { useEffect } from "react";

import { usePhoneStore } from "../state/phoneStore";

/** A phone waits 85 seconds for an answer, so the request has to reach the
 * screen in a couple of them. Polling only runs while the connection is on;
 * switched off, nothing can be pending and the loop stops entirely. */
const POLL_INTERVAL_MS = 2_000;

/**
 * Keeps the workspace aware of pairing requests and of the listener following
 * this Mac between networks, so approving a phone never depends on someone
 * having Settings open.
 */
export function usePhoneWatch(): void {
  const enabled = usePhoneStore((state) => state.status?.enabled ?? false);
  useEffect(() => {
    void usePhoneStore.getState().refresh();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      void usePhoneStore.getState().refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
