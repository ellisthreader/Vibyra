import type { PaneState } from "../state/terminalStoreTypes";

/** What a pane is called wherever it is listed: the rail here, and the Projects
 * page on a phone watching this Mac. One rule, so the two never disagree about
 * a terminal the person renamed. */
export function paneLabel(pane: PaneState): string {
  return pane.customTitle || pane.title;
}
