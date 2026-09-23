import { useAgentStore } from "../state/agentStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { openNewProject } from "../state/newProject";
import { useNotificationStore } from "../state/notificationStore";
import { useProjectStore } from "../state/projectStore";
import { useScreenshotStore } from "../state/screenshotStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { CompanionSize } from "./companionPreferences";
import { addProject, listProjects, removeProject, renameProject, switchProject } from "./vibyraProjectTools";
import {
  closeTerminals, focusTerminal, fullscreenTerminal, renameTerminal, restartTerminal, sendToTerminal,
} from "./vibyraTerminalActions";
import { listTerminals, openTerminals, readTerminal } from "./vibyraTerminalTools";
import { fail, text, type ToolResult } from "./vibyraToolShared";

// Performing one tool from `vibyraTools`. Every action here already exists as
// something a person can click; this is the same door with a different handle,
// which is why none of it reaches past the app into the folder.

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
    ].filter(Boolean).join("\n"),
  };
}

const PANELS: Record<string, [string, () => void]> = {
  preview: ["the Preview tab", () => useWorkspaceStore.getState().setCompanionTab("preview")],
  worktrees: ["the Worktrees tab", () => useWorkspaceStore.getState().setCompanionTab("worktrees")],
  chat: ["the Chat tab", () => useWorkspaceStore.getState().setCompanionTab("chat")],
  home: ["the home page", () => useProjectStore.getState().goHome()],
  notifications: ["notifications", () => useNotificationStore.getState().setCentreOpen(true)],
  history: ["saved history", () => useWorkspaceStore.getState().setHistoryOpen(true)],
  command_palette: ["the command palette", () => useWorkspaceStore.getState().setPaletteOpen(true)],
  new_terminal: ["the new terminal picker", () => useWorkspaceStore.getState().openAgentPicker()],
  new_project: ["the new project page", openNewProject],
  screenshot: ["a screenshot capture", () => void useScreenshotStore.getState().capture()],
};

function openPanel(args: Record<string, unknown>): ToolResult {
  const panel = text(args.panel).toLowerCase().replace(/[\s-]+/g, "_");
  if (panel === "settings") {
    const section = text(args.section).toLowerCase() || "general";
    useWorkspaceStore.getState().openSettingsSection(section as never);
    return { summary: `Opened Settings · ${section}`, detail: `Settings is open on ${section}.` };
  }
  const entry = PANELS[panel];
  if (!entry) return fail(`Vibyra has no "${panel}" panel. It has settings, ${Object.keys(PANELS).join(", ")}.`);
  entry[1]();
  return { summary: `Opened ${entry[0]}`, detail: `${entry[0]} is open.` };
}

const CLOSERS: Record<string, [string, () => void]> = {
  settings: ["Settings", () => useWorkspaceStore.getState().closeSettings()],
  history: ["saved history", () => useWorkspaceStore.getState().setHistoryOpen(false)],
  command_palette: ["the command palette", () => useWorkspaceStore.getState().setPaletteOpen(false)],
  notifications: ["notifications", () => useNotificationStore.getState().setCentreOpen(false)],
  new_terminal: ["the new terminal picker", () => useWorkspaceStore.getState().closeAgentPicker()],
  side_panel: ["the side panel", () => useWorkspaceStore.getState().companionOpen && useWorkspaceStore.getState().toggleCompanion()],
};

function closePanel(args: Record<string, unknown>): ToolResult {
  const panel = text(args.panel).toLowerCase().replace(/[\s-]+/g, "_");
  const entry = CLOSERS[panel];
  if (!entry) return fail(`"${panel}" is not something Vibyra can close. It can close ${Object.keys(CLOSERS).join(", ")}.`);
  entry[1]();
  return { summary: `Closed ${entry[0]}`, detail: `${entry[0]} is closed.` };
}

/** The right-hand panel this chat lives in: its three widths, or shut. */
function sidePanel(args: Record<string, unknown>): ToolResult {
  const size = text(args.size).toLowerCase();
  if (size === "closed") return closePanel({ panel: "side_panel" });
  if (!["compact", "wide", "full"].includes(size)) return fail(`The side panel is compact, wide, full or closed — not "${size}".`);
  useWorkspaceStore.getState().setCompanionSize(size as CompanionSize);
  return { summary: `Made the side panel ${size}`, detail: `The side panel is ${size === "full" ? "full screen" : size}.` };
}

/** Each tool gets the arguments and the person's own words, which settle what
 * "the claude terminal" means when the model's pick disagrees with them. */
const TOOLS: Record<string, (args: Record<string, unknown>, request: string) => ToolResult | Promise<ToolResult>> = {
  open_terminals: openTerminals,
  list_terminals: listTerminals,
  read_terminal: readTerminal,
  close_terminals: closeTerminals,
  send_to_terminal: sendToTerminal,
  focus_terminal: focusTerminal,
  fullscreen_terminal: fullscreenTerminal,
  rename_terminal: renameTerminal,
  restart_terminal: restartTerminal,
  list_projects: listProjects,
  switch_project: switchProject,
  add_project: addProject,
  rename_project: renameProject,
  remove_project: removeProject,
  list_agents: listAgents,
  open_panel: openPanel,
  close_panel: closePanel,
  side_panel: sidePanel,
};

/** Runs one named tool. Never throws: a tool that fails is an answer the model
 * has to account for, not a broken conversation. */
export async function runVibyraTool(name: string, args: Record<string, unknown>, request = ""): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return fail(`Vibyra has no tool called ${name}.`);
  try {
    return await tool(args, request);
  } catch (error) {
    return fail(`${name} failed: ${String(error)}`);
  }
}
