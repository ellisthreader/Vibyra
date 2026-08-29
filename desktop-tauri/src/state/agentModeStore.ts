import { create } from "zustand";

import type { AppMode } from "../agentTypes";
import { useSettingsStore } from "./settingsStore";

// Which of the three places the window is in, and what is selected inside
// Agent Mode.
//
// Switching modes never unmounts Code Mode. Its terminals are long-lived PTYs
// and the panes carry live xterm instances; tearing them down to show a chat
// list would cost every one of them its renderer and its scrollback. The
// workspace is hidden with `display`, exactly as the existing project/home
// switch already does, and the native side keeps hibernating what is off
// screen.

interface AgentModeStore {
  mode: AppMode;
  /** The teammate whose rail and transcript are showing. */
  agentId: string | null;
  /** The chat open in the main surface, in whichever mode is showing. */
  chatId: string | null;
  /** Which tab of the agent surface: its chats, its skills, its settings. */
  tab: "chats" | "skills" | "settings";
  /** The non-agent panels reachable from the primary rail. */
  panel: "dashboard" | "routines" | "skills" | "decisions" | null;
  setMode: (mode: AppMode) => void;
  selectAgent: (agentId: string | null) => void;
  selectChat: (chatId: string | null) => void;
  setTab: (tab: AgentModeStore["tab"]) => void;
  openPanel: (panel: AgentModeStore["panel"]) => void;
}

export const useAgentModeStore = create<AgentModeStore>((set, get) => ({
  mode: "code",
  agentId: null,
  chatId: null,
  tab: "chats",
  panel: "dashboard",

  setMode: (mode) => {
    if (get().mode === mode) return;
    set({ mode });
    // Remembered so the next launch opens where the user left off. Failing to
    // save is not worth an error: the mode is already switched, and the cost
    // is one wrong starting screen next time.
    void useSettingsStore.getState().update({ lastMode: mode }).catch(() => {});
  },

  // Selecting a teammate clears the chat rather than carrying it across: a
  // chat belongs to exactly one agent, and showing another agent's transcript
  // under this one's name is the kind of wrong that looks like a bug in the
  // agent rather than in the UI.
  selectAgent: (agentId) =>
    set({ agentId, chatId: null, tab: "chats", panel: agentId ? null : "dashboard" }),

  selectChat: (chatId) => set({ chatId }),
  setTab: (tab) => set({ tab }),
  openPanel: (panel) => set({ panel, agentId: panel ? null : get().agentId }),
}));

/** Restores the remembered mode once settings have loaded. */
export function adoptRememberedMode(): void {
  const last = useSettingsStore.getState().settings?.lastMode;
  if (last === "agent" || last === "chat" || last === "code") {
    useAgentModeStore.setState({ mode: last });
  }
}
