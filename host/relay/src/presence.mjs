// What the API learns from this relay, and all it learns: which computers are
// online, and when a phone's session with one starts and ends. Never a frame,
// never a byte of terminal traffic — those are Noise-encrypted end to end and
// the relay could not read them if it tried.
//
// Events are queued and posted in batches, with a presence heartbeat every
// `heartbeatMs` naming every registered computer, so the API's idea of who is
// online recovers on its own after either side restarts. Without an API URL
// (a local relay, or the tests) nothing is sent and nothing is kept.
export function createReporter({ apiUrl, secret, relayId, fetch: fetchImpl = globalThis.fetch,
  heartbeatMs = 30000, flushMs = 500, log = console } = {}) {
  const queue = [];
  const hosts = new Map();
  let timer = null;
  let sending = false;
  let heartbeat = null;
  const enabled = Boolean(apiUrl && secret);
  const endpoint = enabled ? `${apiUrl.replace(/\/+$/, '')}/api/remote/relay/events` : null;

  function push(event) {
    if (!enabled) return;
    queue.push({ ...event, at: new Date().toISOString() });
    if (queue.length > 2000) queue.splice(0, queue.length - 2000);
    if (!timer) timer = setTimeout(flush, flushMs);
  }
  async function flush() {
    timer = null;
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, 200);
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ relayId, events: batch }) });
      if (!response.ok) throw new Error(`API answered ${response.status}`);
    } catch (error) {
      // Put the batch back in front; the next flush or heartbeat retries it.
      queue.unshift(...batch);
      log.warn?.(`Relay could not report presence: ${error.message}`);
    } finally {
      sending = false;
      if (queue.length && !timer) timer = setTimeout(flush, Math.min(flushMs * 20, 10000));
    }
  }
  return {
    enabled,
    hostOnline(hostId, userId) { hosts.set(hostId, { userId, clients: 0 }); push({ event: 'host.online', hostId, userId }); },
    hostOffline(hostId, userId) { hosts.delete(hostId); push({ event: 'host.offline', hostId, userId }); },
    sessionStarted(hostId, userId, clientId, jti) {
      const host = hosts.get(hostId); if (host) host.clients += 1;
      push({ event: 'session.started', hostId, userId, clientId, jti });
    },
    sessionEnded(hostId, userId, clientId, jti) {
      const host = hosts.get(hostId); if (host) host.clients = Math.max(0, host.clients - 1);
      push({ event: 'session.ended', hostId, userId, clientId, jti });
    },
    presence() { return [...hosts].map(([hostId, host]) => ({ hostId, userId: host.userId, clients: host.clients })); },
    start() {
      if (!enabled || heartbeat) return;
      heartbeat = setInterval(() => push({ event: 'presence', hosts: this.presence() }), heartbeatMs);
      heartbeat.unref?.();
    },
    stop() { if (heartbeat) clearInterval(heartbeat); heartbeat = null; if (timer) clearTimeout(timer); timer = null; },
    flush,
  };
}
