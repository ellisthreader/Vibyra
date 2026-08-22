import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

// "Is the user actually looking at Vibyra?" — the gate for escalating a
// notification to the operating system, and for staying quiet about lag nobody
// can see. Kept as a module-level cache so the hot path is a boolean read
// rather than an await on an IPC round trip.

let focused = true;

/** Minimising clears focus on both GTK and Windows, so tracking focus alone is
 * enough; `visibilitychange` covers the webview being backgrounded. */
export function windowIsFocused(): boolean {
  return focused && !document.hidden;
}

function setFocused(next: boolean): void {
  focused = next;
}

export async function startFocusTracking(onChange?: (focused: boolean) => void): Promise<UnlistenFn> {
  const window = getCurrentWindow();
  focused = await window.isFocused().catch(() => true);
  const onVisibility = () => onChange?.(windowIsFocused());
  document.addEventListener("visibilitychange", onVisibility);
  const unlisten = await window.onFocusChanged(({ payload }) => {
    setFocused(payload);
    onChange?.(windowIsFocused());
  });
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    unlisten();
  };
}
