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
// switch already does.
//
// Hiding it is only half the job: the mode is also an input to
// `terminalsOnScreen`, which is what demotes the grid natively. Without that
// the panes stayed at their on-screen delivery rate behind the `display:
// none`, writing into canvases nobody could see. Anything that reads `mode` to
// decide what is on screen must go through that function.

interface AgentModeStore {
  mode: AppMode;
  /** The teammate whose rail and transcript are showing. */
  agentId: string | null;
  /** The chat open in the main surface, in whichever mode is showing. */
  chatId: string | null;
  /** Which tab of the agent surface: its chats, its skills, its settings. */
  tab: "chats" | "skills" | "settings";
  /** Text to place in the composer. Edit & resend puts a past prompt back
   *  rather than making someone retype a turn that was nearly right. Carries
   *  its chat so a late arrival cannot land in a conversation someone has
   *  since moved away from. */
  draft: { chatId: string; text: string } | null;
  /** The skill the library should open expanded — set by an Applied pill so a
   *  turn can be traced to the procedure that shaped it. */
  skillId: string | null;
  /** The non-agent panels reachable from the primary rail. */
  panel: "dashboard" | "routines" | "skills" | "decisions" | null;
  setMode: (mode: AppMode) => void;
  selectAgent: (agentId: string | null) => void;
  selectChat: (chatId: string | null) => void;
  setTab: (tab: AgentModeStore["tab"]) => void;
  setDraft: (draft: AgentModeStore["draft"]) => void;
  openSkill: (skillId: string | null) => void;
  openPanel: (panel: AgentModeStore["panel"]) => void;
}

export const useAgentModeStore = create<AgentModeStore>((set, get) => ({
  mode: "code",
  agentId: null,
  chatId: null,
  tab: "chats",
  panel: "dashboard",
  draft: null,
  skillId: null,

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
  setDraft: (draft) => set({ draft }),
  openSkill: (skillId) => set({ skillId }),
  openPanel: (panel) => set({ panel, agentId: panel ? null : get().agentId }),
}));

/** Restores the remembered mode once settings have loaded. */
export function adoptRememberedMode(): void {
  const last = useSettingsStore.getState().settings?.lastMode;
  if (last === "agent" || last === "chat" || last === "code") {
    useAgentModeStore.setState({ mode: last });
  }
}
