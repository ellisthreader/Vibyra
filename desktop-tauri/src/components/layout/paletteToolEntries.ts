import { shortcutLabel } from "../../lib/hotkeys";
import { useNotificationStore } from "../../state/notificationStore";
import { useReportStore } from "../../state/reportStore";
import { useScreenshotStore } from "../../state/screenshotStore";
import { useSettingsStore } from "../../state/settingsStore";
import type { UpdateStatus } from "../../lib/updatePolicy";
import { useUpdateStore } from "../../state/updateStore";
import { useVoiceStore } from "../../state/voiceStore";
import { CheckIcon, PencilIcon, RestartIcon, SendIcon } from "../common/Icons";
import { BellIcon, DownloadIcon, MonitorIcon } from "../common/StatusIcons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// The global tools, and the app's own housekeeping. F8 and F9 already worked;
// nothing in the window ever said so, and a shortcut nobody can find is a
// feature nobody has.

function hotkey(shortcut: string | undefined, fallback: string): string {
  return shortcutLabel(shortcut ?? fallback);
}

/**
 * What the update entry does depends on how far along the update already is —
 * the same three-state dance the account menu's update row runs.
 */
const UPDATE_LABEL: Partial<Record<UpdateStatus, string>> = {
  available: "Download the update",
  downloading: "Updating…",
  ready: "Restart to finish updating",
  restartError: "Retry the update restart",
  error: "Retry the update",
};

function updateAction(status: UpdateStatus): () => void {
  const store = () => useUpdateStore.getState();
  if (status === "available" || status === "error") return () => void store().download();
  if (status === "ready" || status === "restartError") return () => void store().restart();
  return () => void store().check();
}

export function toolEntries(): CommandPaletteEntry[] {
  const settings = useSettingsStore.getState().settings;
  const notifications = useNotificationStore.getState();
  const update = useUpdateStore.getState();
  const listening = useVoiceStore.getState().phase === "listening";

  const entries: CommandPaletteEntry[] = [
    {
      id: "tool-voice",
      kind: "command",
      group: "Tools",
      label: listening ? "Stop dictating and send" : "Dictate to the focused agent",
      detail: listening ? undefined : "Speak; the transcript goes straight into the terminal",
      hint: hotkey(settings?.voiceShortcut, "F8"),
      keywords: "voice microphone speak talk transcribe whisper say",
      icon: SendIcon,
      run: () => useVoiceStore.getState().toggle(),
    },
    {
      id: "tool-shot",
      kind: "command",
      group: "Tools",
      label: "Capture a screenshot",
      detail: "Annotate it, then drop it into a terminal",
      hint: hotkey(settings?.screenshotShortcut, "F9"),
      keywords: "screen grab capture image picture snip annotate",
      icon: MonitorIcon,
      run: () => void useScreenshotStore.getState().capture(),
    },
    {
      id: "tool-notifications",
      kind: "command",
      group: "Vibyra",
      label:
        notifications.unread > 0
          ? `Notifications — ${notifications.unread} unread`
          : "Notifications",
      keywords: "alerts history centre center inbox activity",
      icon: BellIcon,
      attention: notifications.unread > 0,
      weight: notifications.unread > 0 ? 40 : 0,
      run: () => useNotificationStore.getState().setCentreOpen(true),
    },
  ];

  if (notifications.unread > 0) {
    entries.push({
      id: "tool-notifications-read",
      kind: "command",
      group: "Vibyra",
      label: "Mark all notifications read",
      keywords: "dismiss clear alerts inbox",
      icon: CheckIcon,
      run: () => useNotificationStore.getState().markAllRead(),
    });
  }

  entries.push(
    {
      id: "tool-update",
      kind: "command",
      group: "Vibyra",
      label: UPDATE_LABEL[update.status] ?? "Check for updates",
      detail: update.version ? `Version ${update.version}` : undefined,
      keywords: "upgrade version release download new install restart",
      icon: update.status === "ready" ? DownloadIcon : RestartIcon,
      run: updateAction(update.status),
    },
    {
      id: "tool-report",
      kind: "command",
      group: "Vibyra",
      label: "Report a bug, idea or question",
      detail: "Sends the app's own context with it",
      keywords: "feedback support issue problem broken help suggest",
      icon: PencilIcon,
      run: () => void useReportStore.getState().begin(),
    },
  );
  return entries;
}
