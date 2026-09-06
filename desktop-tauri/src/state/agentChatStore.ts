import { create } from "zustand";
import type { AgentChat, ChatEventRow, Engine, PermissionMode } from "../agentTypes";
import * as ipc from "../ipc/agentChats";
import { emptyTranscript, type TranscriptState } from "../lib/agentEventReducer";
import { activeRun } from "../agentRunTypes";
import { applyRows, forgetHistory, historyBounds } from "./agentChatHistory";
import { useAgentDraftStore } from "./agentDraftStore";
import { useAgentRunStore } from "./agentRunStore";
import { useAgentModeStore } from "./agentModeStore";

interface ChatStore {
  chats: Record<string, AgentChat[]>;
  transcripts: Record<string, TranscriptState>;
  running: Record<string, boolean>;
  startedMs: Record<string, number>;
  hasEarlier: Record<string, boolean>;
  error: string | null;
  loadChats: (agent: string | null) => Promise<void>;
  openChat: (chat: string) => Promise<void>;
  loadEarlier: (chat: string) => Promise<void>;
  newChat: (agent: string | null, engine: Engine) => Promise<AgentChat | null>;
  send: (chat: string, prompt: string, permission?: PermissionMode, accountId?: string | null) => Promise<void>;
  cancel: (chat: string) => Promise<void>;
  amend: (chat: string, agent: string | null, change: { title?: string; pinned?: boolean; archived?: boolean }) => Promise<void>;
  remove: (chat: string, agent: string | null) => Promise<void>;
  adoptRunning: () => Promise<void>;
  clear: () => void;
}
let epoch = 0;
const sending = new Set<string>();
const pending = new Map<string, ChatEventRow[]>();
let frame = 0;
function flush(): void {
  const batches = [...pending]; pending.clear();
  useAgentChatStore.setState((state) => {
    const transcripts = { ...state.transcripts };
    for (const [chat, rows] of batches) transcripts[chat] = applyRows(chat, rows, transcripts[chat]);
    return { transcripts };
  });
}
function queue(chat: string, row: ChatEventRow): void {
  pending.set(chat, [...(pending.get(chat) ?? []), row]);
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; flush(); });
}

export const useAgentChatStore = create<ChatStore>((set, get) => ({
  chats: {}, transcripts: {}, running: {}, startedMs: {}, hasEarlier: {}, error: null,
  loadChats: async (agent) => {
    const current = epoch;
    try {
      const chats = await ipc.listChats(agent);
      if (current === epoch) set((state) => ({ chats: { ...state.chats, [agent ?? "detached"]: chats } }));
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  openChat: async (chat) => {
    const current = epoch;
    try {
      const loaded = Boolean(get().transcripts[chat]);
      const rows = await ipc.chatEvents(chat, undefined, loaded ? historyBounds(chat).last : undefined);
      if (current !== epoch) return;
      set((state) => ({
        transcripts: { ...state.transcripts, [chat]: applyRows(chat, rows, state.transcripts[chat]) },
        hasEarlier: { ...state.hasEarlier, [chat]: historyBounds(chat).first > 0 },
      }));
      if (loaded && rows.length === 400) await get().openChat(chat);
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  loadEarlier: async (chat) => {
    const current = epoch;
    try {
      const rows = await ipc.chatEvents(chat, historyBounds(chat).first);
      if (current !== epoch) return;
      set((state) => ({
        transcripts: { ...state.transcripts, [chat]: applyRows(chat, rows, state.transcripts[chat]) },
        hasEarlier: { ...state.hasEarlier, [chat]: rows.length > 0 && historyBounds(chat).first > 0 },
      }));
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  newChat: async (agentId, engine) => {
    const current = epoch;
    try {
      const chat = await ipc.createChat({ agentId, engine });
      if (current !== epoch) return null;
      set((state) => ({
        chats: { ...state.chats, [agentId ?? "detached"]: [chat, ...(state.chats[agentId ?? "detached"] ?? [])] },
        transcripts: { ...state.transcripts, [chat.id]: emptyTranscript() }, error: null,
      }));
      return chat;
    } catch (error) { if (current === epoch) set({ error: String(error) }); return null; }
  },
  send: async (chatId, prompt, permission, accountId) => {
    if (get().running[chatId]) return;
    const current = epoch;
    sending.add(chatId);
    set((state) => ({ running: { ...state.running, [chatId]: true }, startedMs: { ...state.startedMs, [chatId]: Date.now() }, error: null }));
    try {
      const outcome = await ipc.sendTurn({ chatId, prompt, permission, accountId }, (row) => {
        if (current !== epoch) return;
        if (row.kind === "turn.started") useAgentDraftStore.getState().consume(chatId, prompt);
        queue(chatId, row);
      });
      if (current === epoch && outcome.message) set({ error: outcome.message });
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
    finally {
      if (current === epoch) {
        sending.delete(chatId);
        flush();
        set((state) => ({ running: { ...state.running, [chatId]: false } }));
        await get().adoptRunning();
      }
    }
  },
  cancel: async (chat) => {
    const current = epoch;
    try { await ipc.cancelTurn(chat); } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  amend: async (chat, agent, change) => {
    const current = epoch;
    try { await ipc.amendChat(chat, change); if (current !== epoch) return;
      if (change.archived && useAgentModeStore.getState().chatId === chat) useAgentModeStore.getState().selectChat(null);
      await get().loadChats(agent); }
    catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  remove: async (chat, agent) => {
    const current = epoch;
    try {
      await ipc.deleteChat(chat);
      if (current !== epoch) return;
      forgetHistory(chat);
      if (useAgentModeStore.getState().chatId === chat) useAgentModeStore.getState().selectChat(null);
      set((state) => { const transcripts = { ...state.transcripts }; delete transcripts[chat]; return { transcripts }; });
      await get().loadChats(agent);
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  adoptRunning: async () => {
    const current = epoch;
    try {
      const [, busy] = await Promise.all([useAgentRunStore.getState().refresh(), ipc.runningChats()]);
      if (current !== epoch) return;
      const runs = useAgentRunStore.getState().runs.filter(activeRun);
      const ids = [...new Set([...busy, ...sending])];
      set((state) => ({ running: Object.fromEntries(ids.map((id) => [id, true])),
        startedMs: Object.fromEntries(ids.map((id) => [id, runs.find((run) => run.chatId === id)?.startedMs ?? state.startedMs[id] ?? Date.now()])) }));
    } catch (error) { if (current === epoch) set({ error: String(error) }); }
  },
  clear: () => {
    epoch += 1; pending.clear(); sending.clear(); forgetHistory();
    if (frame) cancelAnimationFrame(frame); frame = 0;
    useAgentDraftStore.getState().clear(); useAgentRunStore.getState().clear();
    set({ chats: {}, transcripts: {}, running: {}, startedMs: {}, hasEarlier: {}, error: null });
  },
}));
