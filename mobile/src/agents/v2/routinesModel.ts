/**
 * Agent V2 routines (schedules) view-model: docs/agent-v2-api-contract.md §6b. Pure — no
 * runtime imports — so the Mac teammates UI imports it too. The server computes every time;
 * this file only shapes forms and words. Drafts are never converted: a draft becomes a
 * schedule only when the person saves one, and the draft text itself is left untouched.
 */
export type Recurrence =
  | { type: 'once'; date: string; time: string }
  | { type: 'daily'; time: string }
  | { type: 'weekly'; weekdays: number[]; time: string };
export interface Schedule {
  runtimeId?: string | null; executionTarget?: 'local' | 'cloud'; accountLabel?: string | null;
  id: string; agentId: string; title: string | null; prompt: string; timezone: string; recurrence: Recurrence;
  description: string; revision: number; paused: boolean; nextRunAt: string | null; nextRunLocal: string | null;
  catchUpMinutes: number; overlap: 'skip' | 'queue';
}
export interface Occurrence {
  id: string; intendedAt: string; state: string; reason: string | null; runId: string | null; runState: string | null;
}
export interface ScheduleBody { runtimeId?: string; agentId: string; prompt: string; timezone: string; recurrence: Recurrence; title?: string }
export interface Preview { description: string; next: { at: string; local: string }[] }
export interface Capabilities { enabled: boolean; routines: boolean; triggers: boolean; triggerKinds: string[] }
export const NO_CAPABILITIES: Capabilities = { enabled: false, routines: false, triggers: false, triggerKinds: [] };

/** Any malformed answer reports everything off, so the UI keeps today's drafts. */
export function parseCapabilities(data: unknown): Capabilities {
  const d = (data ?? {}) as Record<string, unknown>;
  return { enabled: d.enabled === true, routines: d.routines === true, triggers: d.triggers === true,
    triggerKinds: Array.isArray(d.triggerKinds) ? d.triggerKinds.filter((k): k is string => typeof k === 'string') : [] };
}

/** ISO weekdays, 1 = Monday. */
export const WEEKDAYS = [
  { day: 1, short: 'Mon', name: 'Monday' }, { day: 2, short: 'Tue', name: 'Tuesday' },
  { day: 3, short: 'Wed', name: 'Wednesday' }, { day: 4, short: 'Thu', name: 'Thursday' },
  { day: 5, short: 'Fri', name: 'Friday' }, { day: 6, short: 'Sat', name: 'Saturday' }, { day: 7, short: 'Sun', name: 'Sunday' },
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ScheduleDraft {
  type: Recurrence['type']; date: string; time: string; weekdays: number[]; timezone: string; prompt: string;
}
const pad = (n: number) => String(n).padStart(2, '0');
export function deviceTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
/** A calm default: tomorrow at 09:00 in the device zone, repeating daily. */
export function newScheduleDraft(prompt: string, timezone = deviceTimezone(), now = new Date()): ScheduleDraft {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const iso = ((tomorrow.getDay() + 6) % 7) + 1;
  return { type: 'daily', time: '09:00', weekdays: [iso], timezone, prompt,
    date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}` };
}
export function recurrenceOf(d: ScheduleDraft): Recurrence {
  if (d.type === 'once') return { type: 'once', date: d.date.trim(), time: d.time.trim() };
  if (d.type === 'weekly') return { type: 'weekly', weekdays: [...d.weekdays].sort((a, b) => a - b), time: d.time.trim() };
  return { type: 'daily', time: d.time.trim() };
}
/** The first thing that keeps this draft from being scheduled, in words; null when it can be previewed. */
export function scheduleProblem(d: ScheduleDraft): string | null {
  if (!d.prompt.trim()) return 'Describe what this routine should do.';
  if (d.prompt.length > 20000) return 'Keep the routine under 20,000 characters.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time.trim())) return 'Use a 24-hour time like 09:00.';
  if (d.type === 'once' && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d.date.trim())) return 'Use a date like 2026-10-01.';
  if (d.type === 'weekly' && !d.weekdays.length) return 'Choose at least one day.';
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(d.timezone.trim()) || d.timezone.length > 64)
    return 'Use a timezone like Europe/London.';
  return null;
}
export const previewKey = (d: ScheduleDraft) => JSON.stringify({ timezone: d.timezone.trim(), recurrence: recurrenceOf(d) });
export function scheduleBody(agentId: string, d: ScheduleDraft): ScheduleBody {
  return { agentId, prompt: d.prompt, timezone: d.timezone.trim(), recurrence: recurrenceOf(d) };
}

/** "Thu 1 Oct, 09:00" from a local ISO string, read as the wall clock the server sent (no conversion). */
export function formatLocal(local: string | null | undefined, today?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return '';
  const [, y, mo, d, h, mi] = m;
  const date = `${y}-${mo}-${d}`;
  if (today && date === today) return `today, ${h}:${mi}`;
  if (today && date === addDays(today, 1)) return `tomorrow, ${h}:${mi}`;
  const weekday = WEEKDAYS[(new Date(Date.UTC(+y!, +mo! - 1, +d!)).getUTCDay() + 6) % 7]!.short;
  return `${weekday} ${Number(d)} ${MONTHS[Number(mo) - 1]}, ${h}:${mi}`;
}
function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
/** Today's date (YYYY-MM-DD) in an IANA zone, or undefined when the zone is unknown here. */
export function todayIn(timezone: string, now = new Date()): string | undefined {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return undefined; }
}
/** A UTC instant shown as local wall-clock time in the schedule's zone. */
export function formatInstant(iso: string, timezone: string): string {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
    return formatLocal(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
  } catch { return iso.slice(0, 16).replace('T', ' ') + ' UTC'; }
}

/** "Active · next Thu 1 Oct, 09:00", "Paused" or "Done · no more runs". */
export function scheduleLabel(s: Pick<Schedule, 'paused' | 'nextRunLocal' | 'timezone'>, now = new Date()): string {
  if (s.paused) return 'Paused';
  const next = formatLocal(s.nextRunLocal, todayIn(s.timezone, now));
  return next ? `Active · next ${next}` : 'Done · no more runs';
}
/** A draft is "scheduled" only when a saved schedule carries its exact text; nothing converts it. */
export function draftState(text: string, schedules: Pick<Schedule, 'prompt'>[]): 'draft' | 'scheduled' {
  const t = text.trim();
  return t && schedules.some(s => s.prompt.trim() === t) ? 'scheduled' : 'draft';
}

export type Tone = 'ok' | 'muted' | 'warn' | 'error';
const REASONS: Record<string, string> = {
  previous_run_active: 'the last run was still going', schedule_paused: 'paused', schedule_edited: 'the routine changed',
  schedule_deleted: 'the routine was deleted', computer_offline: 'the selected computer stayed offline', missed_window: 'missed its window',
  runtime_required: 'no computer is set up to run it', plan_required: 'needs Vibyra Pro', agents_v2_unavailable: 'teammate tasks were off',
  agent_archived: 'the teammate is archived', rate_limited: 'hourly cap reached', paused: 'paused', not_granted: 'access was removed',
  grant_revoked: 'access was removed',
};
export const reasonText = (reason: string | null) => reason ? REASONS[reason] ?? reason.replace(/_/g, ' ') : '';
const withReason = (label: string, reason: string | null) => (reason ? `${label} · ${reasonText(reason)}` : label);
/** One history row's words: ran / skipped / waiting for Mac / expired, with the reason. */
export function occurrenceLabel(o: Pick<Occurrence, 'state' | 'reason' | 'runState'>): { label: string; tone: Tone } {
  switch (o.state) {
    case 'admitted':
      if (o.runState === 'waiting_for_computer') return { label: 'Waiting for the selected computer', tone: 'warn' };
      if (o.runState === 'failed') return { label: 'Ran · failed', tone: 'error' };
      if (o.runState === 'cancelled') return { label: 'Ran · stopped', tone: 'muted' };
      if (!o.runState || o.runState === 'completed') return { label: 'Ran', tone: 'ok' };
      return { label: 'Running', tone: 'ok' };
    case 'pending': return { label: 'Starting', tone: 'muted' };
    case 'waiting': return { label: 'Waiting for the selected computer', tone: 'warn' };
    case 'skipped': return { label: withReason('Skipped', o.reason), tone: 'muted' };
    case 'expired': return { label: withReason('Expired', o.reason), tone: 'warn' };
    case 'failed': return { label: withReason('Failed', o.reason), tone: 'error' };
    default: return { label: o.state, tone: 'muted' };
  }
}
