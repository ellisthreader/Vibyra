import type { ConversationRow, WorkItem } from './conversationRows';
import type { ConversationStatus } from './types';

/** One owner for live feedback, even when replay leaves several items marked running. */
export function generationPresentation(rows: ConversationRow[], status: ConversationStatus, connected: boolean, turnId?: string | null) {
  if (!connected || status !== 'working' || rows.some(row =>
    (row.kind === 'permission' || row.kind === 'question') && ['pending', 'resolving'].includes(row.status))) return null;
  const latest = rows.at(-1);
  const activeTurn = turnId ?? latest?.turnId;
  if (latest && latest.turnId === activeTurn) {
    if (latest.kind === 'result') return null;
    if (latest.kind === 'activities') return { owner: latest.id, label: workLabel(latest.items) };
    if (latest.kind === 'message' && latest.role === 'assistant' && latest.source?.status === 'running') {
      return { owner: latest.id, label: 'Writing response' };
    }
  }
  return { owner: 'footer', label: 'Thinking' };
}

export function workLabel(items: WorkItem[]) {
  const latest = items.findLast(item => item.kind === 'activity');
  return latest?.kind === 'activity' && latest.status === 'running' ? latest.title : 'Thinking';
}

export function workHistoryLabel(items: WorkItem[]) {
  const activities = items.filter(item => item.kind === 'activity');
  if (activities.some(item => item.status === 'failed')) return 'Work needs attention';
  if (activities.some(item => item.status === 'interrupted')) return 'Work stopped';
  if (activities.some(item => item.status === 'declined')) return 'Work declined';
  // A stale running item is not evidence that the operation completed.
  if (activities.some(item => item.status === 'running')) return 'Work details';
  return activities.length === 1 && activities[0].source?.category === 'reasoning' ? 'Thought process' : 'Work details';
}
