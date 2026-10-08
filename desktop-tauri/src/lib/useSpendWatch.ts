import { useEffect } from "react";

import { useAiServiceStore } from "../state/aiServiceStore";

/** Refresh shared assistant availability on focus and once a minute.
 * Token billing and spending limits are owned by the backend wallet. */
export function useSpendWatch(): void {
  useEffect(() => {
    const refresh = () => void useAiServiceStore.getState().refresh();
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
}
