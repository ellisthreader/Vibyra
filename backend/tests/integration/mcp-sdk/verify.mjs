import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '../../..');
const temp = mkdtempSync(resolve(tmpdir(), 'vibyra-mcp-sdk-'));
const db = resolve(temp, 'testing.sqlite'); writeFileSync(db, '', { mode: 0o600 });
const env = { ...process.env, APP_ENV: 'testing', APP_DEBUG: 'false', APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
  APP_CONFIG_CACHE: resolve(temp, 'config.php'), APP_ROUTES_CACHE: resolve(temp, 'routes.php'),
  DB_CONNECTION: 'sqlite', DB_DATABASE: db, DB_URL: '', CACHE_STORE: 'array', SESSION_DRIVER: 'array', QUEUE_CONNECTION: 'sync',
  LOG_CHANNEL: 'stderr', PLATFORM_API_KEYS_ENABLED: 'true', PLATFORM_MCP_SERVER_ENABLED: 'true' };
let server;
try {
  execFileSync('php', [resolve(here, 'guard.php')], { cwd: backend, env, stdio: 'pipe' });
  execFileSync('php', ['artisan', 'migrate', '--force'], { cwd: backend, env, stdio: 'pipe' });
  const key = execFileSync('php', [resolve(here, 'seed.php')], { cwd: backend, env, encoding: 'utf8' }).trim();
  assert.match(key, /^vyk_[A-Za-z0-9]{40}$/);
  const port = await new Promise((done, fail) => {
    const socket = createServer(); socket.once('error', fail);
    socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => done(p)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'public/index.php'], { cwd: backend, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${origin}/up`); break; } catch { await new Promise(done => setTimeout(done, 100)); }
  }
  const failures = [];
  for (const mode of ['legacy', { pin: '2026-07-28' }]) {
    const label = typeof mode === 'string' ? mode : 'modern';
    const client = new Client({ name: 'vibyra-acceptance', version: '1.0.0' }, { versionNegotiation: { mode } });
    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/api/platform/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.name, 'Vibyra');
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map(t => t.name).sort(), ['get_run', 'list_projects', 'list_runs']);
      const result = await client.callTool({ name: 'list_projects', arguments: {} });
      assert.equal(result.isError, false);
      assert.deepEqual(JSON.parse(result.content[0].text), { projects: [] });
      const refused = await client.callTool({ name: 'start_run', arguments: { prompt: 'Must be refused' } });
      assert.equal(refused.isError, true);
      console.log(`PASS ${label}: discovery, scoped catalogue, read and unauthorized write refusal`);
    } catch (e) { failures.push(`${label}: ${e.message}`); }
    finally { await client.close(); }
  }
  assert.deepEqual(failures, []);
} finally {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(done => server.once('exit', done)); }
  rmSync(temp, { recursive: true, force: true });
}
