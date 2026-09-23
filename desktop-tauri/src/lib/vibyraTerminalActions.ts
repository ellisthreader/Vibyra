import { chatRequest, type ConversationSnapshot } from "../ipc/sharedChats";
import { writeTerminal } from "../ipc/terminal";
import { answerRequest, sendPrompt } from "../components/sharedChats/delivery";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { allTerminals, projectName, resolveTerminal, terminalName, type VibyraTerminal } from "./vibyraSessions";
import { fail, resolveProject, text, type ToolResult } from "./vibyraToolShared";

// Doing things to terminals that are already open, each through the store
// method the pane's own header button calls: close, type into, focus, full
// screen, rename, restart. A terminal in another project is brought into view
// first, the way the command palette does it.

const label = (terminal: VibyraTerminal) => `"${terminal.ref}" (${terminalName(terminal)} in ${projectName(terminal.projectId)})`;

async function show(terminal: VibyraTerminal): Promise<void> {
  if (useProjectStore.getState().activeId !== terminal.projectId || useProjectStore.getState().view !== "project") {
    await useProjectStore.getState().activate(terminal.projectId);
  }
}

async function closeOne(terminal: VibyraTerminal): Promise<void> {
  if (terminal.kind === "pane") return useTerminalStore.getState().close(terminal.pane.id);
  if (terminal.session.status === "running") await chatRequest("session.stop", { sessionId: terminal.session.id });
  const chats = useConversationTerminals.getState();
  chats.dismiss(terminal.session.id);
  await chats.refresh();
}

/** One, every one of an agent, or every one in a project. With nothing named
 * it refuses: closing everything is never what an empty call meant. */
export async function closeTerminals(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  if (args.terminal !== undefined && args.terminal !== null && args.terminal !== "") {
    const terminal = resolveTerminal(args.terminal, request);
    if (typeof terminal === "string") return fail(terminal);
    await closeOne(terminal);
    return { summary: `Closed ${terminalName(terminal)} "${terminal.ref}"`, detail: `Closed terminal ${label(terminal)}.` };
  }
  const wantedProject = text(args.project);
  const agent = text(args.agent).toLowerCase();
  if (!wantedProject && !agent && args.all !== true) return fail("Say which terminal to close, or pass all for every one in the open project.");
  const project = resolveProject(wantedProject);
  if (!project) return fail(wantedProject ? `There is no project called "${wantedProject}".` : "No project is open.");
  const targets = allTerminals().filter((terminal) => terminal.projectId === project.id && (!agent || terminal.agentId === agent));
  if (!targets.length) return fail(`No ${agent ? `${agent} ` : ""}terminals are open in ${project.name}, so nothing was closed.`);
  for (const terminal of targets) await closeOne(terminal);
  const noun = `terminal${targets.length === 1 ? "" : "s"}`;
  return { summary: `Closed ${targets.length} ${noun} in ${project.name}`, detail: `Closed ${targets.map(label).join(", ")}.` };
}

const PANE_KEYS: Record<string, (agentId: string) => string> = {
  enter: () => "\r",
  escape: () => "\x1b",
  interrupt: (agentId) => (agentId === "shell" || agentId === "ssh" ? "\x03" : "\x1b"),
  yes: (agentId) => (agentId === "shell" || agentId === "ssh" ? "y\r" : "1"),
  no: (agentId) => (agentId === "shell" || agentId === "ssh" ? "n\r" : "\x1b"),
  up: () => "\x1b[A",
  down: () => "\x1b[B",
  tab: () => "\t",
};

async function keyToChat(terminal: Extract<VibyraTerminal, { kind: "chat" }>, key: string): Promise<string | null> {
  const sessionId = terminal.session.id;
  const snapshot = await chatRequest<ConversationSnapshot>("conversation.snapshot", { sessionId });
  if (key === "interrupt" || key === "escape") {
    if (!snapshot.turnId) return "It is not working on anything, so there is nothing to interrupt.";
    await chatRequest("turn.interrupt", { sessionId, turnId: snapshot.turnId });
    return null;
  }
  if (key === "yes" || key === "no") {
    const waiting = [...(snapshot.pending ?? []), ...snapshot.items].find((item) => item.kind === "permission" && item.status === "pending");
    if (!waiting) return "It is not asking for permission right now.";
    await answerRequest(sessionId, waiting, { decision: key === "yes" ? "accept" : "decline" });
    return null;
  }
  return `A ${terminal.agentId} conversation takes a message, yes, no or interrupt — not "${key}".`;
}

/** A message for the agent, a line for a shell, or one key: interrupting,
 * answering a permission prompt, moving through a menu. */
export async function sendToTerminal(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  // A key name sent as text ("interrupt") was meant as the key, not typed.
  const typed = text(args.text);
  const asKey = !text(args.key) && PANE_KEYS[typed.toLowerCase()] ? typed.toLowerCase() : "";
  const message = asKey ? "" : typed;
  const key = asKey || text(args.key).toLowerCase();
  if (!message && !key) return fail("There was nothing to send.");
  if (terminal.kind === "pane" && terminal.pane.status !== "running") return fail(`Terminal ${label(terminal)} is not running. Restart it first.`);
  if (key && !PANE_KEYS[key]) return fail(`"${key}" is not a key Vibyra can press. Use ${Object.keys(PANE_KEYS).join(", ")}.`);
  if (terminal.kind === "chat") {
    if (key) {
      const refused = await keyToChat(terminal, key);
      if (refused) return fail(refused);
    }
    if (message) await sendPrompt(terminal.session.id, message);
  } else {
    if (key) await writeTerminal(terminal.pane.id, PANE_KEYS[key](terminal.agentId));
    if (message) await writeTerminal(terminal.pane.id, `${message}\r`);
  }
  const what = [key ? `pressed ${key}` : "", message ? `sent "${message}"` : ""].filter(Boolean).join(" and ");
  return { summary: `Sent to ${terminalName(terminal)} "${terminal.ref}"`, detail: `In terminal ${label(terminal)}: ${what}.` };
}

export async function focusTerminal(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  await show(terminal);
  if (terminal.kind === "pane") useTerminalStore.getState().setFocus(terminal.pane.id);
  else useConversationTerminals.getState().reveal(terminal.session.id);
  return { summary: `Focused ${terminalName(terminal)} "${terminal.ref}"`, detail: `Terminal ${label(terminal)} is in front with the keyboard.` };
}

/** Full screen is the pane's own maximise: the rest of the grid steps aside.
 * Idempotent, unlike the header's toggle — "full screen it, it didn't work"
 * must not be the call that takes it back out. */
export async function fullscreenTerminal(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const terminals = useTerminalStore.getState();
  const chats = useConversationTerminals.getState();
  if (args.on === false) {
    const zoomed = terminals.zoomedId ?? chats.zoomed;
    if (zoomed === null) return { summary: "Nothing was full screen", detail: "No terminal was full screen." };
    if (terminals.zoomedId !== null) terminals.toggleZoom(terminals.zoomedId);
    if (chats.zoomed !== null) useConversationTerminals.setState({ zoomed: null });
    return { summary: "Left full screen", detail: "Every terminal is back in the grid." };
  }
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  await show(terminal);
  if (terminal.kind === "pane") {
    if (terminal.pane.status === "running" && terminal.pane.visibility === "hibernated") await terminals.wake(terminal.pane.id);
    if (useTerminalStore.getState().zoomedId !== terminal.pane.id) useTerminalStore.getState().toggleZoom(terminal.pane.id);
    useConversationTerminals.setState({ zoomed: null });
    useTerminalStore.getState().setFocus(terminal.pane.id);
  } else if (useConversationTerminals.getState().zoomed !== terminal.session.id) {
    useConversationTerminals.getState().toggleZoom(terminal.session.id);
  }
  return { summary: `Made ${terminalName(terminal)} "${terminal.ref}" full screen`, detail: `Terminal ${label(terminal)} now fills the workspace.` };
}

export function renameTerminal(args: Record<string, unknown>, request = ""): ToolResult {
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  const title = text(args.title);
  if (!title) return fail("Say what to call it.");
  if (terminal.kind === "chat") return fail(`${terminalName(terminal)} "${terminal.ref}" is a conversation; its name comes from its task and cannot be changed here.`);
  useTerminalStore.getState().rename(terminal.pane.id, title);
  return { summary: `Renamed "${terminal.ref}" to ${title}`, detail: `Terminal "${terminal.ref}" is now called "${title}".` };
}

/** A finished terminal starts again; a saved one from an earlier run resumes
 * its conversation — the buttons the pane itself shows in those states. */
export async function restartTerminal(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  if (terminal.kind === "chat") return fail(`${terminalName(terminal)} "${terminal.ref}" is a conversation. Open a new Codex terminal instead.`);
  const store = useTerminalStore.getState();
  if (terminal.pane.status === "suspended") await store.resume(terminal.pane.id);
  else await store.restart(terminal.pane.id);
  return { summary: `Restarted ${terminalName(terminal)} "${terminal.ref}"`, detail: `Terminal ${label(terminal)} was ${terminal.pane.status === "suspended" ? "resumed" : "restarted"}.` };
}
