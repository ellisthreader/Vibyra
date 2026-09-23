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
  { id: "ai", label: "Accounts", icon: SparklesIcon, tile: "#5b7cfa" },
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
  { label: "Performance", keywords: "battery slow lag motion blur fast balanced level mode", section: "general", panel: "performance" },
  { label: "Send project context to the assistant", keywords: "privacy openai chat share code git branch files sent", section: "general", panel: "privacy" },
  { label: "Restore terminal output", keywords: "history session privacy shared scrollback restore", section: "general", panel: "privacy" },
  { label: "Saved workspace", keywords: "clear delete erase layout session privacy shared forget", section: "general", panel: "privacy" },
  { label: "OpenAI account", keywords: "codex chatgpt sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "Anthropic account", keywords: "claude sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "Google account", keywords: "gemini sign in connect", section: "ai", panel: "terminalAccounts" },
  { label: "GitHub", keywords: "github repository pull request connect integration", section: "ai", panel: "integrations" },
  { label: "Obsidian", keywords: "obsidian vault notes markdown memory integration", section: "ai", panel: "integrations" },
  { label: "Spoken voice", keywords: "voice speak aloud tts alloy nova shimmer read replies sound", section: "advanced", panel: "voice" },
  { label: "Speaking speed", keywords: "speed rate fast slow pace voice talk aloud", section: "advanced", panel: "voice" },
  { label: "Speaking style", keywords: "style tone manner personality accent instructions voice warm", section: "advanced", panel: "voice" },
  { label: "Voice typing language", keywords: "dictation language transcription whisper accent english translate", section: "advanced", panel: "voice" },
  { label: "Pause before it answers", keywords: "pause silence wait interrupt cuts me off talk conversation", section: "advanced", panel: "voice" },
  { label: "Show notifications", keywords: "toast alert bell", section: "notifications" },
  { label: "Notification sounds", keywords: "sound volume cue mute quiet", section: "notifications" },
  { label: "Desktop notifications", keywords: "macos banner system background permission", section: "notifications" },
  { label: "Agent needs you", keywords: "attention waiting finished failed idle quiet events", section: "notifications" },
  { label: "Phone connection", keywords: "iphone mobile pair bonjour nearby", section: "iphone" },
  { label: "Typing from your phone", keywords: "phone type input permission", section: "iphone" },
  { label: "Remote phone control", keywords: "cloud anywhere relay cellular network remote access", section: "iphone" },
  { label: "Pairing code", keywords: "qr code link phone cannot find", section: "iphone" },
  { label: "Voice typing shortcut", keywords: "dictation speech hotkey key f8", section: "shortcuts" },
  { label: "Talk to Vibyra", keywords: "talk speak conversation hotkey key f10 hands free", section: "shortcuts" },
  { label: "Screenshot shortcut", keywords: "capture hotkey key f9 editor", section: "shortcuts" },
  { label: "All keyboard shortcuts", keywords: "keys palette command", section: "shortcuts" },
  { label: "Display name", keywords: "profile name email account photo avatar member since", section: "account", panel: "identity" },
  { label: "Membership", keywords: "plan subscription billing upgrade cancel renew stripe app store pro", section: "account", panel: "membership" },
  { label: "Credits", keywords: "balance credits top up buy refill vibes ai", section: "account", panel: "credits" },
  { label: "Password", keywords: "reset forgot", section: "account", panel: "security" },
  { label: "Two-factor authentication", keywords: "2fa code authenticator security recovery codes", section: "account", panel: "security" },
  { label: "Devices", keywords: "sessions signed in everywhere phone computer sign out", section: "account", panel: "devices" },
  { label: "Log out", keywords: "sign out session", section: "account" },
  { label: "Delete account", keywords: "close remove erase leave danger", section: "account", panel: "danger" },
  { label: "Font family", keywords: "monospace typeface jetbrains menlo", section: "advanced", panel: "terminal" },
  { label: "Scrollback", keywords: "lines history buffer", section: "advanced", panel: "terminal" },
  { label: "Default shell", keywords: "zsh bash fish sh", section: "advanced", panel: "terminal" },
  { label: "Default project folder", keywords: "workspace root directory", section: "advanced", panel: "files" },
  { label: "Save screenshots to", keywords: "folder pictures directory", section: "advanced", panel: "files" },
  { label: "Include the Vibyra window", keywords: "capture hide screenshot", section: "advanced", panel: "files" },
  { label: "Graphics mode", keywords: "gpu renderer nvidia accelerated compatibility linux", section: "advanced", panel: "graphics" },
  { label: "More agents", keywords: "aider opencode qwen cli runtime additional extra add agent", section: "ai" },
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
