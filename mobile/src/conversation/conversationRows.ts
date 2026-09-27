import type { ConversationActivity, ConversationItem } from './types';
export type ConversationRow =
  | Exclude<ConversationItem, ConversationActivity>
  | { kind: 'activities'; id: string; turnId: string; items: ConversationActivity[] }
  | { kind: 'plan'; id: string; turnId: string; item: ConversationActivity };

/**
 * The transcript as people read it in the Codex and Claude apps: what the agent
 * says stays on the page, and the steps between two things it says gather into
 * one group. Decisions and answers stay in order. A turn's plan is one checklist,
 * shown where it last changed.
 */
export function conversationRows(items: ConversationItem[]): ConversationRow[] {
  const latestPlan = new Map<string, string>();
  for (const item of items)
    if (item.kind === 'activity' && item.source?.category === 'plan') latestPlan.set(item.turnId, item.id);
  const rows: ConversationRow[] = [];
  for (const item of items) {
    if (item.kind === 'activity' && item.source?.category === 'plan') {
      if (latestPlan.get(item.turnId) === item.id)
        rows.push({ kind: 'plan', id: `plan:${item.turnId}`, turnId: item.turnId, item });
      continue;
    }
    if (item.kind !== 'activity') {
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
