import { writeTerminal } from "../../ipc/terminal";
import { notePromptInput } from "../../lib/terminalChatTitleSource";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { SendIcon } from "../common/Icons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// `!` mode: type a message, pick who gets it.
//
// The same path dictation already uses — straight to the PTY, with the text
// noted first so the pane can title itself from what was asked rather than
// from whatever the agent echoes back.

function send(pane: PaneState, text: string): void {
  const submitted = `${text}\r`;
  notePromptInput(pane.id, submitted);
  void writeTerminal(pane.id, submitted).catch(() => {});
}

/** Running agents in the project on screen, the focused one first. */
function targets(activeProjectId: string | null): PaneState[] {
  const { panes, focusedId } = useTerminalStore.getState();
  const running = panes.filter(
    (pane) => pane.projectId === activeProjectId && pane.status === "running",
  );
  return running.sort((left, right) => Number(right.id === focusedId) - Number(left.id === focusedId));
}

/**
 * One row per agent that could take the message, plus a broadcast.
 *
 * Empty text returns nothing on purpose: the palette shows the scope's own
 * prompt instead, which reads better than a row that does nothing when run.
 */
export function askEntries(activeProjectId: string | null, text: string): CommandPaletteEntry[] {
  const panes = targets(activeProjectId);
  if (!text || panes.length === 0) return [];
  const { setFocus } = useTerminalStore.getState();

  const entries: CommandPaletteEntry[] = panes.map((pane, index) => ({
    id: `ask-${pane.id}`,
    kind: "command",
    group: "Send",
    label: `Send to ${paneLabel(pane)}`,
    hint: index === 0 ? "focused" : undefined,
    detail: text,
    accent: pane.accent,
    icon: SendIcon,
    weight: 100 - index,
    run: () => {
      send(pane, text);
      setFocus(pane.id);
    },
  }));

  if (panes.length > 1) {
    entries.push({
      id: "ask-all",
      kind: "command",
      group: "Send",
      label: `Send to all ${panes.length} agents`,
      detail: text,
      icon: SendIcon,
      keywords: "broadcast everyone every agent",
      run: () => {
        for (const pane of panes) send(pane, text);
        setFocus(panes[0].id);
      },
    });
  }
  return entries;
}
