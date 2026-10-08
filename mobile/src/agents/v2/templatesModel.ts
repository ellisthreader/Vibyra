/**
 * Agent v2 starter teammates (contract §6d `GET /templates`). Pure — no runtime imports — so the
 * Mac imports it too. A template creates the profile only: its providers, schedule and trigger are
 * suggestions the person ticks or opens themselves — nothing here grants, schedules or subscribes.
 */
import { providerName, toolWords } from './providerLabels';
import type { Recurrence, ScheduleDraft } from './routinesModel';
import { TRIGGER_KINDS, newTriggerDraft, type TriggerDraft, type TriggerKind } from './triggersModel';

export interface TemplateOperation { tool: string; kind: 'read' | 'write' }
export interface TemplateProvider { provider: string; name: string; operations: TemplateOperation[]; why: string; connected: boolean }
export interface Template {
  key: string; name: string; avatar: string; brief: string; providers: TemplateProvider[];
  schedule: { recurrence: Recurrence; prompt: string } | null;
  trigger: { kind: TriggerKind; filter: Record<string, unknown>; promptTemplate: string } | null;
}
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function recurrence(v: any): Recurrence | null {
  if (!v || typeof v.time !== 'string') return null;
  if (v.type === 'daily') return { type: 'daily', time: v.time };
  if (v.type === 'weekly' && Array.isArray(v.weekdays)) return { type: 'weekly', time: v.time, weekdays: v.weekdays.filter((d: unknown): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7) };
  if (v.type === 'once' && typeof v.date === 'string') return { type: 'once', date: v.date, time: v.time };
  return null;
}
export function parseTemplate(raw: unknown): Template | null {
  const d = raw as Record<string, any> | null;
  if (!d || !/^[a-z][a-z0-9_]{1,39}$/.test(str(d.key)) || !str(d.name)) return null;
  const s = d.suggested ?? {}, r = recurrence(s.schedule?.recurrence);
  const kind = TRIGGER_KINDS.find(k => k.kind === s.trigger?.kind)?.kind;
  return {
    key: d.key, name: d.name, avatar: str(d.avatar) || 'sprout', brief: str(d.brief),
    providers: (Array.isArray(s.providers) ? s.providers : []).filter((p: any) => p && typeof p.provider === 'string').map((p: any): TemplateProvider => ({
      provider: p.provider, name: str(p.name) || providerName(p.provider), why: str(p.why), connected: p.connected === true,
      operations: (Array.isArray(p.operations) ? p.operations : []).filter((o: any) => o && typeof o.tool === 'string')
        .map((o: any): TemplateOperation => ({ tool: o.tool, kind: o.kind === 'write' ? 'write' : 'read' })) })),
    schedule: r && str(s.schedule?.prompt) ? { recurrence: r, prompt: s.schedule.prompt } : null,
    trigger: kind && str(s.trigger?.promptTemplate) ? { kind, filter: s.trigger.filter && typeof s.trigger.filter === 'object' ? s.trigger.filter : {}, promptTemplate: s.trigger.promptTemplate } : null,
  };
}
export const parseTemplates = (raw: unknown): Template[] =>
  (Array.isArray((raw as any)?.templates) ? (raw as any).templates : []).map(parseTemplate).filter((t: Template | null): t is Template => t !== null);

/** The editor opens with the suggestion filled in; the person still chooses the time zone and saves it. */
export function scheduleSeed(t: Template): Partial<ScheduleDraft> | null {
  const s = t.schedule;
  if (!s) return null;
  const r = s.recurrence;
  return { type: r.type, time: r.time, prompt: s.prompt, ...(r.type === 'weekly' ? { weekdays: r.weekdays } : {}), ...(r.type === 'once' ? { date: r.date } : {}) };
}
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join(', ') : '');
const whole = (v: unknown, fallback: number) => (Number.isInteger(v) ? (v as number) : fallback);
export function triggerSeed(t: Template): Partial<TriggerDraft> | null {
  const x = t.trigger;
  if (!x) return null;
  const f = x.filter, base = newTriggerDraft(x.kind);
  return { kind: x.kind, promptTemplate: x.promptTemplate,
    ...(typeof f.repository === 'string' ? { repository: f.repository } : {}), ...(Array.isArray(f.actions) ? { actions: list(f.actions) } : {}),
    ...(Array.isArray(f.labels) ? { labels: list(f.labels) } : {}), ...(Array.isArray(f.types) ? { types: list(f.types) } : {}),
    ...(typeof f.query === 'string' ? { query: f.query } : {}), ...(f.pollMinutes !== undefined ? { pollMinutes: whole(f.pollMinutes, base.pollMinutes) } : {}),
    ...(typeof f.calendarId === 'string' ? { calendarId: f.calendarId } : {}), ...(f.leadMinutes !== undefined ? { leadMinutes: whole(f.leadMinutes, base.leadMinutes) } : {}) };
}

/** "Reads: search, read · Asks first: send" for one suggested provider. */
export function operationsLine(p: TemplateProvider): string {
  const words = (kind: 'read' | 'write') => p.operations.filter(o => o.kind === kind).map(o => toolWords(o.tool, p.provider).toLowerCase());
  const reads = words('read'), writes = words('write');
  return [reads.length && `Reads: ${reads.join(', ')}`, writes.length && `Asks first: ${writes.join(', ')}`].filter(Boolean).join(' · ');
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function recurrenceWords(r: Recurrence): string {
  if (r.type === 'daily') return `Every day at ${r.time}`;
  if (r.type === 'once') return `Once, ${r.date} at ${r.time}`;
  const days = [...r.weekdays].sort((a, b) => a - b);
  const weekdays = days.length === 5 && days.every((d, i) => d === i + 1);
  return `${weekdays ? 'Weekdays' : days.map(d => DAYS[d - 1]).join(', ')} at ${r.time}`;
}
export const triggerWords = (kind: string) => TRIGGER_KINDS.find(k => k.kind === kind)?.label ?? 'an event';
/** The suggestion for one provider, marked for the account rows: which operations are suggested. */
export const suggestedOperations = (t: Template | null, provider: string): string[] =>
  t?.providers.find(p => p.provider === provider)?.operations.map(o => o.tool) ?? [];

/** Which starter a teammate came from, kept on this device until the person dismisses the suggestions. */
export const templateMarkKey = (identity: string, agentId: string) => `agent-template.${encodeURIComponent(identity)}.${agentId}`;
export const parseTemplateMark = (raw: string | null): string | null => {
  try { const key = JSON.parse(raw ?? 'null')?.key; return typeof key === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(key) ? key : null; } catch { return null; }
};
