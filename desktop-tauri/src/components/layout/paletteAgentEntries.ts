import type { AppMode } from "../../agentTypes";
import { relativeTime } from "../../lib/relativeTime";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { BookIcon, ClockIcon, ShieldIcon } from "../common/AgentIcons";
import { GaugeIcon, PlusIcon, SparklesIcon } from "../common/Icons";

// Agent Mode, by typing.
//
// Everything here was already clickable and none of it was reachable from the
// keyboard. The teammates come before the panels because a roster is what a
// person is usually looking for, and the chats come last because they are the
// longest list and the one a query is most likely to be narrowing.

const MODES: { id: AppMode; label: string; detail: string }[] = [
  { id: "agent", label: "Agent", detail: "Your persistent teammates" },
  { id: "code", label: "Code", detail: "Projects and terminals" },
  { id: "chat", label: "Chat", detail: "A conversation with no project" },
];

const PANELS = [
  { id: "dashboard", label: "Dashboard", icon: GaugeIcon, keywords: "waiting running overview" },
  { id: "decisions", label: "Decisions", icon: ShieldIcon, keywords: "approve deny waiting risk" },
  { id: "routines", label: "Routines", icon: ClockIcon, keywords: "schedule cron recurring" },
  { id: "skills", label: "Skills", icon: BookIcon, keywords: "procedure library trigger" },
] as const;

export function agentEntries(): CommandPaletteEntry[] {
  const mode = useAgentModeStore.getState();
  const roster = useAgentRosterStore.getState();
  const chats = useAgentChatStore.getState();
  const entries: CommandPaletteEntry[] = [];

  for (const entry of MODES) {
    entries.push({
      id: `mode-${entry.id}`,
      kind: "command",
      group: "Mode",
      label: `Go to ${entry.label}`,
      detail: entry.detail,
      hint: mode.mode === entry.id ? "current" : undefined,
      keywords: "mode switch window place agent code chat",
      icon: SparklesIcon,
      run: () => mode.setMode(entry.id),
    });
  }

  for (const agent of roster.agents) {
    const busy = (chats.chats[agent.id] ?? []).some((chat) => chats.running[chat.id]);
    entries.push({
      id: `agent-${agent.id}`,
      kind: "command",
      group: "Teammates",
      label: agent.name,
      detail: agent.brief.split("\n")[0] || undefined,
      hint: busy ? "working" : undefined,
      // Weighted only while it is working, which is the one state that makes
      // an agent the thing you were looking for.
      weight: busy ? 1 : undefined,
      accent: agent.accent || undefined,
      mono: agent.name.slice(0, 1).toUpperCase(),
      keywords: `teammate agent ${agent.engine}`,
      run: () => {
        mode.setMode("agent");
        mode.selectAgent(agent.id);
      },
    });
  }

  entries.push({
    id: "agent-new-chat",
    kind: "command",
    group: "Teammates",
    label: "New chat",
    detail: "With whichever surface is open",
    hint: "Ctrl N",
    keywords: "start conversation fresh blank",
    icon: PlusIcon,
    run: () => {
      const owner = mode.mode === "chat" ? null : mode.agentId;
      if (mode.mode !== "chat" && !owner) return;
      void chats.newChat(owner, "claude").then((chat) => chat && mode.selectChat(chat.id));
    },
  });

  for (const panel of PANELS) {
    entries.push({
      id: `agent-panel-${panel.id}`,
      kind: "command",
      group: "Agent",
      label: panel.label,
      hint: mode.panel === panel.id && mode.mode === "agent" ? "current" : undefined,
      keywords: `agent mode ${panel.keywords}`,
      icon: panel.icon,
      run: () => {
        mode.setMode("agent");
        mode.openPanel(panel.id);
      },
    });
  }

  // Every chat the app has loaded, whichever agent owns it. Not a search of
  // the database — `ChatSearch` does that, over what was said. This is the
  // list already on screen, made reachable without the mouse.
  for (const [owner, list] of Object.entries(chats.chats)) {
    for (const chat of list) {
      entries.push({
        id: `chat-${chat.id}`,
        kind: "session",
        group: "Chats",
        label: chat.title || "New chat",
        detail: roster.agents.find((agent) => agent.id === owner)?.name ?? "Detached",
        hint: chats.running[chat.id] ? "working" : relativeTime(chat.updatedMs),
        keywords: "chat conversation transcript",
        run: () => {
          mode.setMode(chat.agentId ? "agent" : "chat");
          if (chat.agentId) mode.selectAgent(chat.agentId);
          mode.selectChat(chat.id);
          void chats.openChat(chat.id);
        },
      });
    }
  }

  return entries;
}
