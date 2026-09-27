import { useEffect } from "react";

import { trackDesktopEvent } from "../ipc/analytics";

/** Count bounded, foreground time only while a person has used the window
 * recently. This never reads key content, focused fields, paths or prompts. */
export function useDesktopEngagement(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lastActivity = Date.now();
    let lastTick = Date.now();
    let seconds = 0;
    const flush = () => {
      const rounded = Math.min(60, Math.floor(seconds));
      if (rounded > 0) trackDesktopEvent("desktop_engagement_interval", { seconds: rounded });
      seconds = 0;
    };
    const activity = () => { lastActivity = Date.now(); };
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.min(5, Math.max(0, (now - lastTick) / 1_000));
      lastTick = now;
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        flush();
        return;
      }
      if (now - lastActivity <= 60_000) seconds += elapsed;
      if (seconds >= 30) flush();
    };
    const timer = window.setInterval(tick, 5_000);
    const onHidden = () => { tick(); };
    for (const event of ["pointerdown", "pointermove", "keydown", "wheel"])
      window.addEventListener(event, activity, { passive: true });
    window.addEventListener("blur", onHidden);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearInterval(timer);
      for (const event of ["pointerdown", "pointermove", "keydown", "wheel"])
        window.removeEventListener(event, activity);
      window.removeEventListener("blur", onHidden);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, [enabled]);
}
