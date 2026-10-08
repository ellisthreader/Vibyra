/** Shared native approval freshness checks. The server remains the execution authority. */
interface ReviewTool {
  id: string; operation: string; integration?: string | null; account?: string | null;
  connectionId?: string | null; containsSecret?: boolean; expiresAt: number;
  approval?: { state: string; fingerprint: string; arguments: Record<string, unknown>; answer?: string | null } | null;
}
interface ReviewTurn { id: string; chatId: string; status: string; tools?: ReviewTool[] }
export const REVIEW_CHANGED = 'This action changed or expired. Review the current details before deciding.';

export function decisionAvailable(tool: ReviewTool, turn: ReviewTurn, now = Date.now()) {
  return turn.status === 'waiting' && tool.approval?.state === 'pending' && !tool.approval.answer
    && Boolean(tool.approval.fingerprint) && Number.isFinite(tool.expiresAt) && tool.expiresAt * 1000 > now;
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every(key => Object.hasOwn(y, key) && equal(x[key], y[key]));
}
/** Bind the refreshed response to the exact run, conversation and displayed action. */
export function reviewedApproval(turn: ReviewTurn, tool: ReviewTool, fresh: ReviewTurn, now = Date.now()) {
  const current = fresh.tools?.find(item => item.id === tool.id);
  if (fresh.id !== turn.id || fresh.chatId !== turn.chatId || !current || !decisionAvailable(current, fresh, now)
    || !decisionAvailable(tool, turn, now) || current.approval?.fingerprint !== tool.approval?.fingerprint
    || current.operation !== tool.operation || (current.integration ?? null) !== (tool.integration ?? null)
    || (current.account ?? null) !== (tool.account ?? null) || (current.connectionId ?? null) !== (tool.connectionId ?? null)
    || Boolean(current.containsSecret) !== Boolean(tool.containsSecret)
    || !equal(current.approval?.arguments, tool.approval?.arguments)) throw new Error(REVIEW_CHANGED);
  return current;
}
/** A failed or unrelated read cannot clear an uncertain decision. This never submits an action. */
export async function refreshDecision(turn: ReviewTurn, read: (id: string) => Promise<ReviewTurn>, refresh: () => Promise<void>) {
  const fresh = await read(turn.id);
  if (fresh.id !== turn.id || fresh.chatId !== turn.chatId) throw new Error(REVIEW_CHANGED);
  await refresh();
}
export function approvalExpiry(expiresAt: number) {
  return Number.isFinite(expiresAt) && expiresAt > 0
    ? `Approval expires ${new Date(expiresAt * 1000).toLocaleString()}` : 'Approval expiry unavailable';
}
