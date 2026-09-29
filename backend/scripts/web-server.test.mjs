import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { webConfig } from './web-config.mjs';

test('separate pool keeps control responsive during long streams and blocks private files', { timeout: 20000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'vibyra-web-test-'));
  mkdirSync(join(root, 'public')); mkdirSync(join(root, 'body')); mkdirSync(join(root, 'fastcgi'));
  writeFileSync(join(root, 'public', '.env'), 'private');
  mkdirSync(join(root, 'public', 'assets'));
  writeFileSync(join(root, 'public', 'assets', 'app.css'), 'body { color: blue; }');
  writeFileSync(join(root, 'public', 'secret.PHP'), '<?php echo secret;');
  writeFileSync(join(root, 'public', 'index.php'), `<?php
if ($_SERVER['REQUEST_URI'] === '/slow') { header('Content-Type: text/event-stream');
  while (ob_get_level()) ob_end_flush(); echo "data: first\\n\\n"; flush(); sleep(2); echo "data: last\\n\\n"; }
else if (str_starts_with($_SERVER['REQUEST_URI'], '/inspect')) { header('Content-Type: application/json');
  echo json_encode(['query' => $_GET, 'uri' => $_SERVER['REQUEST_URI'], 'auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? null,
    'forwardedProto' => $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null, 'method' => $_SERVER['REQUEST_METHOD'], 'body' => file_get_contents('php://input')]); }
else { echo 'control'; }
`);
  const port = 19000 + Math.floor(Math.random() * 9000);
  const config = webConfig({ root, runtime: root, port, general: 1, control: 1, user: userInfo().username, group: execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim() });
  for (const [file, value] of [['nginx.conf', config.nginx], ['fpm.conf', config.fpm]]) writeFileSync(join(root, file), value);
  const processes = [
    spawn(process.env.VIBYRA_PHP_FPM_BIN || 'php-fpm', ['-F', '-y', join(root, 'fpm.conf')], { stdio: ['ignore', 'ignore', 'pipe'] }),
    spawn(process.env.VIBYRA_NGINX_BIN || 'nginx', ['-p', root, '-c', join(root, 'nginx.conf')], { stdio: ['ignore', 'ignore', 'pipe'] }),
  ];
  let spawnError;
  let startupErrors = '';
  for (const child of processes) child.stderr.on('data', chunk => { startupErrors = (startupErrors + chunk).slice(-4000); });
  for (const child of processes) child.on('error', error => { spawnError = error; });
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      try { if ((await fetch(base + '/up')).ok) { ready = true; break; } } catch {}
      await delay(50);
    }
    assert.ok(ready, 'server starts: ' + startupErrors);
    for (const path of ['/', '/assets', '/assets/']) {
      const page = await fetch(base + path);
      assert.equal(page.status, 200, `${path} reaches front controller`);
      assert.equal(await page.text(), 'control');
    }
    const asset = await fetch(base + '/assets/app.css?version=1');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /text\/css/);
    assert.equal(await asset.text(), 'body { color: blue; }');
    const inspection = await fetch(base + '/inspect?message=a%20b&n=2', { method: 'POST',
      headers: { authorization: 'Bearer integration-only', 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ works: true }) });
    assert.deepEqual(await inspection.json(), { query: { message: 'a b', n: '2' }, uri: '/inspect?message=a%20b&n=2',
      auth: 'Bearer integration-only', forwardedProto: 'https', method: 'POST', body: '{"works":true}' });
    const start = performance.now();
    const stream = await fetch(base + '/slow');
    const reader = stream.body.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /data: first/);
    assert.ok(performance.now() - start < 1500, 'first SSE event is not buffered until completion');
    const controlStart = performance.now();
    const control = await fetch(base + '/api/remote/hosts');
    assert.equal(await control.text(), 'control');
    assert.ok(performance.now() - controlStart < 1000, 'reserved pool bypasses occupied general pool');
    assert.equal((await fetch(base + '/.env')).status, 403);
    assert.equal((await fetch(base + '/index.php')).status, 404);
    assert.equal((await fetch(base + '/secret.PHP')).status, 404);
    assert.equal((await fetch(base + '/index.php/path')).status, 404);
    assert.equal(control.headers.get('x-powered-by'), null);
    await reader.cancel();
  } finally {
    await Promise.all(processes.map(async child => {
      if (child.exitCode !== null || !child.pid) return;
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited; clearTimeout(timer);
    }));
    rmSync(root, { recursive: true, force: true });
  }
});
