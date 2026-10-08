import type { CatalogueProvider, ConnectionsApi, Grant, HubConnection, McpPreset, McpServer, McpTool } from '../src/agents/v2/connectionsModel';

/**
 * Simulated Agent v2 connections hub for `?v2` fixtures (phone and Mac). No live provider,
 * OAuth or MCP server: sign-ins resolve on the first poll and every call is recorded.
 */
export function fixtureConnections(calls: unknown[], options: { secondGmailGranted?: boolean; agentId?: string; presets?: boolean } = {}): ConnectionsApi {
  const clone = <T,>(value: T): T => structuredClone(value);
  const tool = (t: string, kind: 'read' | 'write') => ({ tool: t, kind });
  const catalogue: CatalogueProvider[] = [
    { provider: 'gmail', name: 'Gmail', category: 'Email', kind: 'builtin', connect: ['oauth'], readiness: 'ready', reason: null, message: null,
      tools: [tool('gmail_search', 'read'), tool('gmail_read', 'read'), tool('gmail_send', 'write')] },
    { provider: 'github', name: 'GitHub', category: 'Code', kind: 'builtin', connect: ['oauth', 'token'], readiness: 'ready', reason: null, message: null,
      tools: [tool('github_list_issues', 'read'), tool('github_create_issue', 'write'), tool('github_comment_issue', 'write')] },
    { provider: 'slack', name: 'Slack', category: 'Chat', kind: 'builtin', connect: ['oauth'], readiness: 'unavailable', reason: 'credentials_missing',
      message: 'Slack sign-in is not configured.', tools: [tool('slack_post_message', 'write')] },
    { provider: 'notion', name: 'Notion', category: 'Docs', kind: 'builtin', connect: ['oauth'], readiness: 'unavailable', reason: 'credentials_missing',
      message: null, tools: [tool('notion_search', 'read')] },
    { provider: 'linear', name: 'Linear', category: 'Work', kind: 'builtin', connect: ['oauth'], readiness: 'unavailable', reason: 'credentials_missing',
      message: null, tools: [tool('linear_create_issue', 'write')] },
    { provider: 'outlook_mail', name: 'Outlook Mail', category: 'Email', kind: 'builtin', connect: ['oauth'], readiness: 'unavailable', reason: 'credentials_missing',
      message: null, tools: [tool('outlook_mail_search', 'read')] },
    { provider: 'mcp', name: 'Remote MCP server', category: 'Custom', kind: 'mcp', connect: ['mcp_url'], readiness: 'ready', reason: null, message: null, tools: [] },
  ];
  // The service's popular remote servers: PayPal has no built-in twin, Notion and Linear stand in for built-ins that are not set up,
  // GitHub's built-in is connected in the browser fixture (so it is hidden), and Monday has no mark (neutral tile).
  const popular = (id: string, name: string, host: string, category: string, native: string | null = null): McpPreset =>
    ({ id, name, url: `https://${host}/mcp`, category, tagline: `${name} through its own MCP server`, native });
  const presets: McpPreset[] = options.presets === false ? [] : [
    popular('paypal', 'PayPal', 'mcp.paypal.com', 'Payments'), popular('notion', 'Notion', 'mcp.notion.com', 'Docs', 'notion'),
    popular('linear', 'Linear', 'mcp.linear.app', 'Work', 'linear'), popular('sentry', 'Sentry', 'mcp.sentry.dev', 'Monitoring'),
    popular('vercel', 'Vercel', 'mcp.vercel.com', 'Hosting'), popular('atlassian', 'Atlassian', 'mcp.atlassian.com', 'Work'),
    popular('github', 'GitHub', 'api.githubcopilot.com', 'Code', 'github'), popular('monday', 'Monday', 'mcp.monday.com', 'Work'),
    popular('docs', 'Docs example', 'docs.example.com', 'Docs'),
  ];
  const account = (id: string, provider: string, name: string, email: string | null, extra: Partial<HubConnection> = {}): HubConnection => ({
    id, provider, account: email, health: 'healthy', generation: 1, source: 'connection', createdAt: '2026-09-20T10:00:00Z', status: 'ok',
    name, accountLabel: email, email, scopes: [], scopesSource: 'requested', teammates: [], lastUsedAt: null, reconnect: null, mcp: null, ...extra });
  const mcpTool = (t: string, description: string, readOnlyHint: boolean): McpTool =>
    ({ tool: `mcp_ab12cd34__${t}`, remoteName: t, description, kind: 'write', readOnlyHint, destructiveHint: false });
  let connections: HubConnection[] = [
    account('123e4567-e89b-42d3-a456-00000000c001', 'gmail', 'Gmail', 'team@example.com', { source: 'install', lastUsedAt: new Date(Date.now() - 2 * 3600e3).toISOString(),
      teammates: [{ agentId: 'review', name: 'Code reviewer', operations: ['gmail_read', 'gmail_search'], revision: 1 }] }),
    account('123e4567-e89b-42d3-a456-00000000c002', 'gmail', 'Gmail', 'personal@example.com', { status: 'reconnect_required', health: 'reconnect_required',
      reconnect: { method: 'POST', path: '/api/agents/v2/connections/gmail/start' } }),
    account('123e4567-e89b-42d3-a456-00000000c003', 'mcp_ab12cd34', 'Docs MCP', null, { accountLabel: 'docs.example.com', status: 'needs_review',
      mcp: { serverId: 'srv-1', url: 'https://docs.example.com/mcp', status: 'tools_changed', protocolVersion: '2025-06-18', toolRevision: 'a'.repeat(64), pendingRevision: 'b'.repeat(64) } }),
  ];
  const servers: Record<string, McpServer> = {
    '123e4567-e89b-42d3-a456-00000000c003': { connectionId: '123e4567-e89b-42d3-a456-00000000c003', provider: 'mcp_ab12cd34', url: 'https://docs.example.com/mcp',
      name: 'Docs MCP', auth: 'oauth', status: 'tools_changed', protocolVersion: '2025-06-18', toolRevision: 'a'.repeat(64),
      tools: [mcpTool('search_docs', 'Search the documentation', true), mcpTool('publish_page', 'Publish a page', false)],
      pending: { revision: 'b'.repeat(64), added: ['mcp_ab12cd34__delete_page'], removed: [], changed: [],
        tools: [mcpTool('search_docs', 'Search the documentation', true), mcpTool('publish_page', 'Publish a page', false), mcpTool('delete_page', 'Delete a page', false)] } },
  };
  let grants: Grant[] = [{ id: 'grant-1', agentId: 'review', connectionId: '123e4567-e89b-42d3-a456-00000000c001', operations: ['gmail_read', 'gmail_search'], revision: 1, revokedAt: null }];
  const flows = new Map<string, string>();
  let added = 0, mcps = 0;
  const syncTeammates = () => { connections = connections.map(c => ({ ...c, teammates: grants.filter(g => g.connectionId === c.id)
    .map(g => ({ agentId: g.agentId, name: g.agentId === 'review' ? 'Code reviewer' : 'Website helper', operations: g.operations, revision: g.revision })) })); };
  const server = (id: string) => { const s = servers[id]; if (!s) throw new Error('404: MCP server not found'); return s; };
  // F-07: the teammate may use two Gmail accounts, so an approval card must add a short connection id.
  if (options.secondGmailGranted) {
    const agentId = options.agentId ?? 'review';
    grants = [...grants.map(g => ({ ...g, agentId })), { id: 'grant-2', agentId, connectionId: '123e4567-e89b-42d3-a456-00000000c002', operations: ['gmail_read'], revision: 1, revokedAt: null }];
    syncTeammates();
  }
  return {
    list: async () => { calls.push({ action: 'v2-connection-list' }); return clone(connections); },
    catalogue: async () => clone(catalogue),
    presets: async () => clone(presets),
    start: async (provider, returnUrl) => {
      calls.push({ action: 'v2-connection-start', provider, returnUrl: returnUrl ?? null });
      const flowId = `123e4567-e89b-42d3-a456-00000000f${String(flows.size).padStart(3, '0')}`;
      flows.set(flowId, provider);
      return { flowId, url: 'about:blank#fixture-sign-in' };
    },
    flow: async flowId => {
      const provider = flows.get(flowId);
      if (!provider) return { status: 'expired', error: 'Expired', connection: null };
      flows.delete(flowId);
      if (provider.startsWith('mcp:')) {
        const id = provider.slice(4);
        servers[id] = { ...servers[id]!, status: 'active' };
        connections = connections.map(c => c.id === id && c.mcp ? { ...c, mcp: { ...c.mcp, status: 'active' } } : c);
        return { status: 'connected', error: null, connection: clone(connections.find(c => c.id === id) ?? null) };
      }
      const next = account(`123e4567-e89b-42d3-a456-00000000d${String(++added).padStart(3, '0')}`, provider, catalogue.find(p => p.provider === provider)?.name ?? provider, `new${added}@example.com`);
      connections = [...connections, next];
      return { status: 'connected', error: null, connection: clone(next) };
    },
    paste: async (provider, credential) => {
      calls.push({ action: 'v2-connection-paste', provider, credentialLength: credential.length });
      const next = account(`123e4567-e89b-42d3-a456-00000000e${String(++added).padStart(3, '0')}`, provider, 'GitHub', null, { accountLabel: 'octo-second' });
      connections = [...connections, next]; return clone(next);
    },
    remove: async id => { calls.push({ action: 'v2-connection-delete', id }); connections = connections.filter(c => c.id !== id); grants = grants.filter(g => g.connectionId !== id); },
    grants: async agentId => clone(grants.filter(g => g.agentId === agentId)),
    putGrant: async (agentId, connectionId, operations) => {
      calls.push({ action: 'v2-grant-put', agentId, connectionId, operations: clone(operations) });
      const old = grants.find(g => g.agentId === agentId && g.connectionId === connectionId);
      const grant: Grant = { id: old?.id ?? `grant-${grants.length + 1}`, agentId, connectionId, operations, revision: (old?.revision ?? 0) + 1, revokedAt: null };
      grants = [...grants.filter(g => g !== old), grant]; syncTeammates(); return clone(grant);
    },
    revokeGrant: async (agentId, connectionId) => {
      calls.push({ action: 'v2-grant-delete', agentId, connectionId });
      grants = grants.filter(g => !(g.agentId === agentId && g.connectionId === connectionId)); syncTeammates();
    },
    addMcp: async (url, returnUrl, name) => {
      calls.push({ action: 'v2-mcp-add', url, returnUrl: returnUrl ?? null, ...(name ? { name } : {}) });
      const id = `123e4567-e89b-42d3-a456-00000000a${String(++mcps).padStart(3, '0')}`;
      const provider = `mcp_cd34ef${String(mcps).padStart(2, '0')}`, title = name ?? 'Wiki MCP';
      const c = account(id, provider, title, null, { accountLabel: new URL(url).host,
        mcp: { serverId: `srv-${id}`, url, status: name ? 'pending_auth' : 'active', protocolVersion: '2025-11-25', toolRevision: 'c'.repeat(64), pendingRevision: null } });
      servers[id] = { connectionId: id, provider, url, name: title, auth: null, status: name ? 'pending_auth' : 'active', protocolVersion: '2025-11-25', toolRevision: 'c'.repeat(64),
        tools: [{ ...mcpTool('read_wiki', 'Read a wiki page', true), tool: `${provider}__read_wiki` }], pending: null };
      connections = [...connections, c];
      // A preset needs the server's own sign-in (same sheet as any other account); a typed address here does not.
      const flowId = `123e4567-e89b-42d3-a456-00000000f${String(900 + mcps)}`;
      if (name) flows.set(flowId, `mcp:${id}`);
      return { connection: clone(c), server: clone(servers[id]), signIn: name ? { flowId, url: 'about:blank#fixture-sign-in' } : null };
    },
    mcp: async id => clone(server(id)),
    mcpSignIn: async id => { calls.push({ action: 'v2-mcp-signin', id }); return null; },
    mcpRefresh: async id => { calls.push({ action: 'v2-mcp-refresh', id }); return clone(server(id)); },
    mcpApprove: async (id, revision) => {
      calls.push({ action: 'v2-mcp-approve', id, revision });
      const s = server(id);
      if (!s.pending || s.pending.revision !== revision) throw new Error('409: stale_revision');
      Object.assign(s, { tools: s.pending.tools, toolRevision: revision, pending: null, status: 'active' });
      connections = connections.map(c => c.id === id ? { ...c, status: 'ok', mcp: c.mcp && { ...c.mcp, status: 'active', pendingRevision: null, toolRevision: revision } } : c);
      return clone(s);
    },
    mcpReads: async (id, tools) => {
      calls.push({ action: 'v2-mcp-reads', id, tools: clone(tools) });
      const s = server(id);
      if (tools.some(t => !s.tools.find(x => x.tool === t)?.readOnlyHint)) throw new Error('422: not_read_only');
      s.tools = s.tools.map(t => ({ ...t, kind: tools.includes(t.tool) ? 'read' : 'write' }));
      return clone(s);
    },
  };
}
