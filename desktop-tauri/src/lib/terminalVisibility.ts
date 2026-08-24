import type { Visibility } from "../types";

/**
 * Hidden panes keep their process and ring buffer, but stop native IPC output
 * entirely. Waking from hibernation produces one authoritative resync, which
 * is cheaper and safer than feeding an off-screen xterm every 250 ms.
 *
 * `background` is deliberately passed through: those panes *are* on screen and
 * must keep painting, just at a paced rate rather than every 16 ms tick. See
 * `Visibility` in `src-tauri/crates/vibyra-core/src/pty/mod.rs` for why that
 * pacing is what keeps the focused pane's echo inside a frame.
 */
export function nativeTerminalVisibility(visibility: Visibility): Visibility {
  return visibility === "hidden" ? "hibernated" : visibility;
}
