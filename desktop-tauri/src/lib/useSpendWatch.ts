import { useEffect } from "react";

import { useAiServiceStore } from "../state/aiServiceStore";

/** Keeps the spend warnings alive now that no settings page polls for them.
 *
 * The caps are no longer the user's to raise, which makes being told they are
 * close to one *more* important, not less: it is the only warning left before
 * chat and dictation simply stop answering. `refresh` is what runs the tier
 * check, so something always mounted has to call it.
 *
 * A minute, not the five seconds the old settings pane used: nothing here is
 * on screen, and only chat and dictation move the number — both of which need
 * this window. A focus check covers coming back to a Mac left alone.
 */
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
