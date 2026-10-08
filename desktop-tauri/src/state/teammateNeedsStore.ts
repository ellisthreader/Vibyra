import { create } from "zustand";

import type { InboxItem } from "../lib/teammateRunNotifications";

// Teammate runs waiting on the person, for Needs you. Written by the inbox poll
// in useTeammateRunNotifications, which already runs for the whole session.
// `items` is what Needs you shows: the inbox minus anything cleared there.

interface TeammateNeeds {
  all: InboxItem[];
  hidden: string[];
  items: InboxItem[];
  set(items: InboxItem[]): void;
  /** Clear one from Needs you; the inbox and the approval itself are untouched. */
  hide(id: string): void;
}

const visible = (all: InboxItem[], hidden: string[]) => all.filter((item) => !hidden.includes(item.id));

export const useTeammateNeeds = create<TeammateNeeds>((set) => ({
  all: [],
  hidden: [],
  items: [],
  set: (all) => set((s) => ({ all, items: visible(all, s.hidden) })),
  hide: (id) => set((s) => { const hidden = [...s.hidden, id]; return { hidden, items: visible(s.all, hidden) }; }),
}));
