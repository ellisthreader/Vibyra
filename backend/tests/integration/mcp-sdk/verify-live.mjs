import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// Usage: node verify-live.mjs https://vibyra.app /private/path/read-only-key
// Only synthetic acceptance accounts: output contains counts, never account data.
const [origin, keyPath, phase = 'active'] = process.argv.slice(2);
assert.ok(origin && keyPath, 'Supply an HTTPS origin and a private API-key file.');
const base = new URL(origin);
assert.equal(base.protocol, 'https:');
assert.equal(base.username + base.password + base.search + base.hash, '');
assert.equal(statSync(keyPath).mode & 0o077, 0, 'API-key file must be owner-only.');
const key = readFileSync(keyPath, 'utf8').trim();
assert.match(key, /^vyk_[A-Za-z0-9]{40}$/);
assert.ok(['active', 'revoked'].includes(phase));
const endpoint = new URL('/api/platform/mcp', base);
const request = async (body, token = key, extra = {}) => fetch(endpoint, {
  method: 'POST', signal: AbortSignal.timeout(20_000),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});
const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
const unauthorized = await request(ping, phase === 'revoked' ? key : `vyk_${'0'.repeat(40)}`);
assert.equal(unauthorized.status, 401, 'Invalid or revoked keys must be refused.');
if (phase === 'revoked') {
  console.log('PASS revoked key: HTTP 401');
  process.exit(0);
}
for (const mode of ['legacy', { pin: '2026-07-28' }]) {
  const label = typeof mode === 'string' ? mode : 'modern';
  const client = new Client({ name: 'vibyra-live-acceptance', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, 'Vibyra');
    const catalogue = await client.listTools();
    assert.deepEqual(catalogue.tools.map(t => t.name).sort(), ['get_run', 'list_projects', 'list_runs']);
    for (const name of ['list_projects', 'list_runs']) {
      const result = await client.callTool({ name, arguments: name === 'list_runs' ? { limit: 1 } : {} });
      assert.equal(result.isError, false, `${name} should succeed`);
      const data = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(data[name === 'list_runs' ? 'runs' : 'projects']));
    }
    const denied = await client.callTool({ name: 'start_run', arguments: { prompt: 'Acceptance: this read-only key must never start a run.' } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /does not have the runs:create scope/);
    console.log(`PASS live ${label}: discovery, scoped catalogue, reads and write refusal`);
  } finally { await client.close(); }
}
const malformed = await request({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, key, { 'MCP-Protocol-Version': '2026-07-28' });
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).error.code, -32602);
console.log('PASS modern metadata enforcement and invalid-key refusal');
