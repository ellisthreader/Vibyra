import { fixtureConnections } from '../../mobile/tests/agentsConnectionsFixture';

/**
 * The phone's simulated Agent v2 hub behind the Mac bridge's paths (`teammate_request`), so both
 * clients are proven against one fixture. Returns undefined for paths outside the hub.
 */
export function connectionsFixture(options: { secondGmailGranted?: boolean; agentId?: string; presets?: boolean } = {}) {
  const calls: any[] = [];
  const api = fixtureConnections(calls, options);
  const state = { calls, opened: [] as string[] };
  const request = (path: string, body: any, method?: string): Promise<unknown> | undefined => {
    const p = path.replace(/^agents\/v2\//, '').split('/');
    // `mcpPresets` rides beside `providers` on the same answer (empty when remote MCP is off).
    if (p[0] === 'catalogue') return Promise.all([api.catalogue(), api.presets?.() ?? []]).then(([providers, mcpPresets]) => ({ providers, mcpPresets }));
    if (p[0] === 'connections') {
      if (p.length === 1) return body ? api.paste(body.provider, body.credential).then(connection => ({ connection })) : api.list().then(connections => ({ connections }));
      if (p[1] === 'flows') return api.flow(p[2]!);
      if (p[2] === 'start') return api.start(p[1]!).then(s => { state.opened.push(s.url); return s; });
      if (method === 'DELETE') return api.remove(p[1]!).then(() => ({ ok: true }));
    }
    if (p[0] === 'agents' && p[2] === 'grants') {
      if (p.length === 3) return api.grants(p[1]!).then(grants => ({ grants }));
      if (method === 'PUT') return api.putGrant(p[1]!, p[3]!, body.operations).then(grant => ({ grant }));
      if (method === 'DELETE') return api.revokeGrant(p[1]!, p[3]!).then(() => ({ ok: true }));
    }
    if (p[0] === 'mcp' && p[1] === 'servers') {
      if (p.length === 2) return api.addMcp(body.url, undefined, body.name).then(added => ({ ...added }));
      const id = p[2]!;
      if (p.length === 3) return api.mcp(id).then(server => ({ server }));
      if (p[3] === 'signin') return api.mcpSignIn(id).then(signIn => ({ signIn }));
      if (p[3] === 'refresh') return api.mcpRefresh(id).then(server => ({ server }));
      if (p[3] === 'approve') return api.mcpApprove(id, body.revision).then(server => ({ server }));
      if (p[3] === 'reads' && method === 'PUT') return api.mcpReads(id, body.tools).then(server => ({ server }));
    }
    return undefined;
  };
  return { state, request };
}
