import {
  parseCatalogue, parseConnection, parseConnections, parseFlow, parseGrant, parseMcpPresets, parseMcpServer, parseSignIn,
  type ConnectionsApi, type Grant,
} from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { rememberServerNames } from '../../../../mobile/src/agents/v2/providerLabels.ts';

/** The account bridge (`teammateApi`), injected so node tests exercise the real requests. */
export type HubRequest = <T>(path: string, body?: unknown, method?: 'PATCH' | 'PUT' | 'DELETE') => Promise<T>;

function need<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`The service returned an invalid ${what}. Try refreshing.`);
  return value;
}

/**
 * Agent V2 connections hub, grants and remote MCP on the Mac (contract §5, §6c). The same
 * `ConnectionsApi` the phone implements. Sign-in pages open in the external browser; the Mac
 * never shows a provider page inside Vibyra.
 */
export const connectionsClient = (api: HubRequest): ConnectionsApi => {
  const v2 = 'agents/v2';
  // The provider list and the popular MCP servers are one answer; asked for together they cost one request.
  let catalogueRequest: Promise<any> | null = null;
  const catalogueData = () => (catalogueRequest ??= api<any>(`${v2}/catalogue`).finally(() => { catalogueRequest = null; }));
  return {
    list: async () => {
      const list = parseConnections((await api<any>(`${v2}/connections`))?.connections);
      rememberServerNames(list); // an `mcp_…` provider id reads as the server's own name wherever it is shown
      return list;
    },
    catalogue: async () => parseCatalogue((await catalogueData())?.providers),
    presets: async () => parseMcpPresets((await catalogueData())?.mcpPresets),
    start: async provider => need(parseSignIn(await api(`${v2}/connections/${provider}/start`, {})), 'sign-in'),
    flow: async flowId => parseFlow(await api(`${v2}/connections/flows/${flowId}`)),
    paste: async (provider, credential) =>
      need(parseConnection((await api<any>(`${v2}/connections`, { provider, credential }))?.connection), 'connection'),
    remove: async id => { await api(`${v2}/connections/${id}`, undefined, 'DELETE'); },
    grants: async agentId => {
      const list = (await api<any>(`${v2}/agents/${agentId}/grants`))?.grants;
      return (Array.isArray(list) ? list : []).map(parseGrant).filter((g): g is Grant => g !== null);
    },
    putGrant: async (agentId, connectionId, operations) =>
      need(parseGrant((await api<any>(`${v2}/agents/${agentId}/grants/${connectionId}`, { operations }, 'PUT'))?.grant), 'grant'),
    revokeGrant: async (agentId, connectionId) => { await api(`${v2}/agents/${agentId}/grants/${connectionId}`, undefined, 'DELETE'); },
    // `name` is a preset's own; without it the service names the server from its address.
    addMcp: async (url, _returnUrl, name) => {
      const data = await api<any>(`${v2}/mcp/servers`, name ? { url, name } : { url });
      return { connection: need(parseConnection(data?.connection), 'connection'), server: need(parseMcpServer(data?.server), 'MCP server'),
        signIn: parseSignIn(data?.signIn) };
    },
    mcp: async id => need(parseMcpServer((await api<any>(`${v2}/mcp/servers/${id}`))?.server), 'MCP server'),
    mcpSignIn: async id => { const data = await api<any>(`${v2}/mcp/servers/${id}/signin`, {}); return parseSignIn(data?.signIn ?? data); },
    mcpRefresh: async id => need(parseMcpServer((await api<any>(`${v2}/mcp/servers/${id}/refresh`, {}))?.server), 'MCP server'),
    mcpApprove: async (id, revision) => need(parseMcpServer((await api<any>(`${v2}/mcp/servers/${id}/approve`, { revision }))?.server), 'MCP server'),
    mcpReads: async (id, tools) => need(parseMcpServer((await api<any>(`${v2}/mcp/servers/${id}/reads`, { tools }, 'PUT'))?.server), 'MCP server'),
  };
};
