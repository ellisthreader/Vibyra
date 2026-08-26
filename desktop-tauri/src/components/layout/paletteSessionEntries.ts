import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { CloseIcon, ExpandIcon, MoonIcon, RestartIcon } from "../common/Icons";
import { PlayIcon } from "../common/StatusIcons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// Every session in the project, and everything you can do to the one you are
// looking at. Before this the palette could take you to a terminal but not act
// on one, which is most of what you actually want from a keyboard.

const STATUS_HINT: Record<PaneState["status"], string> = {
  running: "",
  suspended: "suspended",
  exited: "exited",
};

function subtitle(pane: PaneState): string | undefined {
  const parts = [pane.model, pane.workspaceMode === "safe" ? "safe workspace" : null]
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** One row per session in the project on screen. */
function sessionRows(panes: PaneState[]): CommandPaletteEntry[] {
  const { setFocus, resume } = useTerminalStore.getState();
  return panes.map((pane, index) => {
    const suspended = pane.status !== "running";
    return {
      id: `sess-${pane.id}`,
      kind: "session",
      group: "Sessions",
      label: suspended ? `Resume ${paneLabel(pane)}` : paneLabel(pane),
      hint: suspended ? STATUS_HINT[pane.status] : index < 9 ? `Ctrl ${index + 1}` : undefined,
      detail: subtitle(pane),
      keywords: `${pane.agentId} terminal session ${suspended ? "resume restart continue" : "focus jump"}`,
      accent: pane.accent,
      mono: pane.title.charAt(0).toUpperCase(),
      run: suspended ? () => void resume(pane.id) : () => setFocus(pane.id),
    };
  });
}

/**
 * Lifecycle for the session in front of you.
 *
 * Deliberately scoped to the focused pane rather than offering "restart which
 * one?" — a palette that asks a second question is slower than the rail.
 */
function focusedActions(pane: PaneState): CommandPaletteEntry[] {
  const store = useTerminalStore.getState();
  const name = paneLabel(pane);
  const hibernated = pane.visibility === "hibernated";
  const entries: CommandPaletteEntry[] = [
    {
      id: "sess-restart",
      kind: "command",
      group: "This session",
      label: `Restart ${name}`,
      detail: "Same agent, same settings, fresh process",
      keywords: "relaunch reload reboot again",
      icon: RestartIcon,
      run: () => void store.restart(pane.id),
    },
    {
      id: "sess-zoom",
      kind: "command",
      group: "This session",
      label: store.zoomedId === pane.id ? `Unzoom ${name}` : `Zoom ${name}`,
      keywords: "fullscreen maximise maximize focus grid",
      icon: ExpandIcon,
      run: () => store.toggleZoom(pane.id),
    },
    {
      id: "sess-hibernate",
      kind: "command",
      group: "This session",
      label: hibernated ? `Wake ${name}` : `Hibernate ${name}`,
      detail: hibernated
        ? "Bring its renderer back"
        : "Keeps the process, frees the renderer it is holding",
      keywords: "sleep suspend memory performance idle",
      icon: hibernated ? PlayIcon : MoonIcon,
      run: () => void (hibernated ? store.wake(pane.id) : store.hibernate(pane.id)),
    },
    {
      id: "sess-close",
      kind: "command",
      group: "This session",
      label: `Close ${name}`,
      detail: "Ends the process",
      keywords: "stop kill quit exit terminate end",
      icon: CloseIcon,
      danger: true,
      run: () => void store.close(pane.id),
    },
  ];
  return entries;
}

export function sessionEntries(activeProjectId: string | null): CommandPaletteEntry[] {
  const { panes, focusedId } = useTerminalStore.getState();
  if (!activeProjectId) return [];
  const mine = panes.filter((pane) => pane.projectId === activeProjectId);
  const focused = mine.find((pane) => pane.id === focusedId && pane.status === "running");
  const entries = [...sessionRows(mine)];
  if (focused) entries.push(...focusedActions(focused));
  return entries;
}
