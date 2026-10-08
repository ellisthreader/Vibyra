/** Shared, presentation-only rules. Execution authority remains on the server. */
export interface ActivityTool {
  id: string; operation: string; integration?: string | null; summary?: string | null;
  approval?: { state: string; arguments: Record<string, unknown> } | null;
}
export function activityGroups<T extends ActivityTool>(tools: T[] = []) {
  const unique = [...new Map(tools.map(tool => [tool.id, tool])).values()];
  return {
    pending: unique.filter(t => t.approval?.state === 'pending'),
    attention: unique.filter(t => ['failed', 'unknown', 'expired', 'refused'].includes(t.approval?.state ?? '')),
    routine: unique.filter(t => !['pending', 'failed', 'unknown', 'expired', 'refused'].includes(t.approval?.state ?? '')),
  };
}
export const argumentLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
// Always show all values. Unknown connector fields are still reviewable, never silently dropped.
export function approvalFields(args: Record<string, unknown>) {
  return Object.entries(args).map(([key, value]) => ({ key, label: argumentLabel(key),
    value: (key === 'attachments' ? attachmentReview(value) : null) ?? (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) }));
}
/** Reuse unchanged subtrees so streaming the last answer doesn't reparse all older replies. */
export function stableTurns<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const old = new Map(previous.map(t => [t.id, t]));
  const reconciled = next.map(turn => {
    const prior = old.get(turn.id);
    return prior && equal(prior, turn) ? prior : turn;
  });
  return reconciled.length === previous.length && reconciled.every((t, i) => t === previous[i]) ? previous : reconciled;
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every(key => Object.hasOwn(y, key) && equal(x[key], y[key]));
}

export const attachmentPrompt = (text: string) => text.trim() ? text : 'Please review the attached files.';

/** Canonical email files get a readable review; unfamiliar attachment schemas keep every raw field. */
export function attachmentReview(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  if (!value.length) return 'No attachments';
  if (!value.every(item => item && typeof item === 'object' && typeof item.name === 'string' && typeof item.mimeType === 'string'
    && typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
    && Object.keys(item).every(key => ['id', 'name', 'mimeType', 'size', 'sha256'].includes(key)))) return null;
  return value.map(item => `${item.name} · ${item.mimeType} · ${item.size.toLocaleString()} bytes`).join('\n');
}
