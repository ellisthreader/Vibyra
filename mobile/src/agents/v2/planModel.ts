/**
 * Agent v2 task plan card (contract §6d `POST /runs/preview`). Pure — no runtime imports — so
 * the Mac imports it too. The plan is a preview: nothing here grants, connects or sends, and
 * a gap only ever names the one step the server says fixes it.
 */
import { providerName, toolWords } from './providerLabels';

export interface PlanFix { action: string; method: string | null; path: string | null; message: string }
export interface PlanService { provider: string; name: string; connectionId: string; account: string | null; reads: string[]; writes: string[] }
export interface PlanTool { tool: string; provider: string; connectionId: string | null; account: string | null; kind: 'read' | 'write'; requiresApproval: boolean }
export interface PlanGap {
  provider: string; name: string; reason: string; blocking: boolean; message: string;
  connectionId: string | null; account: string | null; accounts: { connectionId: string; account: string | null }[]; fix: PlanFix | null;
}
export interface PlanRuntime { ok: boolean; provider: string | null; model: string | null; code: string | null; message: string | null; fix: PlanFix | null }
export interface TaskPlan {
  agentId: string; ready: boolean; maxTools: number; runtime: PlanRuntime; services: PlanService[]; tools: PlanTool[];
  approvals: PlanTool[]; dropped: PlanTool[]; mentioned: string[]; missing: PlanGap[];
}
/** Same body as admission, so one key names one send. */
export interface PlanRequest { agentId: string; prompt: string; attachments: string[]; runtimeId?: string }

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown) => list(v).filter((x): x is string => typeof x === 'string');
function fix(v: any): PlanFix | null {
  return v && typeof v.action === 'string' && typeof v.message === 'string'
    ? { action: v.action, method: text(v.method), path: text(v.path), message: v.message } : null;
}
function tool(v: any): PlanTool | null {
  return v && typeof v.tool === 'string' && typeof v.provider === 'string'
    ? { tool: v.tool, provider: v.provider, connectionId: text(v.connectionId), account: text(v.account),
      kind: v.kind === 'write' ? 'write' : 'read', requiresApproval: v.requiresApproval === true } : null;
}

/** Tolerant parse: anything unrecognisable is no plan, and the card simply does not appear. */
export function parsePlan(raw: unknown): TaskPlan | null {
  const d = raw as Record<string, any> | null;
  if (!d || typeof d !== 'object' || typeof d.agentId !== 'string') return null;
  const r = d.runtime ?? {};
  const tools = (v: unknown) => list(v).map(tool).filter((t): t is PlanTool => t !== null);
  return {
    agentId: d.agentId, ready: d.ready === true, maxTools: Number(d.maxTools) || 10,
    runtime: { ok: r.ok === true, provider: text(r.provider), model: text(r.model), code: text(r.code), message: text(r.message), fix: fix(r.fix) },
    services: list(d.services).filter(s => s && typeof s.provider === 'string' && typeof s.connectionId === 'string').map(s => ({
      provider: s.provider, name: text(s.name) ?? providerName(s.provider), connectionId: s.connectionId, account: text(s.account),
      reads: strings(s.reads), writes: strings(s.writes) })),
    tools: tools(d.tools), approvals: tools(d.approvals), dropped: tools(d.dropped), mentioned: strings(d.mentioned),
    missing: list(d.missing).filter(m => m && typeof m.provider === 'string' && typeof m.reason === 'string').map(m => ({
      provider: m.provider, name: text(m.name) ?? providerName(m.provider), reason: m.reason, blocking: m.blocking === true,
      message: text(m.message) ?? '', connectionId: text(m.connectionId), account: text(m.account),
      accounts: list(m.accounts).filter(a => a && typeof a.connectionId === 'string').map(a => ({ connectionId: a.connectionId, account: text(a.account) })),
      fix: fix(m.fix) })),
  };
}

/** One identity for a draft: the plan is fetched again only when this changes. */
export const planKey = (r: PlanRequest) => JSON.stringify([r.agentId, r.prompt.trim(), r.attachments, r.runtimeId ?? null]);
/** Preview takes the admission body; a throwaway key satisfies its validation and is never kept. */
export const planBody = (r: PlanRequest, key: string) => ({ ...(r.runtimeId ? { runtimeId: r.runtimeId } : {}), agentId: r.agentId, idempotencyKey: key, prompt: r.prompt,
  attachments: r.attachments.map(id => ({ id })) });
export const previewKeyFor = (random: string) => `preview-${random.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 40).padEnd(8, '0')}`;

/** What the person can do about a gap: a real button, or plain words only. */
export type FixKind = 'connect' | 'reconnect' | 'grant' | 'choose_ai_account' | 'words';
export interface FixStep { kind: FixKind; label: string; provider: string | null; connectionId: string | null; message: string }
export interface GapRow { key: string; title: string; message: string; /** The server's suggested step in words, when a button does not already say it. */ hint: string | null; blocking: boolean; step: FixStep }

function step(f: PlanFix | null, gap: Pick<PlanGap, 'provider' | 'name' | 'connectionId' | 'message'>): FixStep {
  const base = { provider: gap.provider, connectionId: gap.connectionId, message: f?.message ?? gap.message };
  switch (f?.action) {
    case 'connect': return { ...base, kind: 'connect', label: `Connect ${gap.name}` };
    case 'reconnect': return { ...base, kind: 'reconnect', label: `Reconnect ${gap.name}` };
    case 'grant': return { ...base, kind: 'grant', label: 'Choose access' };
    case 'choose_ai_account': return { ...base, kind: 'choose_ai_account', label: 'Choose AI account' };
    default: return { ...base, kind: 'words', label: '' };
  }
}

/** The AI-account refusal first (it stops everything), then each service gap; blocking ones lead. */
export function gapRows(plan: TaskPlan): GapRow[] {
  const rows: GapRow[] = [];
  if (!plan.runtime.ok) {
    const f = plan.runtime.fix;
    rows.push({ key: `runtime:${plan.runtime.code ?? 'none'}`, title: 'AI account', blocking: true,
      message: plan.runtime.message ?? 'No AI account is chosen for teammates yet.', hint: f?.message ?? 'Choose an AI account on your Mac.',
      step: step(f ?? { action: 'choose_ai_account', method: null, path: null, message: '' },
        { provider: 'runtime', name: 'AI account', connectionId: null, message: plan.runtime.message ?? '' }) });
  }
  for (const gap of plan.missing) {
    rows.push({ key: `${gap.provider}:${gap.reason}:${gap.connectionId ?? ''}`, title: gap.account ? `${gap.name} · ${gap.account}` : gap.name,
      message: gap.message, hint: gap.fix?.message && !['connect', 'reconnect'].includes(gap.fix.action) ? gap.fix.message : null,
      blocking: gap.blocking, step: step(gap.fix, gap) });
  }
  return rows.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export interface ServiceRow { key: string; provider: string; name: string; account: string | null; line: string }
/** "Reads: search, read · Asks first: send". */
export function serviceRows(plan: TaskPlan): ServiceRow[] {
  return plan.services.map(s => {
    const reads = s.reads.map(t => toolWords(t, s.provider).toLowerCase()), writes = s.writes.map(t => toolWords(t, s.provider).toLowerCase());
    const line = [reads.length && `Reads: ${reads.join(', ')}`, writes.length && `Asks first: ${writes.join(', ')}`].filter(Boolean).join(' · ');
    return { key: s.connectionId, provider: s.provider, name: s.name, account: s.account, line };
  });
}
export interface ToolRow { key: string; provider: string; label: string; account: string | null }
export const toolRows = (tools: PlanTool[]): ToolRow[] =>
  tools.map(t => ({ key: `${t.connectionId}:${t.tool}`, provider: t.provider, label: `${providerName(t.provider)} · ${toolWords(t.tool, t.provider)}`, account: t.account }));

/**
 * The card's one collapsed line. Blocking gaps lead ("Needs setup"), then what it can use and how
 * many actions ask first. A task that names no service is simply "no connected services" — calm, not an error.
 */
export function planSummary(plan: TaskPlan): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  const blocking = gapRows(plan).filter(g => g.blocking);
  if (blocking.length) return { text: blocking.length === 1 ? 'Needs setup before it can run' : `${blocking.length} things need setup`, tone: 'warn' };
  const names = [...new Set(plan.services.map(s => s.name))];
  if (!names.length) return { text: 'Won’t use any connected service', tone: 'muted' };
  const uses = names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} +${names.length - 2}`;
  const asks = plan.approvals.length;
  return { text: `Can use ${uses}${asks ? ` · ${plural(asks, 'action asks', 'actions ask')} first` : ''}`, tone: 'ok' };
}
/** Words for what was left out: the server kept the task-relevant tools and cut these. */
export function droppedLine(plan: TaskPlan): string | null {
  if (!plan.dropped.length) return null;
  return `${plural(plan.dropped.length, 'tool was', 'tools were')} left out to keep this task under ${plan.maxTools} tools. Name a service in your message to bring it in.`;
}
/** Only text or attachments that could change the plan are worth asking about. */
export const worthPlanning = (prompt: string) => prompt.trim().length >= 3;
/** Nothing to tell: the AI account is ready, no service is involved and nothing was left out or is missing. */
export const planIsQuiet = (plan: TaskPlan) => plan.runtime.ok && !plan.services.length && !plan.missing.length && !plan.dropped.length;
