import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** Parses git's `key=value` credential protocol input. */
export function parseCredentialInput(text) {
  const out = {};
  for (const line of String(text).split('\n')) { const i = line.indexOf('='); if (i > 0) out[line.slice(0, i)] = line.slice(i + 1); }
  return out;
}
/** `owner/name` for an https github.com request, else null. Needs credential.useHttpPath=true. */
export function repoFromInput(kv) {
  if (kv.protocol !== 'https' || kv.host !== 'github.com' || !kv.path) return null;
  const repo = kv.path.replace(/^\/+/, '').replace(/\.git$/, '').split('/').slice(0, 2).join('/');
  return repoPattern.test(repo) && repo.split('/').every(p => p !== '.' && p !== '..') ? repo : null;
}
export const formatCredential = reply => `username=${reply.username}\npassword=${reply.password}\n`;

const procRead = file => { try { return fs.readFileSync(file); } catch { return null; } };
/** `push` when an ancestor process is `git push`, else `fetch`. Best effort: git does not tell helpers the operation. */
export function detectOp(env = process.env, pid = process.ppid, read = procRead) {
  if (env.VIBYRA_GIT_OP === 'push' || env.VIBYRA_GIT_OP === 'fetch') return env.VIBYRA_GIT_OP;
  for (let depth = 0; depth < 5 && pid > 1; depth++) {
    const cmd = read(`/proc/${pid}/cmdline`); if (!cmd) break;
    const argv = cmd.toString('utf8').split('\0');
    if (path.basename(argv[0]) === 'git' && argv.slice(1).includes('push')) return 'push';
    const stat = read(`/proc/${pid}/stat`)?.toString('utf8'); const next = stat ? Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) : 0;
    if (!next) break; pid = next;
  }
  return 'fetch';
}
/** One request/response over the root-owned unix socket. The runtime token is never involved here. */
export function askProxy(socketPath, request, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath); let data = '';
    const timer = setTimeout(() => { socket.destroy(); reject(Error('timeout')); }, timeoutMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', chunk => { data += chunk; if (data.length > 8192) socket.destroy(); });
    socket.on('error', e => { clearTimeout(timer); reject(e); });
    socket.on('close', () => { clearTimeout(timer); try { resolve(JSON.parse(data)); } catch { reject(Error('bad reply')); } });
  });
}
/** git credential helper entry. Returns the text to print; only `get` ever answers, nothing is stored. */
export async function runHelper({ action, input, env = process.env, ask = askProxy, op = detectOp(env), pid = process.pid }) {
  if (action !== 'get') return '';
  const repo = repoFromInput(parseCredentialInput(input)); if (!repo) return '';
  const reply = await ask(env.VIBYRA_GIT_SOCKET || '/run/vibyra/git.sock', { repo, op, ...(op === 'push' ? { pid } : {}) });
  return reply?.ok && reply.username && reply.password ? formatCredential(reply) : '';
}
