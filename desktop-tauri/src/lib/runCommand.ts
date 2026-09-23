import { writeTerminal } from "../ipc/terminal";
import { useNotificationStore } from "../state/notificationStore";
import { useRunConfirmStore } from "../state/runConfirmStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import type { PaneState } from "../state/terminalStoreTypes";
import { homeRelative } from "./homeRelative";
import { paneLabel } from "./paneLabel";
import { classifyDanger } from "./runnableCommand";
import { openProjectShell } from "./runShell";

// Running a command a model wrote. Modelled on the dictation path in
// `voiceStore.ts`, which already does the legwork: resolve a pane, refuse one
// that is not running, write `text\r`, then confirm.

/**
 * Run may only ever write into a plain terminal. Typing `rm -rf build` into a
 * running Claude or Codex REPL does not run it — it hands the line to a model
 * as a prompt, which is both useless and the easiest thing to get wrong here.
 */
const PLAIN_TERMINALS = new Set(["shell", "ssh"]);

/** The focused plain pane of this project, else its most recently focused one. */
function runTarget(projectId: string): PaneState | null {
  const { panes, focusedId } = useTerminalStore.getState();
  const open = panes.filter(
    (pane) =>
      pane.projectId === projectId && pane.status === "running" && PLAIN_TERMINALS.has(pane.agentId),
  );
  return (
    open.find((pane) => pane.id === focusedId) ??
    open.reduce<PaneState | null>(
      (best, pane) => (best && best.lastFocusedAt >= pane.lastFocusedAt ? best : pane),
      null,
    )
  );
}

/** "In Studio · ~/Projects/Studio · Terminal 2", for the confirm sheet. */
function runDestination(projectId: string): string {
  const project = useSettingsStore.getState().settings?.projects.find((p) => p.id === projectId);
  const pane = runTarget(projectId);
  return [
    `In ${project?.name ?? "this project"}`,
    project ? homeRelative(project.root) : "",
    pane ? paneLabel(pane) : "a new terminal",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The one entry point for a Run button. Confirms first when the command earns
 * it, then writes. Resolves false only when the click produced no visible
 * account of itself, so the button can say so; every other failure notifies.
 */
export function requestRun(lines: string[], projectId: string): Promise<boolean> {
  const root = useSettingsStore.getState().settings?.projects.find((p) => p.id === projectId)?.root;
  const verdict = classifyDanger(lines.join("\n"), root);
  if (!verdict.confirm) return writeRun(lines, projectId);
  const store = useRunConfirmStore.getState();
  return new Promise<boolean>((resolve) => {
    store.request({
      lines,
      reasons: verdict.reasons,
      destination: runDestination(projectId),
      confirm: () => {
        store.clear();
        resolve(writeRun(lines, projectId));
      },
      cancel: () => {
        store.clear();
        resolve(true);
      },
    });
  });
}

async function writeRun(lines: string[], projectId: string): Promise<boolean> {
  const target = runTarget(projectId);
  let paneId = target?.id ?? null;
  if (target) {
    if (target.visibility === "hibernated") await useTerminalStore.getState().wake(target.id);
  } else {
    const launch = await openProjectShell(projectId);
    if (!launch.ok) {
      if (launch.reason === "no-shell") {
        notify("Vibyra could not find a shell to run this in", "Add one in Settings › Agents.");
      }
      // A refused spawn already reached the workspace error banner. Saying it
      // again here would be two voices for one click.
      return false;
    }
    paneId = launch.paneId;
  }
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === paneId);
  if (!pane || pane.status !== "running") {
    notify("That terminal is no longer running", "Open a terminal in this project and try again.");
    return true;
  }
  try {
    await writeTerminal(pane.id, `${lines.join("\r")}\r`);
  } catch (error) {
    notify("That command could not be sent to the terminal", String(error));
    return true;
  }
  // No success toast on purpose: focus moves to the terminal, so the command
  // and everything it prints are already on screen.
  useTerminalStore.getState().setFocus(pane.id);
  return true;
}

function notify(title: string, body: string): void {
  useNotificationStore.getState().push({
    category: "system",
    severity: "warning",
    title,
    body,
    // The window is in front — the person just clicked Run in it.
    osEligible: false,
  });
}
