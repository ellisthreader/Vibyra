import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { searchMemorySources } from "../ipc/memory";
import { formatMemoryContext } from "../lib/memoryImport";
import { useMemoryStore } from "./memoryStore";
import { useSettingsStore } from "./settingsStore";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// One conversation per project — context stops leaking between codebases.

interface ChatStore {
  threads: Record<string, ChatTurn[]>;
  sending: boolean;
  error: string | null;
  send: (projectId: string, text: string) => Promise<void>;
  clear: (projectId: string) => void;
}

const MAX_CONTEXT_TURNS = 16;

async function systemPrompt(projectId: string, query: string): Promise<string> {
  const settings = useSettingsStore.getState().settings;
  const project = settings?.projects.find((p) => p.id === projectId);
  await useMemoryStore.getState().load(projectId);
  const localMemory = useMemoryStore.getState().contents[projectId] ?? "";
  const snippets = await searchMemorySources(projectId, query).catch(() => []);
  const memory = formatMemoryContext(localMemory, snippets);
  let prompt =
    "You are the Vibyra workspace assistant inside a desktop app for running AI CLI terminals. " +
    "Be concise and practical; prefer shell commands and concrete steps.";
  if (project) prompt += `\nProject: ${project.name} at ${project.root}`;
  if (memory) prompt += `\n${memory}`;
  return prompt;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  threads: {},
  sending: false,
  error: null,

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
      const context = thread.slice(-MAX_CONTEXT_TURNS);
      const prompt = await systemPrompt(projectId, content);
      const reply = await invoke<string>("ai_chat", {
        messages: [{ role: "system", content: prompt }, ...context],
      });
      set((state) => ({
        threads: {
          ...state.threads,
          [projectId]: [...(state.threads[projectId] ?? []), { role: "assistant", content: reply }],
        },
        sending: false,
      }));
    } catch (error) {
      set({ sending: false, error: String(error) });
    }
  },

  clear: (projectId) =>
    set((state) => ({ threads: { ...state.threads, [projectId]: [] }, error: null })),
}));
