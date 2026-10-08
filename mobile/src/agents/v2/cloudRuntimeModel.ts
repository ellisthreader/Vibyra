import type { CloudAgentQuote as ComputeQuote } from './cloudRuntimeQuote';

export type AgentExecutionTarget = 'local' | 'cloud';
export interface CloudAgentAccount {
  provider: 'claude'; accountId: string; label: string; authenticated: boolean; online: boolean;
  models: string[]; efforts: string[];
}
export interface CloudAgentPolicy {
  revision: number; runtimeId: string; workspaceId: string; provider: 'claude'; accountId: string; accountLabel?: string; model: string; effort?: string | null;
  expiresAt: string; remainingStarts: number; remainingBudgetUnits: number; remainingSeconds: number; enabled: boolean;
  quote: { budgetUnits: number; deadlineSeconds: number; unitsPerHour: number; profile: string; tariffVersion?: string };
}
export interface CloudAgentPage {
  enabled: boolean; requiresSetup: boolean; policy: CloudAgentPolicy | null; accounts: CloudAgentAccount[];
  computer: { workspaceId: string; state: string; online: boolean; error?: string | null } | null;
}
export interface CloudAgentSave {
  expectedRevision: number; quoteId: string; deviceId: string; provider: 'claude'; accountId: string; accountLabel?: string; model: string; effort?: string;
  maxStarts: number; totalBudgetUnits: number; totalSeconds: number; expiresAt: string;
}
export interface CloudAgentApi {
  read(): Promise<CloudAgentPage>;
  quote(deviceId: string, budgetUnits: number, deadlineSeconds: number): Promise<ComputeQuote>;
  save(body: CloudAgentSave): Promise<CloudAgentPage>;
  revoke(expectedRevision: number): Promise<CloudAgentPage>;
}
const object = (v: unknown): Record<string, any> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
export function parseCloudAgentPage(raw: unknown): CloudAgentPage {
  const d = object(raw);
  if (!d || typeof d.enabled !== 'boolean' || !Array.isArray(d.accounts)) throw new Error('Cloud availability could not be verified. Refresh before continuing.');
  const p = object(d.policy), quote = object(p?.quote);
  if (p && (!quote || !['budgetUnits','deadlineSeconds','unitsPerHour'].every(k => nonnegative(quote[k]) && quote[k] > 0))) throw new Error('The Cloud allowance price could not be verified. Refresh before continuing.');
  if (p && (p.provider !== 'claude' || !['runtimeId', 'workspaceId', 'accountId', 'model', 'expiresAt'].every(k => typeof p[k] === 'string' && p[k])
    || !['revision', 'remainingStarts', 'remainingBudgetUnits', 'remainingSeconds'].every(k => nonnegative(p[k]))
    || !Number.isFinite(Date.parse(p.expiresAt)) || typeof p.enabled !== 'boolean')) throw new Error('The Cloud allowance could not be verified. Refresh before continuing.');
  const accounts = d.accounts.filter((a: any) => a?.provider === 'claude' && typeof a.accountId === 'string' && typeof a.label === 'string')
    .map((a: any): CloudAgentAccount => ({ provider: 'claude', accountId: a.accountId, label: a.label,
      authenticated: a.authenticated === true, online: a.online === true, models: strings(a.models), efforts: strings(a.efforts) }));
  return { enabled: d.enabled, requiresSetup: d.requiresSetup === true, accounts, policy: p as CloudAgentPolicy | null,
    computer: d.computer && typeof d.computer.workspaceId === 'string' ? d.computer : null };
}
export function cloudRunProblem(page: CloudAgentPage | null, now = Date.now()): string | null {
  if (!page) return 'Refresh Cloud availability before sending.';
  if (!page.enabled) return 'Cloud Agents are not available for this account yet.';
  const p = page.policy;
  if (!p?.enabled) return 'Choose a Cloud account and approve a bounded allowance first.';
  if (Date.parse(p.expiresAt) <= now) return 'Your Cloud allowance expired. Review a new allowance.';
  if (p.remainingStarts < 1 || p.remainingBudgetUnits < p.quote.budgetUnits || p.remainingSeconds < p.quote.deadlineSeconds) return 'Your approved Cloud allowance is used up.';
  return null;
}
export const cloudTokens = (units: number) => (units / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 });
export const cloudMinutes = (seconds: number) => Math.ceil(seconds / 60).toLocaleString();
export function selectedRuntime(target: AgentExecutionTarget, page: CloudAgentPage | null): string | undefined {
  if (target === 'local') return undefined;
  const problem = cloudRunProblem(page); if (problem) throw new Error(problem);
  return page!.policy!.runtimeId;
}
export function cloudSaveBody(page: CloudAgentPage, quote: ComputeQuote, accountId: string, model: string, effort: string,
  maxStarts: number, expiresAt: string, now = Date.now()): CloudAgentSave {
  const account = page.accounts.find(a => a.accountId === accountId && a.authenticated && a.online);
  if (!account || !account.models.includes(model) || (effort && !account.efforts.includes(effort))) throw new Error('Choose a currently signed-in Cloud account and its supported model.');
  if (!Number.isSafeInteger(maxStarts) || maxStarts < 1 || maxStarts > 20) throw new Error('Choose between 1 and 20 Cloud starts.');
  if (quote.expiresAt * 1000 <= now || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now) throw new Error('This review expired. Request a fresh quote.');
  const totalBudgetUnits = quote.budgetUnits * maxStarts, totalSeconds = quote.deadlineSeconds * maxStarts;
  if (!Number.isSafeInteger(totalBudgetUnits) || !Number.isSafeInteger(totalSeconds)) throw new Error('Choose a smaller Cloud allowance.');
  return { expectedRevision: page.policy?.revision ?? 0, quoteId: quote.id, deviceId: quote.deviceId, provider: 'claude', accountId,
    model, ...(effort ? { effort } : {}), maxStarts, totalBudgetUnits, totalSeconds, expiresAt };
}

/** Bind new schedules and triggers to the choice shown; retries keep their saved body. */
export function withAgentRuntime<T extends object>(body: T, runtime: () => string | undefined): T & {runtimeId?: string} {
  const runtimeId = runtime(); return { ...body, ...(runtimeId ? { runtimeId } : {}) };
}
