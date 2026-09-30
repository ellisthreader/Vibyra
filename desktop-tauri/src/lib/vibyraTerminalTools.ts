import { computerName } from "./platform.ts";
import { writeTerminal } from "../ipc/terminal";
import { sendPrompt } from "../components/sharedChats/delivery";
import { useAgentStore } from "../state/agentStore";
import { useLaunchApprovalStore } from "../state/launchApprovalStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useNotificationStore } from "../state/notificationStore";
import { useTerminalStore } from "../state/terminalStore";
import { launchConfigured } from "./configuredLaunch";
import { agentForModel, matchModel } from "./modelMatch";
import { modelEffortOptions } from "./modelEffort";
import type { LaunchEffort } from "../state/launchSettingsStore";
import { allTerminals, describeTerminal, projectName, resolveTerminal } from "./vibyraSessions";
import { screenText } from "./vibyraTerminalText";
import { count, fail, resolveProject, text, type ToolResult } from "./vibyraToolShared";

// Opening terminals and seeing what they are doing. Launches go through
// `launchConfigured`, the same function the rail's chips and the picker call,
// so the project's account, Safe mode and Codex's conversation engine apply to
// the assistant exactly as they do to a click.

/** Efforts a CLI takes when no model was named and it runs its own default. */
const DEFAULT_EFFORTS: Record<string, LaunchEffort[]> = {
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  claude: ["low", "medium", "high", "xhigh", "max"],
};

const catalogue = () => useModelCatalogStore.getState().groups.flatMap((group) => group.models);

async function agents() {
  if (!useAgentStore.getState().loaded) await useAgentStore.getState().refresh();
  return useAgentStore.getState().agents;
}

/** "hiugh" arrives as "high" from the model; "x-high" and "extra high" need help. */
function normaliseEffort(value: string): string {
  const flat = value.toLowerCase().replace(/[^a-z]/g, "");
  return flat === "extrahigh" ? "xhigh" : flat;
}

/** The effort to launch at, or why it cannot be. An effort on a CLI that has
 * none is dropped rather than refused: a model filling in every field it was
 * offered once turned "open a plain terminal" into a refusal. */
function effortFor(said: string, agentId: string, model: ReturnType<typeof matchModel>): { effort: LaunchEffort | null } | { error: string } {
  const wanted = normaliseEffort(said);
  if (!wanted || !DEFAULT_EFFORTS[agentId]) return { effort: null };
  const allowed = model
    ? modelEffortOptions(model as never, agentId).map((option) => option.value)
    : DEFAULT_EFFORTS[agentId];
  if (!allowed.length) return { effort: null };
  if (allowed.includes(wanted as LaunchEffort)) return { effort: wanted as LaunchEffort };
  return { error: `${model?.label ?? agentId} takes ${allowed.join(", ")} effort, not "${said}". Nothing was opened.` };
}

export async function openTerminals(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const project = resolveProject(text(args.project));
  if (!project) return fail(text(args.project) ? `There is no project called "${text(args.project)}".` : "There is no project open to put terminals in.");

  // "claude" or "codex" in the model field is the agent, not a model: matched
  // loosely it would pick some Claude model nobody asked for.
  // A model name put in the title ("GPT Astra") was meant as the model.
  const titleModel = !text(args.model) && text(args.title) ? matchModel(text(args.title), catalogue()) : null;
  // …and one the model left out entirely is read from the person's words:
  // "open 3 terminals with gpt astra" once opened three plain Claude panes.
  const fromWords = /\b(?:with|on|using|running)\s+(.+?)(?=\s+(?:in|on|and|with|at)\b|[.,!?]|$)/i.exec(request)?.[1] ?? "";
  const wordsModel = !text(args.model) && !titleModel && fromWords ? matchModel(fromWords, catalogue()) : null;
  const modelSaid = text(args.model) || (titleModel ? text(args.title) : wordsModel ? fromWords : "");
  const askedFor = /^(claude( code)?|codex|gemini( cli)?|shell|terminal)$/i.test(modelSaid) ? "" : modelSaid;
  const model = askedFor ? matchModel(askedFor, catalogue()) : null;
  if (askedFor && !model) {
    const examples = catalogue().slice(0, 4).map((entry) => entry.label).join(", ");
    return fail(`No model here is called "${askedFor}". Available models include ${examples}.`);
  }
  // Naming a model names the agent. An agent guessed beside it — a shell, or
  // Claude for "GPT astra" — is the model's mistake, and the model wins.
  const asked = text(args.agent).toLowerCase() || (/^(claude|codex|gemini)/i.exec(modelSaid)?.[0].toLowerCase() ?? "");
  const inferred = model ? agentForModel(model) : null;
  const wanted = inferred ?? asked;
  if (!wanted) return fail("Say which agent to run, or which model to run it on.");

  const agent = (await agents()).find((entry) => entry.id === wanted);
  if (!agent) return fail(`${wanted} is not one of Vibyra's agents.`);
  if (!agent.installed) return fail(`${agent.name} is not installed on this ${computerName}, so it cannot be launched.`);

  const chosen = effortFor(text(args.effort), agent.id, model);
  if ("error" in chosen) return fail(chosen.error);
  const { effort } = chosen;
  const permission = text(args.permission).toLowerCase() === "full" ? "full" : "standard";
  const errorsBefore = useNotificationStore.getState().history.length;
  const opened = await launchConfigured(agent, project.id, {
    model: model?.id ?? null,
    reasoningEffort: effort ?? undefined,
    permissionMode: permission,
    title: (!titleModel && text(args.title)) || undefined,
    count: count(args.count, 1),
  });
  if (!opened.length) {
    if (useLaunchApprovalStore.getState().pending) {
      return { summary: "Waiting for Safe mode approval", detail: "Nothing is open yet: Safe mode asked the person to approve a checkpoint in a dialog on screen. Tell them to approve it." };
    }
    const reason = useNotificationStore.getState().history.slice(errorsBefore).map((entry) => entry.body).find(Boolean);
    return fail(`${agent.name} could not be started${reason ? `: ${reason}` : "."}`);
  }

  const opening = text(args.prompt);
  if (opening) {
    await Promise.all(opened.map((session) => ("paneId" in session
      ? writeTerminal(session.paneId, `${opening}\r`)
      : sendPrompt(session.conversationId, opening)).catch(() => {})));
  }
  const parts = [model ? `on ${model.label}` : "", permission === "full" ? "with full permissions" : "", effort ? `at ${effort} effort` : ""].filter(Boolean);
  const how = parts.length ? ` ${parts.join(", ")}` : "";
  const noun = `${agent.name} terminal${opened.length === 1 ? "" : "s"}`;
  const refs = opened.map((session) => `"${"paneId" in session ? session.paneId : session.conversationId.slice(0, 8)}"`).join(", ");
  return {
    summary: `Opened ${opened.length} ${noun}${how} in ${project.name}`,
    detail: `Opened ${opened.length} ${noun}${how} in ${project.name}: ${refs}.${opening ? ` Sent each one: "${opening}".` : ""}`,
  };
}

/** Every terminal, and the last few lines on each one's screen — enough to
 * answer "what's going on" or find "the dev server" without a second call. */
export async function listTerminals(args: Record<string, unknown>): Promise<ToolResult> {
  const waiting = waitingLine();
  const wanted = text(args.project);
  const project = wanted ? resolveProject(wanted) : null;
  if (wanted && !project) return fail(`There is no project called "${wanted}".`);
  const terminals = allTerminals().filter((terminal) => !project || terminal.projectId === project.id);
  if (!terminals.length) return { summary: "Checked the terminals", detail: `${waiting}\nNo terminals are open${project ? ` in ${project.name}` : ""}.` };
  const lines = await Promise.all(terminals.slice(0, 12).map(async (terminal) => {
    const screen = await screenText(terminal, 4).catch(() => "");
    return `${describeTerminal(terminal)}${screen ? `\n  last on screen:\n${screen.split("\n").map((line) => `    ${line.slice(0, 160)}`).join("\n")}` : ""}`;
  }));
  return {
    summary: `Checked ${terminals.length} terminal${terminals.length === 1 ? "" : "s"}`,
    detail: `${waiting}\n${lines.join("\n")}`,
  };
}

/** Always the first line, across every project: "does any terminal need
 * me?" filtered to the open project once missed the one waiting in another,
 * and the follow-up report restates only a result's first line. */
function waitingLine(): string {
  const waiting = allTerminals().filter((terminal) => terminal.kind === "pane" && terminal.pane.status === "running" &&
    useTerminalStore.getState().activity[terminal.pane.id] === "attention");
  return waiting.length
    ? `Waiting for the person to answer: ${waiting.map((terminal) => `"${terminal.ref}" (${terminal.agentId} in ${projectName(terminal.projectId)})`).join(", ")}.`
    : "No terminal is waiting for the person.";
}

export async function readTerminal(args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const terminal = resolveTerminal(args.terminal, request);
  if (typeof terminal === "string") return fail(terminal);
  const lines = Math.max(1, Math.min(200, Number(args.lines) || 60));
  try {
    const screen = await screenText(terminal, lines);
    return {
      summary: `Read ${terminal.agentId === "shell" ? "terminal" : terminal.agentId} "${terminal.ref}" in ${projectName(terminal.projectId)}`,
      detail: `${describeTerminal(terminal)}\nOn screen now:\n${screen || "(nothing printed yet)"}`,
    };
  } catch (error) {
    return fail(`Terminal "${terminal.ref}" could not be read: ${String(error)}`);
  }
}
