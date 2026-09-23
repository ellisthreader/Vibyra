import { spawn } from 'node:child_process';

// Keep HTTP and queued phone replies together, including on macOS (Bash 3).
const [host = '127.0.0.1', port = '8000'] = process.argv.slice(2);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
function start(args, env = process.env) {
  const child = spawn('php', ['artisan', ...args], { stdio: 'inherit', env });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', () => { if (!stopping) stop(1); });
}
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
start(['serve', `--host=${host}`, `--port=${port}`, '--no-reload'],
  { ...process.env, PHP_CLI_SERVER_WORKERS: process.env.VIBYRA_WEB_WORKERS || '4' });
start(['queue:work', '--queue=vibes,default', '--sleep=2', '--tries=1', '--timeout=1200', '--max-time=0']);
