import type { ConversationActivity, ConversationItem, ConversationMessage } from './types';
export type WorkItem = ConversationActivity | ConversationMessage;
export type ConversationRow =
  | Exclude<ConversationItem, ConversationActivity>
  | { kind: 'activities'; id: string; turnId: string; items: WorkItem[] };

/** Fold commentary followed by work into its disclosure. Decisions and answers stay in order. */
export function conversationRows(items: ConversationItem[]): ConversationRow[] {
  const rows: ConversationRow[] = [];
  const commentary = new Set<string>();
  let workTurn: string | undefined;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.kind === 'activity') workTurn = item.turnId;
    else if (item.kind === 'message' && item.role === 'assistant' && workTurn === item.turnId)
      commentary.add(item.id);
    else workTurn = undefined;
  }

  for (const item of items) {
    if (item.kind !== 'activity' && !(item.kind === 'message' && commentary.has(item.id))) {
      // An empty provider message precedes its first token; it should not create a blank response.
      if (item.kind !== 'message' || item.role === 'user' || item.text.trim()) rows.push(item);
      continue;
    }
    const previous = rows.at(-1);
    let group =
      previous?.kind === 'activities' && previous.turnId === item.turnId ? previous : undefined;
    if (!group) {
      group = { kind: 'activities', id: `activities:${item.id}`, turnId: item.turnId, items: [] };
      rows.push(group);
    }
    group.items.push(item);
  }
  return rows;
}
