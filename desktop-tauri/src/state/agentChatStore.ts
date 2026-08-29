import { create } from "zustand";

import type { AgentChat, ChatEventRow, Engine, PermissionMode } from "../agentTypes";
import * as ipc from "../ipc/agentChats";
import {
  emptyTranscript,
  reduce,
  reduceAll,
  type TranscriptState,
} from "../lib/agentEventReducer";

// Chats and their transcripts.
//
// One decision shapes this file: **streamed deltas do not go through Zustand.**
// A model producing text emits dozens of them a second, and a store update per
// delta is dozens of React renders a second beside a live xterm — the exact
// regression the terminal renderer work already fought. Deltas land in a
// buffer outside React and are flushed once per animation frame, which is the
// same contract `terminalBus` uses for PTY output.

interface ChatStore {
  chats: Record<string, AgentChat[]>;
  transcripts: Record<string, TranscriptState>;
  /** Chats with a turn in flight, by id. */
  running: Record<string, boolean>;
  error: string | null;
  loadChats: (agentId: string | null) => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  newChat: (agentId: string | null, engine: Engine) => Promise<AgentChat | null>;
  send: (chatId: string, prompt: string, permission?: PermissionMode) => Promise<void>;
  cancel: (chatId: string) => Promise<void>;
  amend: (
    chatId: string,
    agentId: string | null,
    change: { title?: string; pinned?: boolean; archived?: boolean },
  ) => Promise<void>;
  remove: (chatId: string, agentId: string | null) => Promise<void>;
  adoptRunning: () => Promise<void>;
  clear: () => void;
}

/** Pending rows per chat, held outside React until the next frame. */
const pending = new Map<string, ChatEventRow[]>();
let frame = 0;

function queue(chatId: string, row: ChatEventRow): void {
  const rows = pending.get(chatId);
  if (rows) rows.push(row);
  else pending.set(chatId, [row]);
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    flush();
  });
}

function flush(): void {
  if (pending.size === 0) return;
  const batches = [...pending.entries()];
  pending.clear();
  useAgentChatStore.setState((state) => {
    const transcripts = { ...state.transcripts };
    for (const [chatId, rows] of batches) {
      transcripts[chatId] = rows.reduce(reduce, transcripts[chatId] ?? emptyTranscript());
    }
    return { transcripts };
  });
}

export const useAgentChatStore = create<ChatStore>((set, get) => ({
  chats: {},
  transcripts: {},
  running: {},
  error: null,

  loadChats: async (agentId) => {
    const key = agentId ?? "detached";
    const chats = await ipc.listChats(agentId).catch(() => []);
    set((state) => ({ chats: { ...state.chats, [key]: chats } }));
  },

  openChat: async (chatId) => {
    if (get().transcripts[chatId]) return;
    const rows = await ipc.chatEvents(chatId).catch(() => []);
    set((state) => ({ transcripts: { ...state.transcripts, [chatId]: reduceAll(rows) } }));
  },

  newChat: async (agentId, engine) => {
    try {
      const chat = await ipc.createChat({ agentId, engine });
      const key = agentId ?? "detached";
      set((state) => ({
        chats: { ...state.chats, [key]: [chat, ...(state.chats[key] ?? [])] },
        transcripts: { ...state.transcripts, [chat.id]: emptyTranscript() },
        error: null,
      }));
      return chat;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  send: async (chatId, prompt, permission) => {
    if (get().running[chatId]) return;
    set((state) => ({ running: { ...state.running, [chatId]: true }, error: null }));
    try {
      await ipc.sendTurn({ chatId, prompt, permission }, (row) => queue(chatId, row));
    } catch (error) {
      set({ error: String(error) });
    } finally {
      // Flushed before the flag clears, so the last events of a turn are on
      // screen by the time the composer becomes writable again.
      flush();
      set((state) => ({ running: { ...state.running, [chatId]: false } }));
    }
  },

  cancel: async (chatId) => {
    await ipc.cancelTurn(chatId).catch(() => false);
  },

  amend: async (chatId, agentId, change) => {
    try {
      await ipc.amendChat(chatId, change);
    } catch (error) {
      set({ error: String(error) });
    }
    await get().loadChats(agentId);
  },

  remove: async (chatId, agentId) => {
    await ipc.deleteChat(chatId).catch((error) => set({ error: String(error) }));
    set((state) => {
      const transcripts = { ...state.transcripts };
      delete transcripts[chatId];
      return { transcripts };
    });
    await get().loadChats(agentId);
  },

  // After a reload the channels are gone but the turns are not: the native
  // side is still running them. This is what stops a composer offering to send
  // into a chat that is already working.
  adoptRunning: async () => {
    const busy = await ipc.runningChats().catch(() => []);
    set({ running: Object.fromEntries(busy.map((id) => [id, true])) });
  },

  clear: () => {
    pending.clear();
    set({ chats: {}, transcripts: {}, running: {}, error: null });
  },
}));
