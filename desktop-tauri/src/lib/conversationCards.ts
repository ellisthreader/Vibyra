/** What the rule needs of a conversation: which one, and whether it is live. */
export interface ConversationCard {
  id: string;
  status: string;
}

/** Open cards are explicitly persisted across runs. Historical conversations
 * stay closed unless selected; missing IDs in a stale poll must not erase a
 * just-opened card. Only an explicit dismissal removes one. */
export function openConversationCards(
  sessions: ConversationCard[],
  open: string[],
  dismissed: string[],
): string[] {
  const up = [...open];
  for (const session of sessions) {
    if (session.status === "running" && !up.includes(session.id)) up.push(session.id);
  }
  return up.filter((id) => !dismissed.includes(id));
}

/**
 * The terminals list, split into what is open and what is history.
 *
 * The engine keeps every conversation a project has ever had, and hands the
 * whole list over on every read. Drawn straight into the column, that list
 * grows by one row per chat, for ever — a day with four terminals open reads
 * as twenty-four, because a finished chat from last week is drawn exactly like
 * the one running now.
 *
 * So the same set the grid and the phone draw is the set this column calls a
 * terminal: a conversation with a card up, or one still running with its card
 * closed. Everything else is an earlier chat, kept under its own heading,
 * where opening one still puts its transcript back on the grid.
 */
export function splitConversationRows<T extends ConversationCard>(
  sessions: T[],
  open: string[],
): { live: T[]; earlier: T[] } {
  const live: T[] = [];
  const earlier: T[] = [];
  for (const session of sessions) {
    (open.includes(session.id) || session.status === "running" ? live : earlier).push(session);
  }
  return { live, earlier };
}
