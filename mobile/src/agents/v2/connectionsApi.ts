import { apiUrl, requestJson } from '../../transport/requestJson';
import { RunError } from './runsApi';
import {
  parseCatalogue, parseConnection, parseConnections, parseFlow, parseGrant, parseMcpServer, parseSignIn,
  type ConnectionsApi, type Grant, type HubConnection, type McpServer,
} from './connectionsModel';

/**
 * Agent V2 connections hub, grants and remote MCP client (docs/agent-v2-api-contract.md §5, §6c).
 * Refusals keep the contract's machine `code` beside the words, as the runs client does.
 */
export function createConnectionsApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): ConnectionsApi {
  const call = async (method: string, path: string, body?: unknown) => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to manage connections.', 401, null);
    let result;
    try {
      result = await requestJson(fetcher, apiUrl(baseUrl, `agents/v2/${path}`), {
        method,
        headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, 25000);
    } catch {
      throw new RunError('Connection interrupted. Try again.', 0, null);
    }
    const { response, data } = result;
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (!response.ok) {
      const field = data.errors && typeof data.errors === 'object' ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
      throw new RunError(data.error ?? field ?? data.message ?? 'Connections could not be reached.', response.status,
        typeof data.code === 'string' ? data.code : null);
    }
    return data;
  };
  const id = encodeURIComponent;
  const connection = (data: any): HubConnection => {
    const parsed = parseConnection(data?.connection);
    if (!parsed) throw new RunError('This server returned an unsupported connection.', 502, null);
    return parsed;
  };
  const server = (data: any): McpServer => {
    const parsed = parseMcpServer(data?.server);
    if (!parsed) throw new RunError('This server returned an unsupported MCP server.', 502, null);
    return parsed;
  };
  const grant = (data: any): Grant => {
    const parsed = parseGrant(data?.grant);
    if (!parsed) throw new RunError('This server returned an unsupported grant.', 502, null);
    return parsed;
  };
  const returnBody = (returnUrl?: string) => (returnUrl ? { returnUrl } : {});
  return {
    list: async () => parseConnections((await call('GET', 'connections')).connections),
    catalogue: async () => parseCatalogue((await call('GET', 'catalogue')).providers),
    start: async (provider, returnUrl) => {
      const signIn = parseSignIn(await call('POST', `connections/${id(provider)}/start`, returnBody(returnUrl)));
      if (!signIn) throw new RunError('This server returned no sign-in page.', 502, null);
      return signIn;
    },
    flow: async flowId => parseFlow(await call('GET', `connections/flows/${id(flowId)}`)),
    paste: async (provider, credential) => connection(await call('POST', 'connections', { provider, credential })),
    remove: async connectionId => { await call('DELETE', `connections/${id(connectionId)}`); },
    grants: async agentId => {
      const list = (await call('GET', `agents/${id(agentId)}/grants`)).grants;
      return (Array.isArray(list) ? list : []).map(parseGrant).filter((g): g is Grant => g !== null);
    },
    putGrant: async (agentId, connectionId, operations) =>
      grant(await call('PUT', `agents/${id(agentId)}/grants/${id(connectionId)}`, { operations })),
    revokeGrant: async (agentId, connectionId) => { await call('DELETE', `agents/${id(agentId)}/grants/${id(connectionId)}`); },
    addMcp: async (url, returnUrl) => {
      const data = await call('POST', 'mcp/servers', { url, ...returnBody(returnUrl) });
      return { connection: connection(data), server: server(data), signIn: parseSignIn(data.signIn) };
    },
    mcp: async connectionId => server(await call('GET', `mcp/servers/${id(connectionId)}`)),
    mcpSignIn: async (connectionId, returnUrl) => {
      const data = await call('POST', `mcp/servers/${id(connectionId)}/signin`, returnBody(returnUrl));
      return parseSignIn(data?.signIn ?? data);
    },
    mcpRefresh: async connectionId => server(await call('POST', `mcp/servers/${id(connectionId)}/refresh`, {})),
    mcpApprove: async (connectionId, revision) => server(await call('POST', `mcp/servers/${id(connectionId)}/approve`, { revision })),
    mcpReads: async (connectionId, tools) => server(await call('PUT', `mcp/servers/${id(connectionId)}/reads`, { tools })),
  };
}
