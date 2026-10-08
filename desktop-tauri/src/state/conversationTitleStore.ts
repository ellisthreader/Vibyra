import { create } from 'zustand';

const KEY = 'vibyra.conversationTitles.v1';
const LIMIT = 300;

function read(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

interface ConversationTitles {
  /** Conversation id → the name taken from its work. */
  titles: Record<string, string>;
  setTitles: (next: Record<string, string>) => void;
}

/** Remembered across launches so a terminal opens already named. */
export const useConversationTitles = create<ConversationTitles>((set, get) => ({
  titles: read(),
  setTitles: next => {
    const titles = Object.fromEntries(Object.entries({ ...get().titles, ...next }).slice(-LIMIT));
    set({ titles });
    try { localStorage.setItem(KEY, JSON.stringify(titles)); } catch { /* names come back on the next pass */ }
  },
}));
