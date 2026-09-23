import { useAgentStore } from "../state/agentStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useProjectStore } from "../state/projectStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import {
  closeTerminals,
  focusTerminal,
  listTerminals,
  openTerminals,
  readTerminal,
  sendToTerminal,
} from "./vibyraTerminalTools";
import { fail, projects, resolveProject, text, type ToolResult } from "./vibyraToolShared";

// Performing one tool from `vibyraTools`. Every action here already exists as
// something a person can click; this is the same door with a different handle,
// which is why none of it reaches past the app into the folder.

function listProjects(): ToolResult {
  const all = projects();
  if (!all.length) return { summary: "Checked the projects", detail: "No projects have been added yet." };
  const active = useProjectStore.getState().activeId;
  return {
    summary: `Checked ${all.length} project${all.length === 1 ? "" : "s"}`,
    detail: all
      .map((project) => `${project.name} at ${project.root}${project.id === active ? " (open)" : ""}`)
      .join("\n"),
  };
}

async function switchProject(args: Record<string, unknown>): Promise<ToolResult> {
  const project = resolveProject(text(args.project));
  if (!project) return fail(`There is no project called "${text(args.project)}".`);
  await useProjectStore.getState().activate(project.id);
  return { summary: `Opened ${project.name}`, detail: `${project.name} is now the open project.` };
}

async function listAgents(): Promise<ToolResult> {
  if (!useAgentStore.getState().loaded) await useAgentStore.getState().refresh();
  const agents = useAgentStore.getState().agents;
  const installed = agents.filter((agent) => agent.installed);
  const models = useModelCatalogStore.getState().groups.flatMap((group) => group.models);
  return {
    summary: "Checked what can be launched",
    detail: [
      installed.length
        ? `Installed agents: ${installed.map((agent) => `${agent.name} (${agent.id})`).join(", ")}.`
        : "No AI CLI agents are installed.",
      agents.length > installed.length
        ? `Not installed: ${agents.filter((agent) => !agent.installed).map((agent) => agent.name).join(", ")}.`
        : "",
      models.length ? `Models available: ${models.slice(0, 24).map((model) => model.label).join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

const PANELS: Record<string, () => void> = {
  preview: () => useWorkspaceStore.getState().setCompanionTab("preview"),
  worktrees: () => useWorkspaceStore.getState().setCompanionTab("worktrees"),
  chat: () => useWorkspaceStore.getState().setCompanionTab("chat"),
  home: () => useProjectStore.getState().goHome(),
};

function openPanel(args: Record<string, unknown>): ToolResult {
  const panel = text(args.panel).toLowerCase();
  if (panel === "settings") {
    const section = text(args.section).toLowerCase() || "general";
    useWorkspaceStore.getState().openSettingsSection(section as never);
    return { summary: `Opened Settings · ${section}`, detail: `Settings is open on ${section}.` };
  }
  const open = PANELS[panel];
  if (!open) return fail(`Vibyra has no "${panel}" panel.`);
  open();
  return { summary: `Opened ${panel}`, detail: `${panel} is open.` };
}

/** Runs one named tool. Never throws: a tool that fails is an answer the model
 * has to account for, not a broken conversation. */
export async function runVibyraTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "open_terminals": return await openTerminals(args);
      case "list_terminals": return listTerminals(args);
      case "read_terminal": return await readTerminal(args);
      case "close_terminals": return await closeTerminals(args);
      case "send_to_terminal": return await sendToTerminal(args);
      case "focus_terminal": return focusTerminal(args);
      case "list_projects": return listProjects();
      case "switch_project": return await switchProject(args);
      case "list_agents": return await listAgents();
      case "open_panel": return openPanel(args);
      default: return fail(`Vibyra has no tool called ${name}.`);
    }
  } catch (error) {
    return fail(`${name} failed: ${String(error)}`);
  }
}
