import { rankPaletteEntries } from "../../lib/paletteRanking";
import type { CommandPaletteEntry, PaletteResult } from "../../lib/paletteTypes";
import { useProjectStore } from "../../state/projectStore";
import { askEntries } from "./paletteAskEntries";
import { attentionEntries } from "./paletteAttentionEntries";
import { launchEntries } from "./paletteLaunchEntries";
import { sessionEntries } from "./paletteSessionEntries";
import { toolEntries } from "./paletteToolEntries";
import { viewEntries } from "./paletteViewEntries";

/**
 * Everything the palette can offer, in reading order.
 *
 * Taken once when the palette opens rather than per keystroke: reading a
 * blocked agent's question means walking its terminal buffer, and doing that
 * on every character typed would make the search feel like the terminal.
 */
export function commandPaletteEntries(): CommandPaletteEntry[] {
  const activeProjectId = useProjectStore.getState().activeId;
  return [
    ...attentionEntries(activeProjectId),
    ...sessionEntries(activeProjectId),
    ...launchEntries(activeProjectId),
    ...viewEntries(),
    ...toolEntries(),
  ];
}

/** Ranking, with `!` mode's rows built against whatever project is on screen. */
export function paletteResults(base: CommandPaletteEntry[], raw: string): PaletteResult {
  return rankPaletteEntries(base, raw, (text) =>
    askEntries(useProjectStore.getState().activeId, text));
}
