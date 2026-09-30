import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local backend starts the Vibes queue and stops its sibling after a child failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vibyra-backend-start-'));
  try {
    const php = join(dir, 'php');
    await writeFile(php, `#!${process.execPath}
const fs = require('fs');
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({args:process.argv.slice(2),workers:process.env.PHP_CLI_SERVER_WORKERS})+'\\n');
if(process.argv.includes('queue:work'))setTimeout(()=>process.exit(7),250);
else {setInterval(()=>{},1000);process.on('SIGTERM',()=>{fs.appendFileSync(process.env.PROBE_LOG,'stopped\\n');process.exit(0)});}
`);
    await chmod(php, 0o755);
    const child = spawn(process.execPath, [resolve('scripts/serve-backend.mjs'), '127.0.0.1', '8999'], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROBE_LOG: join(dir, 'events') },
      stdio: 'pipe',
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    const [code] = await once(child, 'exit');
    clearTimeout(timer);
    assert.equal(code, 1);
    const lines = (await readFile(join(dir, 'events'), 'utf8')).trim().split('\n');
    const starts = lines.filter(line => line !== 'stopped').map(JSON.parse);
    assert.ok(starts.some(({ args, workers }) => args.includes('serve') && args.includes('--no-reload') && Number(workers) >= 2));
    assert.ok(starts.some(({ args }) => args.includes('queue:work') && args.includes('--queue=vibes,default')));
    assert.ok(lines.includes('stopped'), 'The remaining web child must stop too');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
