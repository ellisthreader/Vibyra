import type { ConversationRow } from './conversationRows';
import { stepLabel } from './stepLabel';
import type { ConversationActivity, ConversationStatus } from './types';

/** One owner for live feedback, even when replay leaves several items marked running. */
export function generationPresentation(
  rows: ConversationRow[],
  status: ConversationStatus,
  connected: boolean,
  turnId?: string | null,
) {
  if (
    !connected ||
    status !== 'working' ||
    rows.some(
      (row) =>
        (row.kind === 'permission' || row.kind === 'question') &&
        ['pending', 'resolving'].includes(row.status),
    )
  )
    return null;
  const latest = rows.at(-1);
  const activeTurn = turnId ?? latest?.turnId;
  if (latest && latest.turnId === activeTurn) {
    if (latest.kind === 'result') return null;
    if (latest.kind === 'activities') return { owner: latest.id, label: workLabel(latest.items) };
    if (
      latest.kind === 'message' &&
      latest.role === 'assistant' &&
      latest.source?.status === 'running'
    ) {
      return { owner: latest.id, label: 'Writing response' };
    }
  }
  return { owner: 'footer', label: 'Thinking' };
}

/** The group's running step, said the way its row says it: "Reading App.tsx". */
export function workLabel(items: ConversationActivity[]) {
  const latest = items.findLast((item) => item.status === 'running');
  if (!latest) return 'Thinking';
  const label = stepLabel(latest);
  return label.subject ? `${label.verb} ${label.subject}` : label.verb;
}
