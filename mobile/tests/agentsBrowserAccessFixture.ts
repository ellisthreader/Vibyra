import type { BrowserApi, BrowserGrant } from '../src/agents/v2/browserModel';

/**
 * Simulated Agent v2 browser access for `?v2&browser` fixtures (phone and Mac): one teammate already
 * holds one site. No live Chrome, site or Mac is involved; every call is recorded.
 */
export function fixtureBrowser(calls: unknown[]): BrowserApi {
  const grant = (origins: string[]): BrowserGrant => ({ connectionId: '123e4567-e89b-42d3-a456-00000000b001', grantId: 'browser-grant-1', origins, generation: 1, updatedAt: null });
  let current: BrowserGrant | null = grant(['https://news.example.com']);
  return {
    get: async () => ({ enabled: true, browser: current && structuredClone(current) }),
    put: async (agentId, origins) => {
      calls.push({ action: 'v2-browser-put', agentId, origins: [...origins] });
      current = grant(origins.map(o => (o.startsWith('http') ? o : `https://${o}`)));
      return structuredClone(current);
    },
    remove: async agentId => { calls.push({ action: 'v2-browser-remove', agentId }); current = null; },
  };
}
