import type { ComponentType } from "react";

import { english, type MessageKey } from "../../i18n";
import type { SettingsPanelId, SettingsSectionId } from "../../state/workspaceStore";
import { BellIcon } from "../common/StatusIcons";
import { CloudIcon, CommandIcon, GearIcon, PhoneIcon, SlidersIcon, SparklesIcon, UserIcon } from "../common/Icons";

export interface SettingsSection {
  id: SettingsSectionId;
  /** A catalogue key, so the label follows the language. */
  label: MessageKey;
  icon: ComponentType<{ size?: number }>;
  /** Tile colour behind the icon, the macOS System Settings idiom. */
  tile: string;
  /** Renders a divider above: Advanced sits apart from the everyday pages. */
  secondary?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "general", label: "settings.section.general", icon: GearIcon, tile: "#6b7280" },
  { id: "ai", label: "settings.section.ai", icon: SparklesIcon, tile: "#5b7cfa" },
  { id: "integrations", label: "settings.section.integrations", icon: SparklesIcon, tile: "#5b7cfa" },
  { id: "notifications", label: "settings.section.notifications", icon: BellIcon, tile: "#e0553f" },
  { id: "iphone", label: "settings.section.iphone", icon: PhoneIcon, tile: "#2f9e6b" },
  { id: "cloud", label: "settings.section.cloud", icon: CloudIcon, tile: "#3b82f6" },
  { id: "shortcuts", label: "settings.section.shortcuts", icon: CommandIcon, tile: "#8b5cf6" },
  { id: "privacy", label: "settings.section.privacy", icon: UserIcon, tile: "#4e688d" },
  { id: "account", label: "settings.section.account", icon: UserIcon, tile: "#2a8bd6" },
  { id: "security", label: "settings.section.security", icon: UserIcon, tile: "#4e688d" },
  { id: "help", label: "settings.section.help", icon: GearIcon, tile: "#6b7280" },
  { id: "advanced", label: "settings.section.advanced", icon: SlidersIcon, tile: "#3f4756", secondary: true },
];

export interface SettingsIndexEntry {
  /** A catalogue key for what the person looks for. */
  key: MessageKey;
  keywords: string;
  section: SettingsSectionId;
  panel?: SettingsPanelId;
}

/** What "Find a setting" searches. Each entry is one thing a person might
 * look for, in their words, mapped to the page and group that holds it. */
const SETTINGS_INDEX: SettingsIndexEntry[] = [
  { key: "settings.index.cloud5", keywords: "cloud capacity storage hours usage tokens", section: "cloud", panel: "cloudCapacity" },
  { key: "settings.index.cloud4", keywords: "cloud delete remove copies stop syncing", section: "cloud", panel: "cloudDelete" },
  { key: "settings.index.cloud3", keywords: "cloud sync pause stop stop sending", section: "cloud", panel: "cloudComputer" },
  { key: "settings.index.cloud2", keywords: "cloud accounts claude codex github login permission", section: "cloud", panel: "cloudAccounts" },
  { key: "settings.index.cloud1", keywords: "cloud saving sync projects ticked ready upload", section: "cloud", panel: "cloudProjects" },
  { key: "settings.index.cloud0", keywords: "vibyra cloud saving set up agree sync upload", section: "cloud" },
  { key: "settings.index.theme", keywords: "dark light auto appearance colour color", section: "general", panel: "appearance" },
  { key: "settings.index.agentView", keywords: "terminal chat codex conversation", section: "general", panel: "appearance" },
  { key: "settings.index.terminalTextSize", keywords: "font size zoom bigger smaller", section: "general", panel: "appearance" },
  { key: "settings.index.performance", keywords: "battery slow lag motion blur fast balanced level mode", section: "general", panel: "performance" },
  { key: "settings.index.sendProjectContextToTheAssistant", keywords: "privacy openai chat share code git branch files sent", section: "privacy", panel: "privacy" },
  { key: "settings.index.restoreTerminalOutput", keywords: "history session privacy shared scrollback restore", section: "privacy", panel: "privacy" },
  { key: "settings.index.savedWorkspace", keywords: "clear delete erase layout session privacy shared forget", section: "privacy", panel: "privacy" },
  { key: "settings.index.openaiAccount", keywords: "codex chatgpt sign in connect", section: "ai", panel: "terminalAccounts" },
  { key: "settings.index.anthropicAccount", keywords: "claude sign in connect", section: "ai", panel: "terminalAccounts" },
  { key: "settings.index.googleAccount", keywords: "gemini sign in connect", section: "ai", panel: "terminalAccounts" },
  { key: "settings.index.github", keywords: "github repository pull request connect integration", section: "integrations", panel: "integrations" },
  { key: "settings.index.obsidian", keywords: "obsidian vault notes markdown memory integration", section: "integrations", panel: "integrations" },
  { key: "settings.section.privacy", keywords: "analytics usage statistics consent data export retention privacy", section: "privacy" },
  { key: "settings.section.help", keywords: "guides report problem contact version about legal terms", section: "help" },
  { key: "settings.index.spokenVoice", keywords: "voice speak aloud tts alloy nova shimmer read replies sound", section: "advanced", panel: "voice" },
  { key: "settings.index.speakingSpeed", keywords: "speed rate fast slow pace voice talk aloud", section: "advanced", panel: "voice" },
  { key: "settings.index.speakingStyle", keywords: "style tone manner personality accent instructions voice warm", section: "advanced", panel: "voice" },
  { key: "settings.index.voiceTypingLanguage", keywords: "dictation language transcription whisper accent english translate", section: "advanced", panel: "voice" },
  { key: "settings.index.pauseBeforeItAnswers", keywords: "pause silence wait interrupt cuts me off talk conversation", section: "advanced", panel: "voice" },
  { key: "settings.index.showNotifications", keywords: "toast alert bell", section: "notifications" },
  { key: "settings.index.notificationSounds", keywords: "sound volume cue mute quiet", section: "notifications" },
  { key: "settings.index.desktopNotifications", keywords: "macos banner system background permission", section: "notifications" },
  { key: "settings.index.agentNeedsYou", keywords: "attention waiting finished failed idle quiet events", section: "notifications" },
  { key: "settings.index.phoneConnection", keywords: "iphone mobile pair bonjour nearby", section: "iphone" },
  { key: "settings.index.typingFromYourPhone", keywords: "phone type input permission", section: "iphone" },
  { key: "settings.index.remotePhoneControl", keywords: "cloud anywhere relay cellular network remote access", section: "iphone" },
  { key: "settings.index.pairingCode", keywords: "qr code link phone cannot find", section: "iphone" },
  { key: "settings.index.voiceTypingShortcut", keywords: "dictation speech hotkey key f8", section: "shortcuts" },
  { key: "settings.index.talkToVibyra", keywords: "talk speak conversation hotkey key f10 hands free", section: "shortcuts" },
  { key: "settings.index.screenshotShortcut", keywords: "capture hotkey key f9 editor", section: "shortcuts" },
  { key: "settings.index.allKeyboardShortcuts", keywords: "keys palette command", section: "shortcuts" },
  { key: "settings.index.displayName", keywords: "profile name email account photo avatar member since", section: "account", panel: "identity" },
  { key: "settings.index.membership", keywords: "plan subscription billing upgrade cancel renew stripe app store pro", section: "account", panel: "membership" },
  { key: "settings.index.credits", keywords: "balance credits top up buy refill vibes ai", section: "account", panel: "credits" },
  { key: "settings.index.password", keywords: "reset forgot", section: "account", panel: "security" },
  { key: "settings.index.twoFactorAuthentication", keywords: "2fa code authenticator security recovery codes sms text message email verification turn on off", section: "account", panel: "security" },
  { key: "settings.index.devices", keywords: "sessions signed in everywhere phone computer sign out", section: "account", panel: "devices" },
  { key: "settings.index.remoteAccessSecurity", keywords: "passkey trusted devices revoke disconnect computer permissions activity", section: "security" },
  { key: "settings.index.logOut", keywords: "sign out session", section: "account" },
  { key: "settings.index.deleteAccount", keywords: "close remove erase leave danger", section: "account", panel: "danger" },
  { key: "settings.index.fontFamily", keywords: "monospace typeface jetbrains menlo", section: "advanced", panel: "terminal" },
  { key: "settings.index.scrollback", keywords: "lines history buffer", section: "advanced", panel: "terminal" },
  { key: "settings.index.defaultShell", keywords: "zsh bash fish sh", section: "advanced", panel: "terminal" },
  { key: "settings.index.defaultProjectFolder", keywords: "workspace root directory", section: "advanced", panel: "files" },
  { key: "settings.index.saveScreenshotsTo", keywords: "folder pictures directory", section: "advanced", panel: "files" },
  { key: "settings.index.includeTheVibyraWindow", keywords: "capture hide screenshot", section: "advanced", panel: "files" },
  { key: "settings.index.graphicsMode", keywords: "gpu renderer nvidia accelerated compatibility linux", section: "advanced", panel: "graphics" },
  { key: "settings.index.moreAgents", keywords: "aider opencode qwen cli runtime additional extra add agent", section: "ai" },
  { key: "settings.index.customAgents", keywords: "program command path add agent", section: "advanced", panel: "runtimes" },
  { key: "settings.index.openrouterModelCatalog", keywords: "models refresh catalog", section: "advanced", panel: "runtimes" },
];

export function searchSettings(query: string, t: (key: MessageKey) => string): SettingsIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return SETTINGS_INDEX.filter((entry) => {
    // The shown label, then the English one and its keywords, so either language finds it.
    const hay = `${t(entry.key)} ${english(entry.key)} ${entry.keywords}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  }).slice(0, 8);
}
