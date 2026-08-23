import type { Visibility } from "../types";

/**
 * Hidden panes keep their process and ring buffer, but stop native IPC output
 * entirely. Waking from hibernation produces one authoritative resync, which
 * is cheaper and safer than feeding an off-screen xterm every 250 ms.
 */
export function nativeTerminalVisibility(visibility: Visibility): Visibility {
  return visibility === "hidden" ? "hibernated" : visibility;
}
