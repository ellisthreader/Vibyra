import type { AgentItem } from '../state/conversationTypes';
import { durationLabel } from './inspection';

/** Counts reported completed edits, never unrelated workspace changes. */
export function turnSummary(items: AgentItem[], turnId: string) {
  const turn = items.filter(item => item.turnId === turnId);
  const changes = turn.filter(item => item.category === 'fileChange' && item.status === 'completed').flatMap(item => item.changes ?? []);
  const result = turn.find(item => item.kind === 'result');
  const start = turn.map(item => Date.parse(item.startedAt ?? '')).filter(Number.isFinite);
  const end = Date.parse(result?.updatedAt ?? '');
  const duration = result?.durationMs ?? (start.length && Number.isFinite(end) ? Math.max(0, end - Math.min(...start)) : null);
  const files = new Set(changes.map(change => change.path)).size;
  const added = changes.reduce((sum, change) => sum + change.added, 0);
  const removed = changes.reduce((sum, change) => sum + change.removed, 0);
  return [duration == null ? '' : durationLabel(duration), files ? `${files} ${files === 1 ? 'file' : 'files'} · +${added} −${removed}` : ''].filter(Boolean).join(' · ');
}

/** The activity disclosure already owns the live label. Only show a fallback without it. */
export function hasLiveActivity(items: AgentItem[]) {
  const latestTurn = items.at(-1)?.turnId;
  return items.some(item => item.turnId === latestTurn && item.kind === 'activity' && item.status === 'running');
}
