import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useProjectStore } from "../state/projectStore";
import { useTerminalStore, type PaneState } from "../state/terminalStore";
import type { SharedSession } from "../ipc/sharedChats";
import { paneLabel } from "./paneLabel";
import { projects } from "./vibyraToolShared";

// Every terminal on screen, whichever kind it is. A Claude or shell pane is a
// PTY in `terminalStore`; a Codex terminal is a conversation session in
// `conversationTerminalStore`. A person sees one grid of terminals, so the
// assistant is given one list — before this it could not see Codex at all.

export type VibyraTerminal =
  | { kind: "pane"; ref: string; agentId: string; projectId: string; pane: PaneState }
  | { kind: "chat"; ref: string; agentId: string; projectId: string; session: SharedSession };

const AGENT_NAMES: Record<string, string> = { codex: "Codex", claude: "Claude Code", gemini: "Gemini", shell: "Terminal" };

/** The conversation engine names a session with a UUID; its first eight
 * characters are what the model is given, and all it has to repeat. */
const chatRef = (id: string) => (id.length > 12 ? id.slice(0, 8) : id);

/** Open panes first, then the conversation cards the grid is showing. */
export function allTerminals(): VibyraTerminal[] {
  const panes = useTerminalStore.getState().panes.map((pane): VibyraTerminal => ({
    kind: "pane", ref: String(pane.id), agentId: pane.agentId, projectId: pane.projectId, pane,
  }));
  const chats = useConversationTerminals.getState();
  const open = new Set(chats.open);
  const cards = chats.sessions
    .filter((session) => open.has(session.id) && !chats.dismissed.includes(session.id))
    .map((session): VibyraTerminal => ({
      kind: "chat", ref: chatRef(session.id), agentId: session.kind ?? "codex", projectId: session.projectId, session,
    }));
  return [...panes, ...cards];
}

export function projectName(id: string): string {
  return projects().find((project) => project.id === id)?.name ?? "unknown project";
}

export function terminalName(terminal: VibyraTerminal): string {
  return terminal.kind === "pane" ? paneLabel(terminal.pane) : terminal.session.title || AGENT_NAMES[terminal.agentId] || terminal.agentId;
}

function state(terminal: VibyraTerminal): string {
  if (terminal.kind === "chat") return terminal.session.status === "running" ? "running" : "finished";
  const { pane } = terminal;
  if (pane.status !== "running") return pane.status === "exited" ? "finished" : "suspended (saved from an earlier run)";
  const activity = useTerminalStore.getState().activity[pane.id];
  return activity === "attention" ? "WAITING FOR THE PERSON" : activity ?? "idle";
}

/** One line per terminal: everything needed to pick it out or talk about it. */
export function describeTerminal(terminal: VibyraTerminal, handle = `"${terminal.ref}"`): string {
  const terminals = useTerminalStore.getState();
  const chats = useConversationTerminals.getState();
  const model = terminal.kind === "pane" && terminal.pane.model ? ` · ${terminal.pane.model}` : "";
  const zoomed = terminal.kind === "pane" ? terminals.zoomedId === terminal.pane.id : chats.zoomed === terminal.session.id;
  const focused = terminal.kind === "pane" ? terminals.focusedId === terminal.pane.id : chats.focused === terminal.session.id;
  const flags = [zoomed ? "full screen" : "", focused && !zoomed ? "focused" : ""].filter(Boolean).join(", ");
  return `terminal ${handle}: ${terminalName(terminal)} (${terminal.agentId}${model}) in ${projectName(terminal.projectId)} · ${state(terminal)}${flags ? ` · ${flags}` : ""}`;
}

/**
 * What the model called a terminal — `4`, `"#4"`, `"chat-1"`, `"claude"`,
 * `"the codex one"` — as one terminal, or the sentence saying why not. Loose
 * on purpose: a person says "full screen the codex terminal", and making the
 * model look an id up first is one more step for it to get wrong. Ambiguity is
 * refused rather than guessed, preferring the open project when that settles it.
 */
export function resolveTerminal(value: unknown, request = ""): VibyraTerminal | string {
  const found = resolveAny(value);
  return typeof found === "string" ? found : preferOpenProject(found, request);
}

/**
 * "The claude terminal", with no other project named, is the open project's
 * Claude — whatever id the model picked. A model once read another project's
 * Claude for "what is this claude terminal doing?" because that one was
 * waiting and caught its eye. The person's words decide, not the model's pick.
 */
function preferOpenProject(terminal: VibyraTerminal, request: string): VibyraTerminal {
  const { activeId, view } = useProjectStore.getState();
  const said = request.toLowerCase();
  if (!said || view !== "project" || terminal.projectId === activeId || !said.includes(terminal.agentId)) return terminal;
  if (said.includes(projectName(terminal.projectId).toLowerCase())) return terminal;
  const here = allTerminals().filter((other) => other.projectId === activeId && other.agentId === terminal.agentId);
  return here.length === 1 ? here[0] : terminal;
}

function resolveAny(value: unknown): VibyraTerminal | string {
  const all = allTerminals();
  const said = String(value ?? "").trim().toLowerCase().replace(/^#/, "").replace(/^terminal\s*/, "");
  if (!said) return "Say which terminal.";
  const exact = all.find((terminal) => terminal.ref.toLowerCase() === said);
  if (exact) return exact;
  const prefixed = all.filter((terminal) => terminal.kind === "chat" && said.length >= 4 &&
    (terminal.session.id.toLowerCase().startsWith(said) || said.startsWith(terminal.ref.toLowerCase())));
  if (prefixed.length === 1) return prefixed[0];
  const words = said.replace(/\b(the|one|terminal|pane|session|agent|in|this|that)\b/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return `There is no terminal "${String(value)}".`;
  const matches = all.filter((terminal) => {
    const haystack = `${terminal.agentId} ${terminalName(terminal)} ${projectName(terminal.projectId)} ${
      terminal.kind === "pane" ? `${terminal.pane.model ?? ""} ${terminal.pane.osc ?? ""}` : ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  if (matches.length === 1) return matches[0];
  const active = useProjectStore.getState().activeId;
  const here = matches.filter((terminal) => terminal.projectId === active);
  if (here.length === 1) return here[0];
  if (!matches.length) return `There is no terminal "${String(value)}". Open ones: ${all.map((t) => `"${t.ref}" ${terminalName(t)}`).join(", ") || "none"}.`;
  return `"${String(value)}" could be ${matches.map((t) => `"${t.ref}" (${terminalName(t)} in ${projectName(t.projectId)})`).join(" or ")}. Say which.`;
}
