import { randomUUID } from 'node:crypto';

// Every admission consults durable API state: a relay restart cannot resurrect
// a revoked signed grant. Renewals extend only a locally admitted connection.
export function createAuthorization({ apiUrl, secret, fetchImpl = globalThis.fetch,
  now = Date.now, leaseMs = 180000, renewMs = 60000 } = {}) {
  leaseMs = Math.min(180000, Math.max(1000, leaseMs));
  renewMs = Math.min(60000, Math.max(250, renewMs));
  const entries = new Map();
  const metrics = { admissions: 0, denied: 0, failures: 0, expired: 0 };
  const endpoint = apiUrl && `${apiUrl.replace(/\/+$/, '')}/api/remote/relay/authorize`;
  async function check(token, renewal) {
    if (!endpoint || !secret) throw new Error('Authorization service unavailable');
    const response = await fetchImpl(endpoint, { method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      body: JSON.stringify({ token, renewal }) });
    if (!response.ok) throw new Error('Authorization service unavailable');
    const result = await response.json();
    if (result.ok !== true || typeof result.allowed !== 'boolean') throw new Error('Invalid authorization response');
    return result.allowed;
  }
  async function admit(token) {
    metrics.admissions++;
    try {
      if (!await check(token, false)) { metrics.denied++; return null; }
      const id = randomUUID();
      entries.set(id, { token, until: now() + leaseMs, renewAt: now() + renewMs, pending: false });
      return id;
    } catch { metrics.failures++; return null; }
  }
  async function tick() {
    for (const [id, entry] of entries) {
      if (now() >= entry.until) {
        entries.delete(id); metrics.expired++; entry.close?.(); continue;
      }
      if (entry.pending || now() < entry.renewAt) continue;
      entry.pending = true; entry.renewAt = now() + renewMs;
      void check(entry.token, true).then(allowed => {
        if (entries.get(id) !== entry) return;
        // A delayed reply must never restore an already expired lease.
        if (!allowed || now() >= entry.until) {
          entries.delete(id); metrics.denied++; entry.close?.();
        } else entry.until = now() + leaseMs;
      }).catch(() => { metrics.failures++; }).finally(() => { entry.pending = false; });
    }
  }
  const timer = setInterval(tick, 250); timer.unref?.();
  return { admit, tick, metrics,
    bind(id, close) { const entry = entries.get(id); if (entry) entry.close = close; },
    release(id) { entries.delete(id); },
    close() { clearInterval(timer); entries.clear(); },
  };
}
