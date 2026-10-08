import { useEffect } from "react";

/** Server-owned settings catch up after another device changes them. */
export function useSettingsRefresh(refresh: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const read = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    const timer = window.setInterval(read, 15_000);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
      window.clearInterval(timer);
    };
  }, [refresh, enabled]);
}
