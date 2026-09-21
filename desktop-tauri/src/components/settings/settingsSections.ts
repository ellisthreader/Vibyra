import type { ComponentType } from "react";

import type { SettingsPanelId, SettingsSectionId } from "../../state/workspaceStore";
import { BellIcon } from "../common/StatusIcons";
import { CommandIcon, GearIcon, PhoneIcon, SlidersIcon, SparklesIcon, UserIcon } from "../common/Icons";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Tile colour behind the icon, the macOS System Settings idiom. */
  tile: string;
  /** Renders a divider above: Advanced sits apart from the everyday pages. */
  secondary?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "general", label: "General", icon: GearIcon, tile: "#6b7280" },
  { id: "ai", label: "AI accounts", icon: SparklesIcon, tile: "#5b7cfa" },
  { id: "notifications", label: "Notifications", icon: BellIcon, tile: "#e0553f" },
  { id: "iphone", label: "Phone", icon: PhoneIcon, tile: "#2f9e6b" },
  { id: "shortcuts", label: "Shortcuts", icon: CommandIcon, tile: "#8b5cf6" },
  { id: "account", label: "Account", icon: UserIcon, tile: "#2a8bd6" },
  { id: "advanced", label: "Advanced", icon: SlidersIcon, tile: "#3f4756", secondary: true },
];

export interface SettingsIndexEntry {
  label: string;
  keywords: string;
  section: SettingsSectionId;
  panel?: SettingsPanelId;
}

/** What "Find a setting" searches. Each entry is one thing a person might
 * look for, in their words, mapped to the page and group that holds it. */
const SETTINGS_INDEX: SettingsIndexEntry[] = [
  { label: "Theme", keywords: "dark light auto appearance colour color", section: "general", panel: "appearance" },
  { label: "Agent view", keywords: "terminal chat codex conversation", section: "general", panel: "appearance" },
  { label: "Terminal text size", keywords: "font size zoom bigger smaller", section: "general", panel: "appearance" },
  { label: "Performance mode", keywords: "battery slow lag motion blur fast", section: "general", panel: "performance" },
  { label: "Restore terminal output", keywords: "history session privacy shared scrollback restore", section: "general" },
  { label: "OpenAI account", keywords: "codex chatgpt sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "Anthropic account", keywords: "claude sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "Google account", keywords: "gemini sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "GitHub", keywords: "github repository pull request connect integration", section: "ai", panel: "integrations" },
  { label: "Obsidian", keywords: "obsidian vault notes markdown memory integration", section: "ai", panel: "integrations" },
  { label: "OpenAI API key", keywords: "key chat voice dictation vibyra ai companion", section: "advanced", panel: "vibyraFeatures" },
  { label: "Usage and spend limits", keywords: "spend cap budget usage cost money limit requests", section: "advanced", panel: "usage" },
  { label: "Show notifications", keywords: "toast alert bell", section: "notifications" },
  { label: "Notification sounds", keywords: "sound volume cue mute quiet", section: "notifications" },
  { label: "Desktop notifications", keywords: "macos banner system background permission", section: "notifications" },
  { label: "Agent needs you", keywords: "attention waiting finished failed idle quiet events", section: "notifications" },
  { label: "Phone connection", keywords: "iphone mobile pair bonjour nearby", section: "iphone" },
  { label: "Typing from your phone", keywords: "phone type input permission", section: "iphone" },
  { label: "Remote phone control", keywords: "cloud anywhere relay cellular network remote access", section: "iphone" },
  { label: "Pairing code", keywords: "qr code link phone cannot find", section: "iphone" },
  { label: "Voice typing shortcut", keywords: "dictation speech hotkey key f8", section: "shortcuts" },
  { label: "Screenshot shortcut", keywords: "capture hotkey key f9 editor", section: "shortcuts" },
  { label: "All keyboard shortcuts", keywords: "keys palette command", section: "shortcuts" },
  { label: "Display name", keywords: "profile name email account", section: "account" },
  { label: "Password", keywords: "reset forgot", section: "account" },
  { label: "Log out", keywords: "sign out session", section: "account" },
  { label: "Font family", keywords: "monospace typeface jetbrains menlo", section: "advanced", panel: "terminal" },
  { label: "Scrollback", keywords: "lines history buffer", section: "advanced", panel: "terminal" },
  { label: "Default shell", keywords: "zsh bash fish sh", section: "advanced", panel: "terminal" },
  { label: "Default project folder", keywords: "workspace root directory", section: "advanced", panel: "files" },
  { label: "Save screenshots to", keywords: "folder pictures directory", section: "advanced", panel: "files" },
  { label: "Include the Vibyra window", keywords: "capture hide screenshot", section: "advanced", panel: "files" },
  { label: "Graphics mode", keywords: "gpu renderer nvidia accelerated compatibility linux", section: "advanced", panel: "graphics" },
  { label: "Additional runtimes", keywords: "aider opencode qwen cli", section: "advanced", panel: "runtimes" },
  { label: "Custom agents", keywords: "program command path add agent", section: "advanced", panel: "runtimes" },
  { label: "OpenRouter model catalog", keywords: "models refresh catalog", section: "advanced", panel: "runtimes" },
];

export function searchSettings(query: string): SettingsIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return SETTINGS_INDEX.filter((entry) => {
    const hay = `${entry.label} ${entry.keywords}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  }).slice(0, 8);
}
