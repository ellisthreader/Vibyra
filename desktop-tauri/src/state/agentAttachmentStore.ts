import { create } from "zustand";

import type { ChatAttachment } from "../agentTypes";
import * as ipc from "../ipc/agentChats";

// What each chat has attached.
//
// A store rather than component state, which is what it was. Held in the
// composer that added them, the list disappeared the moment someone opened
// another chat — while the files stayed in the chat's folder and stayed on
// every following turn. The surface disagreed with the runtime about what the
// provider could see, which is the one thing an attachment list exists to say.
//
// Keyed by chat, because that is what the files belong to.

interface AttachmentStore {
  byChat: Record<string, ChatAttachment[]>;
  error: string | null;
  load: (chatId: string) => Promise<void>;
  add: (chatId: string, path: string) => Promise<void>;
  remove: (chatId: string, attachmentId: string) => Promise<void>;
  clear: () => void;
}

export const useAgentAttachmentStore = create<AttachmentStore>((set, get) => ({
  byChat: {},
  error: null,

  load: async (chatId) => {
    const files = await ipc.chatAttachments(chatId).catch(() => []);
    set((state) => ({ byChat: { ...state.byChat, [chatId]: files } }));
  },

  add: async (chatId, path) => {
    try {
      const attachment = await ipc.attachToChat(chatId, path);
      set((state) => ({
        byChat: { ...state.byChat, [chatId]: [...(state.byChat[chatId] ?? []), attachment] },
        error: null,
      }));
    } catch (error) {
      // Worth surfacing verbatim: the native side refuses a directory and
      // anything past the size cap, and both messages say what to do instead.
      set({ error: String(error) });
    }
  },

  remove: async (chatId, attachmentId) => {
    try {
      await ipc.removeAttachment(chatId, attachmentId);
      set({ error: null });
    } catch (error) {
      set({ error: String(error) });
    }
    // Reloaded rather than filtered locally: a removal that failed natively
    // must not leave the list claiming the file is gone.
    await get().load(chatId);
  },

  clear: () => set({ byChat: {}, error: null }),
}));
