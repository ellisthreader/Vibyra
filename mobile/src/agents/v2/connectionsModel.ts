/**
 * Agent V2 connections hub types: docs/agent-v2-api-contract.md §5 "Connections and grants"
 * and §6c. Pure — it imports only the pure `providerLabels` — so the Mac imports it too. Both clients implement
 * `ConnectionsApi`; the words and grouping live in `hubModel.ts`.
 */
import { providerName } from './providerLabels';

export type HubStatus = 'ok' | 'reconnect_required' | 'insufficient_scope' | 'needs_review' | 'unconfigured';
export interface HubTeammate { agentId: string; name: string; operations: string[]; revision: number }
export interface HubMcp {
  /** `local` is a stdio server on one of the person's Macs (Part 6); everything else is a remote HTTPS server. */
  kind?: 'remote' | 'local';
  serverId: string; url: string; status: string; protocolVersion: string | null;
  toolRevision: string | null; pendingRevision: string | null;
}
export interface HubConnection {
  id: string; provider: string; account: string | null; health: string; generation: number;
  source: 'install' | 'connection'; createdAt: string; status: HubStatus; name: string;
  accountLabel: string | null; email: string | null; scopes: string[]; scopesSource: 'granted' | 'requested';
  teammates: HubTeammate[]; lastUsedAt: string | null; reconnect: { method: 'POST'; path: string } | null;
  mcp: HubMcp | null;
  /** Slack only: can teammates see mentions of Vibyra through this account yet (needs one reconnect for older accounts). */
  mentions?: { state: 'ready' | 'reconnect_required'; message: string | null } | null;
}
export interface CatalogueTool { tool: string; kind: 'read' | 'write' }
export interface CatalogueProvider {
  provider: string; name: string; category: string | null; kind: 'builtin' | 'mcp' | 'composio';
  connect: string[]; tools: CatalogueTool[]; readiness: 'ready' | 'unavailable'; reason: string | null; message: string | null;
}
/**
 * A popular remote MCP server the service lists so one tap adds it (`GET /catalogue` → `mcpPresets`). `native` names the
 * built-in provider it stands in for ("notion"), so a preset never shows beside the same service already connected.
 */
export interface McpPreset { id: string; name: string; url: string; category: string | null; tagline: string | null; native: string | null }
export interface Grant { id: string; agentId: string; connectionId: string; operations: string[]; revision: number; revokedAt: string | null }
export interface McpTool {
  tool: string; remoteName: string; description: string | null; kind: 'read' | 'write';
  readOnlyHint: boolean; destructiveHint: boolean;
}
export interface McpServer {
  kind?: 'remote' | 'local';
  /** Local servers only: the Mac's own opaque id for it and the Mac that runs it. */
  localId?: string | null; hostId?: string | null;
  connectionId: string; provider: string; url: string; name: string; auth: string | null;
  status: 'active' | 'pending_auth' | 'tools_changed'; protocolVersion: string | null; toolRevision: string | null;
  tools: McpTool[];
  pending: null | { revision: string; added: string[]; removed: string[]; changed: string[]; tools: McpTool[] };
}
export interface SignIn { flowId: string; url: string }
export interface FlowState { status: 'pending' | 'connected' | 'failed' | 'expired'; error: string | null; connection: HubConnection | null }
export interface McpAdded { connection: HubConnection; server: McpServer; signIn: SignIn | null }

/** One client per platform: the phone's fetch client and the Mac's account bridge. */
export interface ConnectionsApi {
  list(): Promise<HubConnection[]>;
  catalogue(): Promise<CatalogueProvider[]>;
  /** Add-account (or reconnect) OAuth start; open `url` in the system sign-in sheet. */
  start(provider: string, returnUrl?: string): Promise<SignIn>;
  flow(flowId: string): Promise<FlowState>;
  /** A pasted token, e.g. a second GitHub account. */
  paste(provider: string, credential: string): Promise<HubConnection>;
  remove(connectionId: string): Promise<void>;
  grants(agentId: string): Promise<Grant[]>;
  putGrant(agentId: string, connectionId: string, operations: string[]): Promise<Grant>;
  revokeGrant(agentId: string, connectionId: string): Promise<void>;
  /** `name` labels the server (a preset's own name); without it the service names it from its address. */
  addMcp(url: string, returnUrl?: string, name?: string): Promise<McpAdded>;
  /** The catalogue's popular MCP servers. Optional: a client without it simply has no Popular group. */
  presets?(): Promise<McpPreset[]>;
  mcp(connectionId: string): Promise<McpServer>;
  mcpSignIn(connectionId: string, returnUrl?: string): Promise<SignIn | null>;
  mcpRefresh(connectionId: string): Promise<McpServer>;
  mcpApprove(connectionId: string, revision: string): Promise<McpServer>;
  mcpReads(connectionId: string, tools: string[]): Promise<McpServer>;
}

const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
/** An address's host without `www.`, lower case; null when it is not a web address. Presets and added servers are matched by it. */
export function mcpHost(url: unknown): string | null {
  try { return typeof url === 'string' && url ? new URL(url.trim()).hostname.replace(/^www\./i, '').toLowerCase() || null : null; } catch { return null; }
}
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const STATUSES: HubStatus[] = ['ok', 'reconnect_required', 'insufficient_scope', 'needs_review', 'unconfigured'];

/** Tolerant parse: an older server without hub fields reads as plain "ok" connections. */
const signIn = (r: any): { method: 'POST'; path: string } | null => (r && typeof r.path === 'string' ? { method: 'POST', path: r.path } : null);
export function parseConnection(raw: unknown): HubConnection | null {
  const d = (raw ?? {}) as Record<string, any>;
  if (typeof d.id !== 'string' || typeof d.provider !== 'string') return null;
  const status: HubStatus = STATUSES.includes(d.status) ? d.status : d.health === 'reconnect_required' ? 'reconnect_required' : 'ok';
  return {
    id: d.id, provider: d.provider, account: text(d.account), health: String(d.health ?? 'healthy'),
    generation: Number(d.generation) || 1, source: d.source === 'install' ? 'install' : 'connection',
    createdAt: String(d.createdAt ?? ''), status, name: text(d.name) ?? (d.mcp ? mcpHost(d.mcp.url) ?? 'MCP server' : providerName(d.provider)),
    accountLabel: text(d.accountLabel) ?? text(d.account), email: text(d.email), scopes: strings(d.scopes),
    scopesSource: d.scopesSource === 'granted' ? 'granted' : 'requested',
    teammates: Array.isArray(d.teammates) ? d.teammates.filter((t: any) => typeof t?.agentId === 'string')
      .map((t: any) => ({ agentId: t.agentId, name: String(t.name ?? ''), operations: strings(t.operations), revision: Number(t.revision) || 1 })) : [],
    lastUsedAt: text(d.lastUsedAt),
    // A Slack account that only lacks the mentions scope offers the same one-tap Reconnect.
    reconnect: signIn(d.reconnect) ?? (d.mentions?.state === 'reconnect_required' ? signIn(d.mentions.reconnect) : null),
    mentions: d.mentions && (d.mentions.state === 'ready' || d.mentions.state === 'reconnect_required')
      ? { state: d.mentions.state, message: text(d.mentions.message) } : null,
    mcp: d.mcp && typeof d.mcp.serverId === 'string' ? {
      kind: d.mcp.kind === 'local' ? 'local' : 'remote', serverId: d.mcp.serverId, url: String(d.mcp.url ?? ''), status: String(d.mcp.status ?? ''),
      protocolVersion: text(d.mcp.protocolVersion), toolRevision: text(d.mcp.toolRevision), pendingRevision: text(d.mcp.pendingRevision),
    } : null,
  };
}
export const parseConnections = (list: unknown) =>
  (Array.isArray(list) ? list : []).map(parseConnection).filter((c): c is HubConnection => c !== null);

/** Anything malformed is unavailable, so a bad answer can never make a provider tappable. */
export function parseProvider(raw: unknown): CatalogueProvider | null {
  const d = (raw ?? {}) as Record<string, any>;
  if (typeof d.provider !== 'string') return null;
  const tools = Array.isArray(d.tools) ? d.tools.filter((t: any) => typeof t?.tool === 'string')
    .map((t: any): CatalogueTool => ({ tool: t.tool, kind: t.kind === 'read' ? 'read' : 'write' })) : [];
  return {
    provider: d.provider, name: text(d.name) ?? d.provider, category: text(d.category),
    kind: d.kind === 'mcp' || d.kind === 'composio' ? d.kind : 'builtin', connect: strings(d.connect), tools,
    readiness: d.readiness === 'ready' ? 'ready' : 'unavailable', reason: text(d.reason) ?? (d.readiness === 'ready' ? null : 'unknown'),
    message: text(d.message),
  };
}
export const parseCatalogue = (list: unknown) =>
  (Array.isArray(list) ? list : []).map(parseProvider).filter((p): p is CatalogueProvider => p !== null);

/** Tolerant: a malformed entry, a non-HTTPS address or a repeated id is dropped; anything else is an empty list. */
export function parseMcpPresets(list: unknown): McpPreset[] {
  const seen = new Set<string>();
  return (Array.isArray(list) ? list : []).flatMap((raw): McpPreset[] => {
    const d = (raw ?? {}) as Record<string, any>;
    const id = text(d.id), name = text(d.name), url = text(d.url);
    if (!id || !name || !url || !/^https:\/\//i.test(url) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, url, category: text(d.category), tagline: text(d.tagline), native: text(d.native) }];
  });
}

export function parseMcpServer(raw: unknown): McpServer | null {
  const d = (raw ?? {}) as Record<string, any>;
  if (typeof d.connectionId !== 'string') return null;
  const tools = (list: unknown): McpTool[] => (Array.isArray(list) ? list : []).filter((t: any) => typeof t?.tool === 'string')
    .map((t: any) => ({ tool: t.tool, remoteName: String(t.remoteName ?? t.tool), description: text(t.description),
      kind: t.kind === 'read' ? 'read' : 'write', readOnlyHint: t.readOnlyHint === true, destructiveHint: t.destructiveHint === true }));
  const p = d.pending;
  return {
    kind: d.kind === 'local' ? 'local' : 'remote', localId: text(d.localId), hostId: text(d.hostId),
    connectionId: d.connectionId, provider: String(d.provider ?? ''), url: String(d.url ?? ''), name: text(d.name) ?? String(d.url ?? ''),
    auth: text(d.auth), status: d.status === 'pending_auth' || d.status === 'tools_changed' ? d.status : 'active',
    protocolVersion: text(d.protocolVersion), toolRevision: text(d.toolRevision), tools: tools(d.tools),
    pending: p && typeof p.revision === 'string' ? { revision: p.revision, added: strings(p.added), removed: strings(p.removed),
      changed: strings(p.changed), tools: tools(p.tools) } : null,
  };
}
export const parseSignIn = (d: any): SignIn | null =>
  d && typeof d.flowId === 'string' && typeof d.url === 'string' && d.url ? { flowId: d.flowId, url: d.url } : null;
export function parseFlow(d: any): FlowState {
  const status = ['pending', 'connected', 'failed', 'expired'].includes(d?.status) ? d.status : 'failed';
  return { status, error: text(d?.error), connection: parseConnection(d?.connection) };
}
export const parseGrant = (d: any): Grant | null => d && typeof d.connectionId === 'string'
  ? { id: String(d.id ?? ''), agentId: String(d.agentId ?? ''), connectionId: d.connectionId, operations: strings(d.operations),
    revision: Number(d.revision) || 1, revokedAt: text(d.revokedAt) } : null;
