import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { askSystemPrompt, buildAskContext } from "../lib/askContext";
import { useAskSpeechStore } from "./askSpeechStore";
import { readWorkspace } from "./askWorkspace";
import { useSettingsStore } from "./settingsStore";

// Ask Vibyra's conversation.
//
// One thread per project — context does not leak between codebases — and the
// briefing is rebuilt on every turn rather than cached, because the whole
// value is that it describes the workspace *now*. A pane that started asking
// thirty seconds ago must be in the answer.

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
  /** Assistant turns record what the briefing cost in privacy terms. */
  redactions?: number;
}

interface AskStore {
  threads: Record<string, AskTurn[]>;
  sending: boolean;
  error: string | null;
  /** Secrets removed from the last briefing sent, for the panel's notice. */
  lastRedactions: number;
  send: (projectId: string, text: string) => Promise<void>;
  clear: (projectId: string) => void;
}

/** Turns kept as conversation. The briefing is rebuilt outside this budget. */
const MAX_CONTEXT_TURNS = 12;

/** Identifies one assistant turn to the speech store and the panel's buttons. */
export function turnKey(projectId: string, index: number): string {
  return `${projectId}:${index}`;
}

export const useAskStore = create<AskStore>((set, get) => ({
  threads: {},
  sending: false,
  error: null,
  lastRedactions: 0,

  send: async (projectId, text) => {
    const content = text.trim();
    if (!content || get().sending) return;
    const thread = [...(get().threads[projectId] ?? []), { role: "user" as const, content }];
    set((state) => ({
      threads: { ...state.threads, [projectId]: thread },
      sending: true,
      error: null,
    }));

    try {
      const reading = await readWorkspace(content);
      const system = askSystemPrompt(buildAskContext(reading.workspace));
      const history = thread
        .slice(-MAX_CONTEXT_TURNS)
        .map(({ role, content: body }) => ({ role, content: body }));
      const reply = await invoke<string>("ai_chat", {
        messages: [{ role: "system", content: system }, ...history],
      });
      const answered: AskTurn[] = [
        ...(get().threads[projectId] ?? []),
        { role: "assistant", content: reply, redactions: reading.redactions },
      ];
      set((state) => ({
        threads: { ...state.threads, [projectId]: answered },
        lastRedactions: reading.redactions,
        sending: false,
      }));
      // Spoken from here rather than from the panel, so a reply is read aloud
      // whether the question was typed or dictated.
      if (useSettingsStore.getState().settings?.askSpeakReplies) {
        void useAskSpeechStore.getState().speak(turnKey(projectId, answered.length - 1), reply);
      }
    } catch (error) {
      set({ sending: false, error: String(error).replace(/^Error:\s*/, "") });
    }
  },

  clear: (projectId) => {
    useAskSpeechStore.getState().stop();
    set((state) => ({ threads: { ...state.threads, [projectId]: [] }, error: null }));
  },
}));
