/**
 * Agent V2 event triggers view-model: docs/agent-v2-api-contract.md §6b "Triggers". Pure — no
 * runtime imports — so the Mac imports it too. Filters are saved by the person, never chosen
 * by a model; webhook secrets are shown once and never stored here.
 */
import type { Tone } from './routinesModel';

export type TriggerKind = 'github.issue' | 'github.pull_request' | 'stripe.event' | 'gmail.message' | 'calendar.event_soon';
export interface Trigger {
  id: string; agentId: string; kind: TriggerKind; connectionId: string | null; filter: Record<string, unknown>;
  promptTemplate: string; ratePerHour: number; revision: number; paused: boolean; webhookUrl: string | null;
  lastError: string | null; polledAt: string | null; createdAt: string;
}
export interface TriggerEvent {
  id: string; eventKey: string; type: string; state: 'admitted' | 'skipped' | 'failed' | 'pending'; reason: string | null;
  runId: string | null; summary: Record<string, unknown>; createdAt: string;
}
export interface Webhook { url: string; secret: string | null; contentType: string }
export interface Connection { id: string; provider: string; account: string; health: string }

export const TRIGGER_KINDS: { kind: TriggerKind; label: string; provider?: 'gmail' | 'google_calendar'; prompt: string }[] = [
  { kind: 'github.issue', label: 'GitHub issue', prompt: 'Read this new issue, summarise it and suggest next steps.' },
  { kind: 'github.pull_request', label: 'GitHub pull request', prompt: 'Review this pull request and list anything that needs attention.' },
  { kind: 'stripe.event', label: 'Stripe event', prompt: 'Explain this Stripe event and tell me if anything needs action.' },
  { kind: 'gmail.message', label: 'Gmail message', provider: 'gmail', prompt: 'Summarise this email and draft a reply if one is needed.' },
  { kind: 'calendar.event_soon', label: 'Calendar event starting soon', provider: 'google_calendar', prompt: 'Prepare a short brief for this meeting.' },
];
export const kindInfo = (kind: string) => TRIGGER_KINDS.find(k => k.kind === kind);
export const isWebhook = (kind: string) => kind.startsWith('github.') || kind === 'stripe.event';

export interface TriggerDraft {
  kind: TriggerKind; repository: string; actions: string; labels: string; types: string; query: string;
  pollMinutes: number; calendarId: string; leadMinutes: number; promptTemplate: string; ratePerHour: number;
  connectionId: string; signingSecret: string;
}
export function newTriggerDraft(kind: TriggerKind): TriggerDraft {
  return { kind, repository: '', actions: 'opened', labels: '', types: '', query: '', pollMinutes: 5, calendarId: 'primary',
    leadMinutes: 15, promptTemplate: kindInfo(kind)?.prompt ?? '', ratePerHour: 10, connectionId: '', signingSecret: '' };
}
export const splitList = (text: string) => text.split(',').map(v => v.trim()).filter(Boolean);
export function triggerFilter(d: TriggerDraft): Record<string, unknown> {
  switch (d.kind) {
    case 'github.issue': case 'github.pull_request': {
      const labels = splitList(d.labels);
      return { ...(d.repository.trim() && { repository: d.repository.trim() }), actions: splitList(d.actions).length ? splitList(d.actions) : ['opened'],
        ...(labels.length && { labels }) };
    }
    case 'stripe.event': return { types: splitList(d.types) };
    case 'gmail.message': return { ...(d.query.trim() && { query: d.query.trim() }), pollMinutes: d.pollMinutes };
    case 'calendar.event_soon': return { calendarId: d.calendarId.trim() || 'primary', leadMinutes: d.leadMinutes };
  }
}
const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
/** The first thing keeping this trigger from being saved, in words; null when it can be saved. */
export function triggerProblem(d: TriggerDraft): string | null {
  if (!d.promptTemplate.trim()) return 'Say what the teammate should do when this happens.';
  if (d.kind.startsWith('github.')) {
    if (d.repository.trim() && !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(d.repository.trim())) return 'Use owner/repo for the repository.';
    if (!splitList(d.actions).every(a => /^[a-z_]{2,40}$/.test(a))) return 'Use GitHub action names like opened, labeled.';
  }
  if (d.kind === 'stripe.event') {
    const types = splitList(d.types);
    if (!types.length) return 'Add at least one Stripe event type, like invoice.paid.';
    if (!types.every(t => /^[a-z_.*]{3,80}$/.test(t))) return 'Use Stripe event types like invoice.paid or customer.*.';
    if (d.signingSecret.trim() && !/^whsec_[A-Za-z0-9]{16,128}$/.test(d.signingSecret.trim())) return 'A Stripe signing secret starts with whsec_.';
  }
  const provider = kindInfo(d.kind)?.provider;
  if (provider && !d.connectionId) return `Choose a connected ${provider === 'gmail' ? 'Gmail' : 'Google Calendar'} account.`;
  if (d.kind === 'gmail.message' && (!whole(d.pollMinutes, 1, 60) || /[\r\n]/.test(d.query) || d.query.length > 150))
    return 'Check every 1 to 60 minutes, with a one-line search.';
  if (d.kind === 'calendar.event_soon' && !whole(d.leadMinutes, 5, 240)) return 'Choose 5 to 240 minutes before the event.';
  if (!whole(d.ratePerHour, 1, 60)) return 'Allow 1 to 60 runs an hour.';
  return null;
}
export function triggerBody(agentId: string, d: TriggerDraft) {
  return { agentId, kind: d.kind, promptTemplate: d.promptTemplate, filter: triggerFilter(d), ratePerHour: d.ratePerHour,
    ...(kindInfo(d.kind)?.provider && { connectionId: d.connectionId }),
    ...(d.kind === 'stripe.event' && d.signingSecret.trim() && { signingSecret: d.signingSecret.trim() }) };
}

const list = (v: unknown) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').join(', ') : '');
/** A one-line reading of the saved filter. */
export function filterSummary(t: Pick<Trigger, 'kind' | 'filter'>): string {
  const f = t.filter ?? {};
  switch (t.kind) {
    case 'github.issue': case 'github.pull_request':
      return [typeof f.repository === 'string' ? f.repository : 'Any repository', list(f.actions) || 'opened',
        list(f.labels) && `labels ${list(f.labels)}`].filter(Boolean).join(' · ');
    case 'stripe.event': return list(f.types) || 'No event types';
    case 'gmail.message': return `${typeof f.query === 'string' ? `“${f.query}”` : 'Any new message'} · every ${Number(f.pollMinutes) || 5} min`;
    case 'calendar.event_soon': return `${typeof f.calendarId === 'string' ? f.calendarId : 'primary'} · ${Number(f.leadMinutes) || 15} min before`;
    default: return '';
  }
}
export function triggerStatus(t: Pick<Trigger, 'paused' | 'lastError' | 'ratePerHour'>): { label: string; tone: Tone } {
  if (t.paused) return { label: 'Paused', tone: 'muted' };
  if (t.lastError) return { label: `Stopped · ${t.lastError === 'grant_revoked' ? 'access was removed' : t.lastError.replace(/_/g, ' ')}`, tone: 'error' };
  return { label: `Active · up to ${t.ratePerHour} run${t.ratePerHour === 1 ? '' : 's'} an hour`, tone: 'ok' };
}
/** The exact provider setup, step by step (contract §6b "Webhooks"). */
export function webhookSteps(kind: string, types: string[] = []): string[] {
  if (kind.startsWith('github.')) return [
    'On GitHub, open the repository’s Settings → Webhooks → Add webhook.',
    'Payload URL: the webhook URL above.',
    'Content type: application/json.',
    'Secret: the webhook secret above. It is shown only once.',
    `Events: choose “Let me select individual events” and tick ${kind === 'github.pull_request' ? 'Pull requests' : 'Issues'}.`,
    'Save. GitHub’s ping should show a 202 response.',
  ];
  return [
    'In the Stripe Dashboard, open Developers → Webhooks → Add endpoint.',
    'Endpoint URL: the webhook URL above.',
    `Events: ${types.length ? types.join(', ') : 'the event types you saved'}.`,
    'After adding it, reveal the endpoint’s signing secret (whsec_…) and paste it into Signing secret.',
    'The hook stays off until the signing secret is saved.',
  ];
}
const EVENT_REASONS: Record<string, string> = { rate_limited: 'hourly cap reached', paused: 'paused' };
export function eventLabel(e: Pick<TriggerEvent, 'state' | 'reason'>): { label: string; tone: Tone } {
  const why = e.reason ? ` · ${EVENT_REASONS[e.reason] ?? e.reason.replace(/_/g, ' ')}` : '';
  if (e.state === 'admitted') return { label: 'Started a run', tone: 'ok' };
  if (e.state === 'pending') return { label: 'Starting', tone: 'muted' };
  if (e.state === 'skipped') return { label: `Skipped${why}`, tone: 'muted' };
  return { label: `Failed${why}`, tone: 'error' };
}
/** A short line naming what happened (issue title, event type…), from the bounded summary. */
export function eventTitle(e: Pick<TriggerEvent, 'type' | 'summary'>): string {
  const s = e.summary ?? {};
  const title = ['title', 'subject', 'summary'].map(k => s[k]).find(v => typeof v === 'string' && v.trim());
  const number = typeof s.number === 'number' && s.number ? `#${s.number} ` : '';
  return title ? `${number}${String(title).slice(0, 120)}` : e.type;
}
