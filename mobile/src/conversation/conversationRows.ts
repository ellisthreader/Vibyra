import type { ConversationActivity, ConversationItem } from './types';
export type ConversationRow = Exclude<ConversationItem, ConversationActivity>
  | { kind: 'activities'; id: string; turnId: string; items: ConversationActivity[] };

/** Keep one stable activity row per turn; full details remain in event order. */
export function conversationRows(items: ConversationItem[]): ConversationRow[] {
  const rows: ConversationRow[] = [];
  const groups = new Map<string, Extract<ConversationRow, { kind: 'activities' }>>();
  for (const item of items) {
    if (item.kind !== 'activity') { rows.push(item); continue; }
    let group = groups.get(item.turnId);
    if (!group) {
      group = { kind: 'activities', id: `activities:${item.turnId}`, turnId: item.turnId, items: [] };
      groups.set(item.turnId, group); rows.push(group);
    }
    group.items.push(item);
  }
  return rows;
}
