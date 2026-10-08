/**
 * Agent v2 activity feed (contract §6d `GET /activity`): every tool receipt across the person's
 * teammates. Pure — no runtime imports — so the Mac imports it too. Every string here came from a
 * service, so nothing is ever rendered as markup, and the only link is one that passes `safeLink`.
 */
import { providerName, toolWords } from './providerLabels';

export interface ActivityItem {
  id: string; actionId: string; runId: string; agentId: string; agentName: string; tool: string; kind: 'read' | 'write';
  provider: string | null; connectionId: string | null; accountLabel: string | null; status: string; outcome: string | null;
  actionState: string; summary: string | null; url: string | null; createdAt: string;
}
export interface ActivityPage { items: ActivityItem[]; nextCursor: string | null }
export interface ActivityFilters { provider?: string | null; agentId?: string | null; cursor?: string | null; limit?: number }

const text = (v: unknown, max = 500) => (typeof v === 'string' && v ? v.slice(0, max) : null);
export function parseActivity(raw: unknown): ActivityPage | null {
  const d = raw as Record<string, any> | null;
  if (!d || !Array.isArray(d.items)) return null;
  const cursor = d.nextCursor;
  return {
    items: d.items.filter(i => i && typeof i.id === 'string' && typeof i.tool === 'string' && typeof i.runId === 'string' && typeof i.agentId === 'string')
      .map((i): ActivityItem => ({
        id: i.id, actionId: String(i.actionId ?? ''), runId: i.runId, agentId: i.agentId, agentName: text(i.agentName, 80) ?? 'Teammate',
        tool: i.tool, kind: i.kind === 'write' ? 'write' : 'read', provider: text(i.provider, 60), connectionId: text(i.connectionId, 60),
        accountLabel: text(i.accountLabel, 200), status: String(i.status ?? ''), outcome: text(i.outcome, 40),
        actionState: String(i.actionState ?? ''), summary: text(i.summary, 400), url: text(i.url, 2048), createdAt: String(i.createdAt ?? '') })),
    nextCursor: typeof cursor === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(cursor) ? cursor : null,
  };
}

/** The cursor is opaque to clients; the query is built only from values that pass these shapes. */
const PROVIDER = /^[a-z][a-z0-9_]{1,59}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, CURSOR = /^[A-Za-z0-9_-]{1,200}$/;
/** `agents/v2/activity?limit=30&provider=gmail&agentId=…&cursor=…` — fixed order, each part validated or dropped. */
export function activityPath(f: ActivityFilters = {}): string {
  const limit = Math.min(100, Math.max(1, Math.trunc(f.limit ?? 30)));
  const parts = [`limit=${limit}`];
  if (f.provider && PROVIDER.test(f.provider)) parts.push(`provider=${f.provider}`);
  if (f.agentId && UUID.test(f.agentId)) parts.push(`agentId=${f.agentId}`);
  if (f.cursor && CURSOR.test(f.cursor)) parts.push(`cursor=${f.cursor}`);
  return `agents/v2/activity?${parts.join('&')}`;
}
/** Next page appended, a receipt never listed twice (a retried page may overlap). */
export function mergeActivity(old: ActivityItem[], next: ActivityItem[]): ActivityItem[] {
  const seen = new Set(old.map(i => i.id));
  return [...old, ...next.filter(i => !seen.has(i.id))];
}

/** Hosts a receipt link may point to, per provider. Anything else is shown as words, never a link. */
const HOSTS: Record<string, (string | RegExp)[]> = {
  gmail: ['mail.google.com'], github: ['github.com'], google_calendar: ['calendar.google.com', 'www.google.com'],
  google_drive: ['drive.google.com', 'docs.google.com'], google_tasks: ['tasks.google.com', 'calendar.google.com'],
  slack: [/\.slack\.com$/], notion: ['www.notion.so', 'notion.so', /\.notion\.site$/], linear: ['linear.app'], figma: ['www.figma.com', 'figma.com'],
  outlook_mail: ['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'],
  outlook_calendar: ['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'],
  onedrive: ['onedrive.live.com', '1drv.ms', /\.sharepoint\.com$/], teams: ['teams.microsoft.com', 'teams.live.com'], sharepoint: [/\.sharepoint\.com$/],
};
/**
 * The receipt's URL when it is an `https` address on the provider's own host, no credentials or
 * control characters; otherwise null. Parsed by hand: the phone's URL class is partial.
 */
export function safeLink(url: string | null | undefined, provider: string | null | undefined): string | null {
  if (!url || !provider || url.length > 2048 || /[\s\u0000-\u001f\u007f<>"'`\\]/.test(url)) return null;
  const m = /^https:\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(?::443)?(\/[^#]*)?(#.*)?$/.exec(url);
  if (!m) return null;
  const host = m[1]!;
  const allowed = HOSTS[provider]?.some(h => (typeof h === 'string' ? h === host : h.test(host)));
  if (!allowed) return null;
  // Google Calendar event links live under /calendar on the shared www.google.com host.
  if (host === 'www.google.com' && !/^\/calendar(\/|$|\?)/.test(m[2] ?? '')) return null;
  return url;
}

export type Tone = 'ok' | 'muted' | 'warn' | 'error';
/** The outcome pill: reads "Done"/"Couldn't"/"Unconfirmed", never a raw status code. */
export function outcomePill(i: Pick<ActivityItem, 'status' | 'outcome'>): { label: string; tone: Tone } {
  switch (i.outcome) {
    case 'confirmed': return { label: 'Done', tone: 'ok' };
    case 'refused': return { label: 'Refused', tone: 'error' };
    case 'rate_limited': return { label: 'Rate limited', tone: 'warn' };
    case 'reconnect_required': return { label: 'Reconnect needed', tone: 'warn' };
    case 'retryable': return { label: 'Failed', tone: 'error' };
    case 'outcome_unknown': return { label: 'Unconfirmed', tone: 'warn' };
    default:
      if (i.status === 'confirmed') return { label: 'Done', tone: 'ok' };
      if (i.status === 'unknown') return { label: 'Unconfirmed', tone: 'warn' };
      return { label: i.status === 'failed' ? 'Failed' : 'Recorded', tone: i.status === 'failed' ? 'error' : 'muted' };
  }
}

export const activityTitle = (i: Pick<ActivityItem, 'tool' | 'provider'>) => toolWords(i.tool, i.provider);
export const activityService = (i: Pick<ActivityItem, 'provider'>) => providerName(i.provider, 'Service');
/** "Gmail · work@acme.com" */
export const activityAccount = (i: Pick<ActivityItem, 'provider' | 'accountLabel'>) =>
  [activityService(i), i.accountLabel].filter(Boolean).join(' · ');
export const activityLabel = (i: ActivityItem) =>
  `${activityService(i)} ${activityTitle(i)}, ${outcomePill(i).label}, by ${i.agentName}`;

/** "Just now", "12 min ago", "3 h ago", "Yesterday", else the date. Server times only; unparseable is empty. */
export function timeWords(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The service chips: connected providers first seen by the hub, then any the feed itself showed. */
export function serviceFilters(connected: string[], items: ActivityItem[], selected?: string | null): string[] {
  const all = [...connected, ...items.map(i => i.provider ?? ''), selected ?? ''].filter(p => PROVIDER.test(p));
  return [...new Set(all)].sort((a, b) => providerName(a).localeCompare(providerName(b)));
}
