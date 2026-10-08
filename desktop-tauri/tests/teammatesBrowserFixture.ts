import { fixtureBrowser } from '../../mobile/tests/agentsBrowserAccessFixture';

/** The phone's simulated browser access behind the Mac bridge's `agents/v2/agents/<id>/browser` path. */
export function browserFixture() {
  const calls: any[] = [];
  const api = fixtureBrowser(calls);
  const request = (path: string, body: any, method?: string): Promise<unknown> | undefined => {
    const match = /^agents\/v2\/agents\/([^/]+)\/browser$/.exec(path);
    if (!match) return undefined;
    if (method === 'PUT') return api.put(match[1]!, body.origins).then(browser => ({ browser }));
    if (method === 'DELETE') return api.remove(match[1]!).then(() => ({ ok: true }));
    return api.get(match[1]!);
  };
  return { state: { calls }, request };
}
