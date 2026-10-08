/**
 * Agent v2 roster summary, per-device read markers and attachment uploads (contract §6d).
 * Pure — no runtime imports — so the Mac imports it too. On a v2 account `GET /roster` replaces
 * the v1-derived status and unread dot; names, avatars and profiles still come from v1.
 */
export interface RosterRun {
  id: string; state: string; stateReason: string | null; terminal: boolean; conversationSeq: number;
  preview: string; createdAt: string; finishedAt: string | null;
}
export interface RosterRow {
  agentId: string; name: string; archived: boolean; status: string; waitingApprovalCount: number;
  lastRun: RosterRun | null; readCursor: string | null; unread: boolean; updatedAt: string;
}
const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function parseRoster(raw: unknown): RosterRow[] | null {
  const d = raw as Record<string, any> | null;
  if (!d || !Array.isArray(d.teammates)) return null;
  return d.teammates.filter(t => t && typeof t.agentId === 'string').map((t): RosterRow => {
    const r = t.lastRun;
    return {
      agentId: t.agentId, name: String(t.name ?? ''), archived: t.archived === true, status: String(t.status ?? 'idle'),
      waitingApprovalCount: Math.max(0, Number(t.waitingApprovalCount) || 0),
      lastRun: r && typeof r.id === 'string' ? { id: r.id, state: String(r.state ?? ''), stateReason: text(r.stateReason), terminal: r.terminal === true,
        conversationSeq: Number(r.conversationSeq) || 0, preview: String(r.preview ?? ''), createdAt: String(r.createdAt ?? ''), finishedAt: text(r.finishedAt) } : null,
      readCursor: typeof t.readCursor === 'string' && /^[a-f0-9]{64}$/.test(t.readCursor) ? t.readCursor : null,
      unread: t.unread === true, updatedAt: String(t.updatedAt ?? ''),
    };
  });
}

/** The v1 status words the roster already draws, plus the states only v2 runs reach. */
export const STATUS_WORDS: Record<string, string> = {
  needs_approval: 'Needs your approval', queued: 'Getting ready', running: 'Working', waiting: 'Working with connected services',
  waiting_for_tool: 'Working on your computer', computer_offline: 'Waiting for your computer', reconciling: 'Checking outcome',
  cancelled: 'Stopped', failed: 'Task interrupted', completed: 'Finished', idle: 'Ready',
  needs_signin: 'Needs you to sign in', paused: 'Paused by your AI account’s limits', outcome_unknown: 'Outcome unconfirmed',
};
const FROM_RUN: Record<string, string> = {
  waiting_for_computer: 'computer_offline', starting: 'queued', waiting_for_tool: 'waiting', waiting_for_approval: 'needs_approval',
  waiting_for_signin: 'needs_signin', paused_by_limits: 'paused',
};
/** A v2 run state in the roster's status vocabulary. */
export const rosterStatus = (state: string) => FROM_RUN[state] ?? state;

interface Mergeable {
  id: string; status: string; unread?: boolean; readCursor?: string | null; pendingDecisionCount?: number; lastMessage: string; lastRunId?: string | null;
}
/**
 * v2 accounts: status, approvals waiting, unread and the read cursor come from `GET /roster`; the
 * preview line is the latest run's. A teammate the summary does not list keeps its v1 values.
 */
export function mergeRoster<T extends Mergeable>(teammates: T[], rows: RosterRow[] | null): T[] {
  if (!rows) return teammates;
  const byId = new Map(rows.map(r => [r.agentId, r]));
  return teammates.map(t => {
    const row = byId.get(t.id);
    if (!row) return t;
    return { ...t, status: rosterStatus(row.status), unread: row.unread, readCursor: row.readCursor ?? undefined,
      pendingDecisionCount: row.waitingApprovalCount, lastMessage: row.lastRun?.preview || t.lastMessage, lastRunId: row.lastRun?.id ?? t.lastRunId };
  });
}

/** `X-Vibyra-Device` must match this, and stay the same for an install. */
export const DEVICE_ID = /^[A-Za-z0-9._:-]{1,64}$/;
export const newDeviceId = (prefix: string, random: string): string => {
  const id = `${prefix}-${random}`.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64);
  return DEVICE_ID.test(id) ? id : `${prefix}-device`;
};
/** A 409 from the read route means `stale_cursor`: the latest run moved on, so refresh and mark again. */
export const isStaleCursor = (status: number | null | undefined, code?: string | null) => status === 409 && (code == null || code === 'stale_cursor');
/** Mark read only what this device has not: a current, unread cursor for the latest run. */
export const shouldMarkRead = (t: { unread?: boolean; readCursor?: string | null }, marked: string | null) =>
  Boolean(t.unread && t.readCursor && t.readCursor !== marked);

export interface UploadedAttachment { id: string; kind: 'image' | 'pdf' | 'text'; name: string; bytes: number; mimeType: string }
/** `POST /attachments` answer → the file chip's shape; an unrecognisable answer is no attachment. */
export function parseUpload(raw: unknown): UploadedAttachment | null {
  const a = (raw as Record<string, any> | null)?.attachment;
  if (!a || typeof a.id !== 'string' || !['image', 'pdf', 'text'].includes(a.kind) || typeof a.name !== 'string') return null;
  return { id: a.id, kind: a.kind, name: a.name, bytes: Math.max(0, Number(a.size) || 0), mimeType: String(a.mimeType ?? '') };
}
/** What the server accepts, checked before the bytes leave the device: ≤2 MB, photo/PDF/text. */
export const UPLOAD_LIMIT = 2 * 1024 * 1024;
const TEXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html|css|scss|jsx?|tsx?|mjs|py|rb|go|rs|java|kt|swift|php|c|h|cpp|cs|sql|sh|toml|ini|log)$/i;
export function uploadProblem(name: string, mimeType: string, bytes: number): string | null {
  if (bytes > UPLOAD_LIMIT) return 'Attach a file under 2 MB.';
  if (/^image\//.test(mimeType) || mimeType === 'application/pdf' || /^text\//.test(mimeType) || TEXT.test(name)) return null;
  return /\.(pdf|jpe?g|png|webp|heic|heif|gif)$/i.test(name) ? null : 'Attach a photo, a PDF or a text file.';
}
