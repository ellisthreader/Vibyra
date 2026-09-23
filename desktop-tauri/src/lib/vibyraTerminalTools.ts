import { computerName } from "./platform.ts";
import { terminalSnapshot, writeTerminal } from "../ipc/terminal";
import { useAgentStore } from "../state/agentStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useTerminalStore } from "../state/terminalStore";
import { agentForModel, matchModel } from "./modelMatch";
import { paneLabel } from "./paneLabel";
import { count, fail, projects, resolveProject, text, type ToolResult } from "./vibyraToolShared";

// Everything the assistant can do to terminals: open them with a chosen model,
// permission and opening prompt, say what they are doing, read one, talk to
// one, close them. Split from the rest of the app's tools because this is the
// half people actually ask about.

/** A plain terminal runs no model, so naming one alongside it is the model's
 * mistake rather than the person's. */
const PLAIN = new Set(["shell", "ssh"]);

function catalogue() {
  return useModelCatalogStore.getState().groups.flatMap((group) => group.models);
}

async function agents() {
  // The assistant can be asked to launch before the workspace has ever opened
  // the launcher, so the catalogue is read on demand rather than assumed.
  if (!useAgentStore.getState().loaded) await useAgentStore.getState().refresh();
  return useAgentStore.getState().agents;
}

function describePane(pane: { id: number; agentId: string; projectId: string; status: string; model?: string | null }): string {
  const project = projects().find((entry) => entry.id === pane.projectId);
  const activity = useTerminalStore.getState().activity[pane.id];
  const state = pane.status === "running" ? (activity ?? "idle") : pane.status;
  const model = pane.model ? ` · ${pane.model}` : "";
  return `#${pane.id} ${paneLabel(pane as never)} · ${pane.agentId}${model} · ${project?.name ?? "unknown project"} · ${state}`;
}

export async function openTerminals(args: Record<string, unknown>): Promise<ToolResult> {
  const project = resolveProject(text(args.project));
  if (!project) return fail("There is no project open to put terminals in.");

  const askedFor = text(args.model);
  const model = askedFor ? matchModel(askedFor, catalogue()) : null;
  if (askedFor && !model) {
    const examples = catalogue().slice(0, 4).map((entry) => entry.label).join(", ");
    return fail(`No model here is called "${askedFor}". Available models include ${examples}.`);
  }

  // Naming a model names the agent: "three terminals of GPT-6 Astra" never
  // says `codex`, and opening a plain shell instead is the bug this fixes.
  const asked = text(args.agent).toLowerCase();
  const inferred = model ? agentForModel(model) : null;
  const wanted = !asked || (model && PLAIN.has(asked) && inferred) ? (inferred ?? asked) : asked;
  if (!wanted) return fail("Say which agent to run, or which model to run it on.");

  const installed = await agents();
  const agent = installed.find((entry) => entry.id === wanted);
  if (!agent) return fail(`${wanted} is not one of Vibyra's agents.`);
  if (!agent.installed) return fail(`${agent.name} is not installed on this ${computerName}, so it cannot be launched.`);

  const permission = text(args.permission).toLowerCase() === "full" ? "full" : "standard";
  const effort = text(args.effort).toLowerCase();
  const allowed = model?.reasoningEfforts ?? [];
  if (effort && !allowed.includes(effort as never)) {
    return fail(
      allowed.length
        ? `${model?.label ?? "That model"} takes ${allowed.join(", ")}, not "${effort}".`
        : `${model?.label ?? "That model"} does not take a reasoning effort.`,
    );
  }
  const opening = text(args.prompt);

  const total = count(args.count, 1);
  const opened: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const id = await useTerminalStore.getState().spawnAgent(agent, project.id, {
      model: model?.id ?? null,
      permissionMode: permission,
      reasoningEffort: effort || null,
      title: text(args.title) || undefined,
    });
    if (id !== null) opened.push(id);
  }
  if (!opened.length) return fail(`${agent.name} could not be started.`);
  if (opening) await Promise.all(opened.map((id) => writeTerminal(id, `${opening}\r`).catch(() => {})));

  const parts = [
    model ? `on ${model.label}` : "",
    permission === "full" ? "with full permissions" : "",
    effort ? `at ${effort} effort` : "",
  ].filter(Boolean);
  const how = parts.length ? ` ${parts.join(", ")}` : "";
  const plural = opened.length === 1 ? "terminal" : "terminals";
  const sent = opening ? ` Sent them: "${opening}".` : "";
  return {
    summary: `Opened ${opened.length} ${agent.name} ${plural}${how} in ${project.name}`,
    detail: `Opened ${opened.length} ${agent.name} ${plural}${how} in ${project.name}. They are ${opened
      .map((id) => `#${id}`)
      .join(", ")}.${sent}`,
  };
}

export function listTerminals(args: Record<string, unknown>): ToolResult {
  const wanted = text(args.project);
  const project = wanted ? resolveProject(wanted) : null;
  if (wanted && !project) return fail(`There is no project called "${wanted}".`);
  const panes = useTerminalStore
    .getState()
    .panes.filter((pane) => !project || pane.projectId === project.id);
  if (!panes.length) {
    return { summary: "Checked the terminals", detail: "No terminals are open." };
  }
  return {
    summary: `Checked ${panes.length} terminal${panes.length === 1 ? "" : "s"}`,
    detail: panes.map(describePane).join("\n"),
  };
}

export async function readTerminal(args: Record<string, unknown>): Promise<ToolResult> {
  const id = Number(args.terminal);
  const pane = useTerminalStore.getState().panes.find((entry) => entry.id === id);
  if (!pane) return fail(`There is no terminal #${args.terminal}.`);
  const lines = count(args.lines, 40) * 5;
  try {
    const snapshot = await terminalSnapshot(id);
    const tail = snapshot.split("\n").filter((line) => line.trim()).slice(-lines).join("\n");
    return {
      summary: `Read terminal #${id}`,
      detail: tail ? `${describePane(pane)}\n\n${tail}` : `${describePane(pane)}\n\nIt has printed nothing yet.`,
    };
  } catch (error) {
    return fail(`Terminal #${id} could not be read: ${String(error)}`);
  }
}

/** Talks to whatever is running in a pane — a prompt for an agent, a line for
 * a shell. The confirmation a typed command gets belongs to the Run button;
 * this is the assistant being asked directly, so it says what it sent. */
export async function sendToTerminal(args: Record<string, unknown>): Promise<ToolResult> {
  const id = Number(args.terminal);
  const pane = useTerminalStore.getState().panes.find((entry) => entry.id === id);
  if (!pane) return fail(`There is no terminal #${args.terminal}.`);
  if (pane.status !== "running") return fail(`Terminal #${id} is not running.`);
  const message = text(args.text);
  if (!message) return fail("There was nothing to send.");
  await writeTerminal(id, `${message}\r`);
  return { summary: `Sent to terminal #${id}`, detail: `Sent to #${id}: "${message}".` };
}

/** One, several, or every terminal — "close the Codex ones" is a sentence
 * people say, and making them close eight panes by hand is not an answer. */
export async function closeTerminals(args: Record<string, unknown>): Promise<ToolResult> {
  const store = useTerminalStore.getState();
  const id = Number(args.terminal);
  if (Number.isFinite(id) && id > 0) {
    const pane = store.panes.find((entry) => entry.id === id);
    if (!pane) return fail(`There is no terminal #${args.terminal}.`);
    await store.close(id);
    return { summary: `Closed terminal #${id}`, detail: `Terminal #${id} is closed.` };
  }

  const wantedProject = text(args.project);
  const project = wantedProject ? resolveProject(wantedProject) : null;
  if (wantedProject && !project) return fail(`There is no project called "${wantedProject}".`);
  const agent = text(args.agent).toLowerCase();
  const targets = store.panes.filter(
    (pane) => (!project || pane.projectId === project.id) && (!agent || pane.agentId === agent),
  );
  if (!targets.length) return fail("No terminals matched that, so nothing was closed.");
  for (const pane of targets) await useTerminalStore.getState().close(pane.id);
  const plural = targets.length === 1 ? "terminal" : "terminals";
  return {
    summary: `Closed ${targets.length} ${plural}`,
    detail: `Closed ${targets.length} ${plural}: ${targets.map((pane) => `#${pane.id}`).join(", ")}.`,
  };
}

export function focusTerminal(args: Record<string, unknown>): ToolResult {
  const id = Number(args.terminal);
  const pane = useTerminalStore.getState().panes.find((entry) => entry.id === id);
  if (!pane) return fail(`There is no terminal #${args.terminal}.`);
  useTerminalStore.getState().setFocus(id);
  return { summary: `Focused terminal #${id}`, detail: `Terminal #${id} is the focused one.` };
}
