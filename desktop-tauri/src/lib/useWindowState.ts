import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Native state, including changes made by the window manager or keyboard. */
export function useWindowState() {
  const [state, setState] = useState({ focused: true, maximized: false, fullscreen: false });
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let live = true;
    const releases: (() => void)[] = [];
    const keep = (release: () => void) => { if (live) releases.push(release); else release(); };
    const refresh = async () => {
      try {
        const [focused, maximized, fullscreen] = await Promise.all([
          appWindow.isFocused(), appWindow.isMaximized(), appWindow.isFullscreen(),
        ]);
        if (live && [focused, maximized, fullscreen].every((value) => typeof value === "boolean")) {
          setState({ focused, maximized, fullscreen });
        }
      } catch { /* The native window may already be closing. */ }
    };
    void refresh();
    void appWindow.onResized(() => void refresh()).then(keep).catch(() => {});
    void appWindow.onFocusChanged(({ payload }) => {
      if (live) setState((current) => ({ ...current, focused: payload }));
    }).then(keep).catch(() => {});
    return () => { live = false; releases.forEach((release) => release()); };
  }, []);
  return state;
}
