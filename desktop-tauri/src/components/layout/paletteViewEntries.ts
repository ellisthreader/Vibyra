import type { DockSize, DockTool, SettingsSectionId } from "../../state/workspaceStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { EyeIcon, FolderIcon, GearIcon, GitBranchIcon, MemoryIcon, SparklesIcon } from "../common/Icons";
import { MonitorIcon } from "../common/StatusIcons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// Everything the window itself can be told to do. All of it was already
// clickable somewhere in the chrome; none of it was reachable by typing.

const SIZES: { id: DockSize; label: string; detail: string }[] = [
  { id: "compact", label: "Compact", detail: "A reading column beside the terminals" },
  { id: "wide", label: "Wide", detail: "Room for a preview at a real viewport" },
  { id: "full", label: "Full", detail: "The dock takes the workspace" },
];

const TOOLS: { id: DockTool; label: string; icon: typeof FolderIcon }[] = [
  { id: "preview", label: "Preview", icon: MonitorIcon },
  { id: "chat", label: "Chat", icon: SparklesIcon },
  { id: "memory", label: "Memory", icon: MemoryIcon },
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "review", label: "Review", icon: GitBranchIcon },
];

const SETTINGS: { id: SettingsSectionId; label: string; keywords: string }[] = [
  { id: "profile", label: "Profile", keywords: "account sign out login email plan" },
  { id: "general", label: "General", keywords: "theme dark light font folder default" },
  { id: "performance", label: "Performance", keywords: "cpu memory gpu renderer speed lag" },
  { id: "notifications", label: "Notifications", keywords: "alerts sounds volume desktop toast" },
  { id: "ai", label: "Vibyra AI", keywords: "openai key spend usage limit budget" },
  { id: "integrations", label: "Integrations", keywords: "accounts providers claude codex login" },
  { id: "agents", label: "Custom agents", keywords: "cli add custom command rail" },
  { id: "shortcuts", label: "Shortcuts", keywords: "hotkey keybinding f8 f9 global" },
  { id: "updates", label: "Updates", keywords: "version release install upgrade" },
];

export function viewEntries(): CommandPaletteEntry[] {
  const workspace = useWorkspaceStore.getState();
  const open = workspace.dockTool !== null;
  const entries: CommandPaletteEntry[] = SIZES.map((size) => ({
    id: `dock-size-${size.id}`,
    kind: "command",
    group: "View",
    label: `Dock size: ${size.label}`,
    detail: size.detail,
    hint: open && workspace.dockSize === size.id ? "current" : undefined,
    keywords: "layout split preview terminal pane arrange sidebar panel width",
    icon: MonitorIcon,
    run: () => workspace.setDockSize(size.id),
  }));

  entries.push({
    id: "dock-toggle",
    kind: "command",
    group: "View",
    label: open ? "Hide dock" : "Show dock",
    keywords: "companion sidebar chat memory files preview drawer panel",
    icon: EyeIcon,
    run: workspace.toggleDock,
  });

  for (const tool of TOOLS) {
    entries.push({
      id: `dock-${tool.id}`,
      kind: "command",
      group: "View",
      label: `Dock: ${tool.label}`,
      hint: workspace.dockTool === tool.id ? "current" : undefined,
      keywords: "companion sidebar panel open show dock",
      icon: tool.icon,
      run: () => workspace.setDockTool(tool.id),
    });
  }

  for (const section of SETTINGS) {
    entries.push({
      id: `set-${section.id}`,
      kind: "command",
      group: "Settings",
      label: `Settings: ${section.label}`,
      keywords: `preferences options configure ${section.keywords}`,
      icon: GearIcon,
      run: () => workspace.openSettingsSection(section.id),
    });
  }
  return entries;
}
