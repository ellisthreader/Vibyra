import { create } from "zustand";
import type { PermissionMode } from "../agentTypes";

interface Draft { text: string; permission: PermissionMode | null; accountId: string | null }
export const EMPTY_DRAFT: Draft = { text: "", permission: null, accountId: null };
interface DraftStore {
  drafts: Record<string, Draft>;
  change: (chat: string, change: Partial<Draft>) => void;
  consume: (chat: string, prompt: string) => void;
  clear: () => void;
}
export const useAgentDraftStore = create<DraftStore>((set) => ({
  drafts: {},
  change: (chat, change) => set((state) => ({
    drafts: { ...state.drafts, [chat]: { ...(state.drafts[chat] ?? EMPTY_DRAFT), ...change } },
  })),
  consume: (chat, prompt) => set((state) => {
    const draft = state.drafts[chat];
    if (draft?.text.trim() !== prompt) return state;
    return { drafts: { ...state.drafts, [chat]: { ...draft, text: "" } } };
  }),
  clear: () => set({ drafts: {} }),
}));
