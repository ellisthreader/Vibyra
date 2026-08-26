import { accentFor } from "../../lib/providerAccents";
import { launchConfigured } from "../../lib/configuredLaunch";
import { useAgentStore } from "../../state/agentStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { FolderIcon, PlusIcon } from "../common/Icons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// Starting things: an agent in this project, a new project, or a jump to one
// of the projects already open. The per-agent rows are the point — "New Claude
// Code terminal" is one keystroke, where the picker is a dialog and a click.

const NO_PROJECTS: never[] = [];

/**
 * One row per installed agent, honouring the project's launch contract.
 *
 * `launchConfigured` rather than `spawnAgent`: model, effort, permission mode,
 * account and safe-workspace preflight all live in that contract, and a
 * palette launch that skipped them would quietly differ from the same launch
 * started from the rail.
 */
function agentEntries(projectId: string): CommandPaletteEntry[] {
  return useAgentStore
    .getState()
    .agents.filter((agent) => agent.installed)
    .map((agent) => ({
      id: `new-${agent.id}`,
      kind: "command" as const,
      group: "Start",
      label: `New ${agent.name} terminal`,
      detail: agent.description || undefined,
      keywords: `launch open spawn create agent ${agent.program}`,
      accent: accentFor(agent.id, agent.accent),
      mono: agent.name.charAt(0).toUpperCase(),
      run: () => void launchConfigured(agent, projectId),
    }));
}

export function launchEntries(activeProjectId: string | null): CommandPaletteEntry[] {
  const projectStore = useProjectStore.getState();
  const workspace = useWorkspaceStore.getState();
  const projects = useSettingsStore.getState().settings?.projects ?? NO_PROJECTS;
  const entries: CommandPaletteEntry[] = [];

  if (activeProjectId) {
    entries.push(...agentEntries(activeProjectId));
    entries.push({
      id: "new-pick",
      kind: "command",
      group: "Start",
      label: "New terminal with a specific model…",
      detail: "Opens the picker",
      keywords: "launch agent model choose add",
      icon: PlusIcon,
      run: workspace.openAgentPicker,
    });
  }

  projects.forEach((project, index) => {
    entries.push({
      id: `proj-${project.id}`,
      kind: "project",
      group: "Projects",
      label: project.name,
      hint: index < 9 ? `Ctrl ⇧ ${index + 1}` : undefined,
      detail: project.root,
      code: true,
      keywords: "open switch workspace folder repo",
      accent: project.color,
      mono: project.name.charAt(0).toUpperCase(),
      run: () => void projectStore.activate(project.id),
    });
  });

  entries.push(
    {
      id: "proj-new",
      kind: "command",
      group: "Projects",
      label: "Add a project…",
      detail: "Pick a folder",
      keywords: "new create open folder import repo",
      icon: FolderIcon,
      run: () => void projectStore.pickAndCreate(),
    },
    {
      id: "proj-home",
      kind: "command",
      group: "Projects",
      label: "Go home",
      hint: "Ctrl ⇧ H",
      keywords: "overview dashboard back start",
      icon: FolderIcon,
      run: projectStore.goHome,
    },
  );
  return entries;
}
