import type { AgentItem } from '../../ipc/sharedChats';

export type ChatRow =
  | { kind: 'message' | 'request' | 'result'; id: string; turnId: string; item: AgentItem }
  | { kind: 'steps'; id: string; turnId: string; items: AgentItem[] }
  | { kind: 'plan'; id: string; turnId: string; item: AgentItem };

/**
 * The transcript as people read it on the phone: what the agent says stays on
 * the page, the steps between two things it says gather into one group, and a
 * turn's plan is one checklist shown where it last changed.
 */
export function chatRows(items: AgentItem[]): ChatRow[] {
  const latestPlan = new Map<string, string>();
  for (const item of items) if (item.kind === 'activity' && item.category === 'plan') latestPlan.set(item.turnId, item.id);
  const rows: ChatRow[] = [];
  for (const item of items) {
    if (item.kind === 'activity' && item.category === 'plan') {
      if (latestPlan.get(item.turnId) === item.id) rows.push({ kind: 'plan', id: `plan:${item.turnId}`, turnId: item.turnId, item });
      continue;
    }
    if (item.kind === 'activity') {
      const previous = rows.at(-1);
      if (previous?.kind === 'steps' && previous.turnId === item.turnId) previous.items.push(item);
      else rows.push({ kind: 'steps', id: `steps:${item.id}`, turnId: item.turnId, items: [item] });
      continue;
    }
    // An empty provider message precedes its first token; it is not a blank reply.
    if (item.kind === 'message' && item.role !== 'user' && !item.text?.trim()) continue;
    if (item.kind === 'result' && !['completed', 'failed', 'interrupted'].includes(item.status)) continue;
    rows.push({ kind: item.kind === 'message' ? 'message' : item.kind === 'result' ? 'result' : 'request', id: item.id, turnId: item.turnId, item });
  }
  return rows;
}

export interface TurnStats { duration: number | null; files: number; added: number; removed: number }
/** How long a turn took and what it changed, counting only reported completed edits. */
export function turnStats(items: AgentItem[], turnId: string): TurnStats {
  const turn = items.filter(item => item.turnId === turnId);
  const changes = turn.filter(item => item.category === 'fileChange' && item.status === 'completed').flatMap(item => item.changes ?? []);
  const result = turn.find(item => item.kind === 'result');
  const starts = turn.map(item => Date.parse(item.startedAt ?? '')).filter(Number.isFinite);
  const end = Date.parse(result?.updatedAt ?? '');
  const stepTime = turn.reduce((sum, item) => sum + (item.kind === 'activity' ? item.durationMs ?? 0 : 0), 0);
  const duration = result?.durationMs ?? (starts.length && Number.isFinite(end) ? Math.max(0, end - Math.min(...starts)) : stepTime || null);
  return {
    duration, files: new Set(changes.map(change => change.path)).size,
    added: changes.reduce((sum, change) => sum + (change.added ?? 0), 0),
    removed: changes.reduce((sum, change) => sum + (change.removed ?? 0), 0),
  };
}

/** Where live feedback sits: on the running step group, the streaming reply, or a "Thinking" footer. */
export function liveOwner(rows: ChatRow[], working: boolean, turnId?: string | null) {
  if (!working || rows.some(row => row.kind === 'request' && ['pending', 'resolving'].includes(row.item.status))) return null;
  const latest = rows.at(-1);
  if (latest && latest.turnId === (turnId ?? latest.turnId)) {
    if (latest.kind === 'result') return null;
    if (latest.kind === 'steps' && latest.items.some(item => item.status === 'running')) return latest.id;
    if (latest.kind === 'message' && latest.item.role === 'assistant' && latest.item.status === 'running') return latest.id;
  }
  return 'footer';
}
