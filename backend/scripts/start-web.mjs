import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webConfig } from './web-config.mjs';
import { serviceIdentity, prepareRuntime, verifyApplicationWrites } from './web-runtime.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtime = mkdtempSync(join(tmpdir(), 'vibyra-web-'));
const identity = serviceIdentity();
prepareRuntime(runtime, identity);
verifyApplicationWrites(root, identity);
const config = webConfig({ root, runtime, port: Number(process.env.PORT || 8000),
  general: Number(process.env.VIBYRA_WEB_WORKERS || 8), control: Number(process.env.VIBYRA_CONTROL_WORKERS || 2),
  user: identity.user, group: identity.group });
writeFileSync(join(runtime, 'nginx.conf'), config.nginx);
writeFileSync(join(runtime, 'php-fpm.conf'), config.fpm);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
  const kill = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 5000);
  kill.unref();
}
for (const [command, args] of [
  [process.env.VIBYRA_PHP_FPM_BIN || 'php-fpm', ['--nodaemonize', '--fpm-config', join(runtime, 'php-fpm.conf')]],
  [process.env.VIBYRA_NGINX_BIN || 'nginx', ['-p', runtime, '-c', join(runtime, 'nginx.conf')]],
]) {
  const child = spawn(command, args, { stdio: 'inherit' }); children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', () => { if (!stopping) stop(1); });
}
process.on('SIGTERM', () => stop(0)); process.on('SIGINT', () => stop(0));
