import type { AppMode } from "../agentTypes";
import { terminalsVisible, type DockSize } from "./dockLayout.ts";

/**
 * Whether the terminal grid is actually on screen.
 *
 * There are two independent ways for it not to be, and the native flush budget
 * follows both: a full-size dock covering the grid, and another mode holding
 * the window. `terminalsVisible` answers only the first.
 *
 * Asking only the dock's half is what let Agent and Chat Mode run every pane at
 * its full delivery rate — up to the 16 ms tick for whichever pane last held
 * the keyboard — behind a `display: none`, writing into canvases nobody could
 * see for as long as the user stayed out of Code Mode.
 *
 * Everything that asserts native visibility must ask this rather than the dock
 * rule on its own. Off screen means `hidden`, which
 * `nativeTerminalVisibility` turns into native hibernation: no delivery at
 * all, and one authoritative resync on the way back.
 */
export function terminalsOnScreen(mode: AppMode, size: DockSize, dockOpen: boolean): boolean {
  return mode === "code" && terminalsVisible(size, dockOpen);
}
