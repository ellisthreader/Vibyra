import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { allTerminals, describeTerminal, projectName, type VibyraTerminal } from "./vibyraSessions";
import { screenText } from "./vibyraTerminalText";
import { projects } from "./vibyraToolShared";

// What is on screen right now, in a few lines, for the system prompt. With it
// "what is this claude terminal doing?" is one read of terminal "1", and "the
// dev server" is the shell whose last line says `next dev`; without it a small
// model lists the terminals and stops there.

/** Clamped so a workspace with thirty terminals cannot crowd the brief out. */
const MAX_STATE_CHARS = 1_600;
const MAX_LISTED = 8;

async function lastLine(terminal: VibyraTerminal): Promise<string> {
  const screen = await screenText(terminal, 3).catch(() => "");
  const line = screen.split("\n").map((entry) => entry.trim()).filter(Boolean).at(-1) ?? "";
  return line ? `\n    last on screen: ${line.slice(0, 90)}` : "";
}

function waiting(terminal: VibyraTerminal): boolean {
  return terminal.kind === "pane" && terminal.pane.status === "running" && useTerminalStore.getState().activity[terminal.pane.id] === "attention";
}

export async function workspaceState(): Promise<string> {
  const { activeId, view } = useProjectStore.getState();
  const workspace = useWorkspaceStore.getState();
  const all = projects();
  const open = all.find((project) => project.id === activeId);
  const where = view === "project" && open
    ? `Open project: ${open.name}.`
    : view === "new-project" ? "On the new project page." : "On the home page; no project is open.";
  const others = all.filter((project) => project !== open).map((project) => project.name);
  const panel = workspace.companionOpen
    ? `This chat is in the right-hand side panel (${workspace.companionTab} tab, ${workspace.companionSize}).`
    : "The side panel is closed.";
  const settings = workspace.settingsOpen ? ` Settings is open on ${workspace.settingsSection}.` : "";
  // Only the open project's terminals carry ids. "The claude terminal" means
  // the one here; when another project's Claude had an id too — and was the
  // one waiting — a model picked it for "full screen the claude terminal".
  // Elsewhere a terminal is named "claude in HKE", which the resolver settles.
  const every = allTerminals();
  const isHere = (terminal: VibyraTerminal) => view === "project" && terminal.projectId === activeId;
  const terminals = [...every.filter(isHere), ...every.filter((terminal) => !isHere(terminal))];
  const handle = (terminal: VibyraTerminal) => {
    if (isHere(terminal)) return `"${terminal.ref}"`;
    const phrase = `${terminal.agentId} in ${projectName(terminal.projectId)}`;
    const unique = every.filter((other) => other.agentId === terminal.agentId && other.projectId === terminal.projectId).length === 1;
    return `"${unique ? phrase : terminal.ref}"`;
  };
  const shown = terminals.slice(0, MAX_LISTED);
  const described = await Promise.all(shown.map(async (terminal) => `- ${describeTerminal(terminal, handle(terminal))}${await lastLine(terminal)}`));
  const here = shown.filter(isHere).length;
  const lines = [
    ...(here ? [`In ${open?.name} (the open project):`, ...described.slice(0, here)] : []),
    ...(described.length > here ? [here ? "In other projects:" : "In projects:", ...described.slice(here)] : []),
  ];
  if (terminals.length > MAX_LISTED) lines.push(`- …and ${terminals.length - MAX_LISTED} more (list_terminals shows all)`);
  const needs = terminals.filter(waiting).map(handle);
  const text = [
    "Vibyra right now:",
    `${where}${others.length ? ` Other projects: ${others.join(", ")}.` : ""}`,
    `${panel}${settings}`,
    terminals.length ? "Terminals — what is in quotes is what tools take:" : "No terminals are open.",
    ...lines,
    needs.length ? `Waiting for the person to answer: terminal ${needs.join(", ")}.` : "No terminal is waiting for the person.",
  ].join("\n");
  return text.length <= MAX_STATE_CHARS ? text : `${text.slice(0, MAX_STATE_CHARS - 2)}…`;
}
