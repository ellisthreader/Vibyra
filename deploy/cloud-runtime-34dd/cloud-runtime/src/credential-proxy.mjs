import net from 'node:net';
import fs from 'node:fs/promises';
import { resolvePushRefs } from './push-refs.mjs';

const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/** Validates a helper request; returns the sanitized request or null. Push branches must be vibyra/*; `pid` is the helper's own process id. */
export function checkRequest(raw) {
  if (!raw || typeof raw !== 'object' || !repoPattern.test(raw.repo) || raw.repo.split('/').some(p => p === '.' || p === '..')) return null;
  if (raw.op !== 'fetch' && raw.op !== 'push') return null;
  if (raw.branch !== undefined && (typeof raw.branch !== 'string' || raw.branch.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(raw.branch))) return null;
  if (raw.op === 'push' && raw.branch !== undefined && !raw.branch.startsWith('vibyra/')) return null;
  if (raw.pid !== undefined && (!Number.isInteger(raw.pid) || raw.pid < 2 || raw.pid > 4194304)) return null;
  return { repo: raw.repo, op: raw.op, ...(raw.branch !== undefined ? { branch: raw.branch } : {}), ...(raw.pid !== undefined ? { pid: raw.pid } : {}) };
}
/** Runtime API call made by the root supervisor, which alone holds the runtime token. */
export const apiCredential = client => async req => {
  const query = new URLSearchParams({ repo: req.repo, op: req.op, ...(req.branch ? { branch: req.branch } : {}) });
  return client.call(`/git/credential?${query}`);
};
/**
 * Root-owned unix socket the project user can talk to. It returns only username, password and expiry
 * (<=10 min, minted by the backend), never the runtime token, and logs nothing about the exchange.
 */
export async function startCredentialProxy({ socketPath, fetchCredential, gid = null, maxConcurrent = 4, resolvePush = pid => resolvePushRefs(pid) }) {
  await fs.rm(socketPath, { force: true });
  let active = 0;
  const server = net.createServer(socket => {
    let data = ''; let answered = false; socket.setEncoding('utf8');
    const reply = body => { if (answered) return; answered = true; socket.end(JSON.stringify(body) + '\n'); };
    const timer = setTimeout(() => reply({ ok: false, error: 'timeout' }), 20000); socket.on('close', () => clearTimeout(timer));
    socket.on('error', () => {});
    socket.on('data', async chunk => {
      data += chunk; if (data.length > 2048) return reply({ ok: false, error: 'denied' });
      if (!data.includes('\n') || answered) return;
      let request = null; try { request = checkRequest(JSON.parse(data.split('\n')[0])); } catch { /* denied below */ }
      if (!request) return reply({ ok: false, error: 'denied' });
      if (active >= maxConcurrent) return reply({ ok: false, error: 'busy' });
      active++;
      try {
        // A push credential is minted per destination ref, derived from the real `git push` behind the helper's pid, never from the
        // helper's own claim; fetch is unchanged. Any ambiguity is a generic refusal.
        let r;
        if (request.op === 'push') {
          const refs = request.pid ? await resolvePush(request.pid) : null;
          if (!Array.isArray(refs) || !refs.length) return reply({ ok: false, error: 'denied' });
          for (const ref of refs) {
            r = await fetchCredential({ repo: request.repo, op: 'push', branch: ref.replace(/^refs\/heads\//, '') });
            if (typeof r?.username !== 'string' || typeof r?.password !== 'string') throw Error('unusable'); // every ref must be allowed
          }
        } else r = await fetchCredential({ repo: request.repo, op: 'fetch' });
        if (typeof r?.username !== 'string' || typeof r?.password !== 'string') throw Error('unusable');
        reply({ ok: true, username: r.username, password: r.password, expiresAt: r.expiresAt ?? null });
      } catch { reply({ ok: false, error: 'unavailable' }); } finally { active--; }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  if (gid !== null && process.getuid?.() === 0) await fs.chown(socketPath, 0, gid);
  await fs.chmod(socketPath, 0o660);
  return { close: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); fs.rm(socketPath, { force: true }); }) };
}
