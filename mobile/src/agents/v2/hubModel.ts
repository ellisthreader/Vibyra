/**
 * Agent V2 connections hub words and choices (§6c). Pure, shared by the phone and the Mac.
 * Connected is not granted: an account shows here once connected, but a teammate reaches it
 * only through the operations saved in its grant.
 */
import { mcpHost, type CatalogueProvider, type CatalogueTool, type Grant, type HubConnection, type HubStatus, type McpPreset, type McpServer, type McpTool } from './connectionsModel';
import type { Tone } from './routinesModel';

export const STATUS_PILL: Record<HubStatus, { label: string; tone: Tone }> = {
  ok: { label: 'Connected', tone: 'ok' },
  reconnect_required: { label: 'Reconnect needed', tone: 'error' },
  insufficient_scope: { label: 'Needs more access', tone: 'warn' },
  needs_review: { label: 'Changed — review', tone: 'warn' },
  unconfigured: { label: 'Not set up', tone: 'muted' },
};

const REASONS: Record<string, string> = {
  integrations_disabled: 'Connections are switched off on the Vibyra service right now.',
  credentials_missing: 'Vibyra hasn’t finished setting up sign-in for this service yet.',
  auth_config_missing: 'Vibyra hasn’t finished setting up sign-in for this service yet.',
  flag_off: 'Not switched on for your account yet.',
  isolation_unverified: 'Waiting on a safety check that keeps your account separate from others.',
};
/** Why a provider cannot be connected, in plain words; null when it can. */
export function unavailableReason(p: CatalogueProvider): string | null {
  if (p.readiness === 'ready') return p.kind === 'composio' ? 'Connect this one from the Vibyra website for now.' : null;
  return (p.reason && REASONS[p.reason]) ?? p.message ?? 'Not available yet.';
}
/** What a ready provider offers, counted: "2 reads · 1 change with approval". */
export function catalogueLine(p: CatalogueProvider): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const reads = p.tools.filter(t => t.kind === 'read').length, writes = p.tools.length - reads;
  return [reads && n(reads, 'read', 'reads'), writes && `${n(writes, 'change', 'changes')} with approval`].filter(Boolean).join(' · ') || 'Ready to connect';
}
export const connectable = (p: CatalogueProvider) => unavailableReason(p) === null;

/** The one line that names an account: its email, else its label, else the service. */
export const accountTitle = (c: HubConnection) => c.email ?? c.accountLabel ?? c.account ?? c.name;

/** Slack accounts connected before mentions existed: one line saying why a Reconnect is offered; null otherwise. */
export const mentionsNote = (c: HubConnection): string | null =>
  c.mentions?.state === 'reconnect_required' ? c.mentions.message ?? 'Reconnect once so teammates can see Slack mentions of Vibyra.' : null;

export function teammatesLine(c: HubConnection): string {
  const names = c.teammates.map(t => t.name).filter(Boolean);
  if (!names.length) return 'No teammate uses this yet';
  return names.length <= 2 ? `Used by ${names.join(' and ')}` : `Used by ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function lastUsedLine(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Not used yet';
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return 'Not used yet';
  if (minutes < 2) return 'Used just now';
  if (minutes < 60) return `Used ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Used ${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Used yesterday' : `Used ${days} days ago`;
}

export interface ProviderGroup { provider: string; name: string; accounts: HubConnection[]; canAdd: boolean; mcp: boolean }
/** Accounts grouped by provider in catalogue order; MCP servers each stand alone, last. */
export function groupAccounts(connections: HubConnection[], catalogue: CatalogueProvider[]): ProviderGroup[] {
  const order = new Map(catalogue.map((p, i) => [p.provider, i]));
  const groups = new Map<string, ProviderGroup>();
  for (const c of connections) {
    const entry = catalogue.find(p => p.provider === c.provider);
    const group = groups.get(c.provider) ?? { provider: c.provider, name: entry?.name ?? c.name, accounts: [],
      canAdd: Boolean(entry && connectable(entry) && entry.connect.some(k => k === 'oauth' || k === 'token')), mcp: c.mcp !== null };
    group.accounts.push(c);
    groups.set(c.provider, group);
  }
  const rank = (g: ProviderGroup) => (g.mcp ? 10000 : order.get(g.provider) ?? 5000);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** A tool name without its provider prefix: `github_create_issue` → "Create issue". */
export function toolLabel(tool: string, provider?: string): string {
  let name = tool.includes('__') ? tool.slice(tool.indexOf('__') + 2) : tool;
  if (provider && name.startsWith(`${provider}_`)) name = name.slice(provider.length + 1);
  else if (!tool.includes('__')) name = name.replace(/^[a-z]+_/, '');
  name = name.replace(/_/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : tool;
}

export interface Operations { reads: string[]; writes: string[] }
/** Builtin providers from the catalogue; MCP servers from their own pinned tool list. */
export function operationsFor(provider: string, catalogue: CatalogueProvider[], server?: McpServer | null): Operations {
  const tools: (CatalogueTool | McpTool)[] = server ? server.tools : catalogue.find(p => p.provider === provider)?.tools ?? [];
  return { reads: tools.filter(t => t.kind === 'read').map(t => t.tool), writes: tools.filter(t => t.kind === 'write').map(t => t.tool) };
}

/** Reads are one choice; each write is its own. Returns the sorted operations to save. */
export function toggleOperation(current: string[], ops: Operations, choice: 'reads' | string, on: boolean): string[] {
  const change = choice === 'reads' ? ops.reads : [choice];
  const next = new Set(current.filter(op => ops.reads.includes(op) || ops.writes.includes(op)));
  for (const op of change) {
    if (on) next.add(op);
    else next.delete(op);
  }
  return [...next].sort();
}
export const readsOn = (current: string[], ops: Operations) => ops.reads.length > 0 && ops.reads.every(op => current.includes(op));

export type GrantState = 'none' | 'reads' | 'some' ;
/** How much of one account a teammate holds: none (connected, not granted), reads only, or with writes. */
export function grantState(grant: Grant | undefined, ops: Operations): GrantState {
  const held = (grant?.revokedAt ? [] : grant?.operations ?? []).filter(op => ops.reads.includes(op) || ops.writes.includes(op));
  if (!held.length) return 'none';
  return held.some(op => ops.writes.includes(op)) ? 'some' : 'reads';
}
export const GRANT_WORDS: Record<GrantState, string> = {
  none: 'Connected · not allowed for this teammate', reads: 'Allowed · read only', some: 'Allowed · can ask to make changes',
};

/** Tools a person may mark as reads: only the ones the server itself annotates read-only. */
export const markableReads = (server: McpServer) => server.tools.filter(t => t.readOnlyHint);
/** F-25: said once, calmly, wherever a person can mark a remote tool as a read (shown when `markableReads` is not empty). */
export const MCP_READ_WARNING = 'A tool marked as a read runs without asking and sends what your teammate types to this server. Only mark tools you trust.';
export const needsReview = (server: McpServer) => server.status === 'tools_changed' || server.pending !== null;
export function reviewSummary(server: McpServer): string {
  const p = server.pending;
  if (!p) return '';
  const parts = [p.added.length && `${p.added.length} added`, p.removed.length && `${p.removed.length} removed`,
    p.changed.length && `${p.changed.length} changed`].filter(Boolean);
  return `This server’s tools changed (${parts.join(', ') || 'details updated'}). Teammates can’t use it until you review.`;
}

/** An MCP address the backend could accept: HTTPS on the default port. The server re-checks everything. */
export function mcpUrlProblem(url: string): string | null {
  const value = url.trim();
  if (!value) return 'Enter the server’s address.';
  let parsed: URL;
  try { parsed = new URL(value); } catch { return 'That doesn’t look like a web address.'; }
  if (parsed.protocol !== 'https:') return 'Use an https:// address.';
  if (parsed.port && parsed.port !== '443') return 'Only the standard HTTPS port (443) is supported.';
  return null;
}

/** The preset a connected MCP server was added from: same host as a preset's address, nothing else (a name proves nothing). */
export function presetOf(c: HubConnection, presets: McpPreset[]): McpPreset | null {
  const host = mcpHost(c.mcp?.url);
  return host ? presets.find(p => mcpHost(p.url) === host) ?? null : null;
}

/**
 * The Popular group: presets not already added (same host as a connected MCP server) and not standing in for a built-in
 * service that is connected, in the service's own order. Empty when the service lists none.
 */
export function visiblePresets(presets: McpPreset[], connections: HubConnection[], connectedProviders: ReadonlySet<string>): McpPreset[] {
  const added = new Set(connections.map(c => mcpHost(c.mcp?.url)).filter((host): host is string => host !== null));
  return presets.filter(p => !added.has(mcpHost(p.url) ?? '') && !(p.native && connectedProviders.has(p.native)));
}

/** Built-in providers a preset stands in for: while one cannot be connected itself, its dead row gives way to the preset. */
export const presetStandIns = (presets: McpPreset[]): Set<string> => new Set(presets.flatMap(p => (p.native ? [p.native] : [])));
