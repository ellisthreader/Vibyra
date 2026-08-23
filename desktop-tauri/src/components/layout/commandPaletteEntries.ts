import { useProjectStore } from "../../state/projectStore";
import { useScreenshotStore } from "../../state/screenshotStore";
import { useSettingsStore } from "../../state/settingsStore";
import { paneLabel, useTerminalStore } from "../../state/terminalStore";
import { useNotificationStore } from "../../state/notificationStore";
import { useReportStore } from "../../state/reportStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

export interface CommandPaletteEntry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  accent?: string;
  mono?: string;
  attention?: boolean;
  run: () => void;
}

export function commandPaletteEntries(): CommandPaletteEntry[] {
  const { panes, activity, setFocus } = useTerminalStore.getState();
  const projectStore = useProjectStore.getState();
  const workspace = useWorkspaceStore.getState();
  const projects = useSettingsStore.getState().settings?.projects ?? [];
  const projectName = (id: string) =>
    projects.find((project) => project.id === id)?.name ?? "";
  const entries: CommandPaletteEntry[] = [];

  for (const pane of panes.filter((candidate) => activity[candidate.id] === "attention")) {
    entries.push({
      id: `attn-${pane.id}`,
      group: "Needs you",
      label: `${paneLabel(pane)} — waiting for input`,
      hint: projectName(pane.projectId),
      attention: true,
      run: () => void projectStore.activate(pane.projectId).then(() => setFocus(pane.id)),
    });
  }

  const unread = useNotificationStore.getState().unread;
  entries.push({
    id: "notifications",
    group: "Vibyra",
    label: unread > 0 ? `Notifications (${unread} unread)` : "Notifications",
    attention: unread > 0,
    run: () => useNotificationStore.getState().setCentreOpen(true),
  });

  projects.forEach((project, index) => {
    entries.push({
      id: `proj-${project.id}`,
      group: "Projects",
      label: project.name,
      hint: index < 9 ? `Ctrl ⇧ ${index + 1}` : undefined,
      accent: project.color,
      mono: project.name.charAt(0).toUpperCase(),
      run: () => void projectStore.activate(project.id),
    });
  });

  panes
    .filter((pane) => pane.projectId === projectStore.activeId && pane.status === "running")
    .forEach((pane, index) => {
      entries.push({
        id: `sess-${pane.id}`,
        group: "Sessions",
        label: paneLabel(pane),
        hint: index < 9 ? `Ctrl ${index + 1}` : undefined,
        accent: pane.accent,
        mono: pane.title.charAt(0).toUpperCase(),
        run: () => setFocus(pane.id),
      });
    });

  entries.push(
    {
      id: "act-new-terminal",
      group: "Actions",
      label: "New terminal…",
      hint: "pick an agent",
      run: workspace.openAgentPicker,
    },
    {
      id: "act-new-project",
      group: "Actions",
      label: "New project…",
      hint: "folder picker",
      run: () => void projectStore.pickAndCreate(),
    },
    {
      id: "act-shot",
      group: "Actions",
      label: "Capture screenshot",
      hint: "F9",
      run: () => void useScreenshotStore.getState().capture(),
    },
    {
      id: "act-home",
      group: "Actions",
      label: "Go home",
      hint: "Ctrl ⇧ H",
      run: projectStore.goHome,
    },
    {
      id: "act-panel",
      group: "Actions",
      label: "Toggle side panel",
      run: workspace.toggleCompanion,
    },
    {
      id: "act-settings",
      group: "Actions",
      label: "Open settings",
      run: workspace.openSettings,
    },
    {
      id: "act-report",
      group: "Actions",
      label: "Report a bug…",
      hint: "or share an idea or question",
      run: () => void useReportStore.getState().begin(),
    },
  );

  return entries;
}
