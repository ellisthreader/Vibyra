// What the API learns from this relay, and all it learns: which computers are
// online, when a phone's session with one starts and ends, and how many bytes
// each account moved (for its monthly allowance). Never a frame,
// never a byte of terminal traffic — those are Noise-encrypted end to end and
// the relay could not read them if it tried.
//
// Events are queued and posted in batches, with a presence heartbeat every
// `heartbeatMs` naming every registered computer, so the API's idea of who is
// online recovers on its own after either side restarts. Without an API URL
// (a local relay, or the tests) nothing is sent and nothing is kept.
export function createReporter({ apiUrl, secret, relayId, fetch: fetchImpl = globalThis.fetch,
  heartbeatMs = 30000, flushMs = 500, log = console, usage = null, onReply = null } = {}) {
  const queue = [];
  const hosts = new Map();
  let timer = null;
  let sending = false;
  let heartbeat = null;
  let stopped = false;
  let failures = 0;
  let lastSuccessAt = null;
  const enabled = Boolean(apiUrl && secret);
  const endpoint = enabled ? `${apiUrl.replace(/\/+$/, '')}/api/remote/relay/events` : null;

  function push(event) {
    if (!enabled || stopped) return;
    queue.push({ ...event, at: new Date().toISOString() });
    if (queue.length > 2000) queue.splice(0, queue.length - 2000);
    if (!timer) timer = setTimeout(flush, flushMs);
  }
  async function flush() {
    timer = null;
    if (stopped || sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, 200);
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ relayId, events: batch }) });
      if (!response.ok) throw new Error(`API answered ${response.status}`);
      lastSuccessAt = Date.now();
      // The API answers with the accounts now over their monthly allowance.
      try { onReply?.(await response.json()); } catch { /* an empty or older reply changes nothing */ }
    } catch (error) {
      // Put the batch back in front; the next flush or heartbeat retries it.
      failures++;
      queue.unshift(...batch);
      if (queue.length > 2000) queue.splice(0, queue.length - 2000);
      log.warn?.(`Relay could not report presence: ${error.message}`);
    } finally {
      sending = false;
      if (!stopped && queue.length && !timer) timer = setTimeout(flush, Math.min(flushMs * 20, 10000));
    }
  }
  return {
    enabled,
    diagnostics() { return { enabled, queued: queue.length, failures, lastSuccessAt }; },
    hostOnline(hostId, userId, generation = 0) { hosts.set(hostId, { userId, generation, clients: 0 }); push({ event: 'host.online', hostId, userId, generation }); },
    hostOffline(hostId, userId, generation = 0) { if (hosts.get(hostId)?.userId === userId && hosts.get(hostId)?.generation === generation) hosts.delete(hostId); push({ event: 'host.offline', hostId, userId, generation }); },
    sessionStarted(hostId, userId, clientId, jti, generation = 0) {
      const host = hosts.get(hostId); if (host?.userId === userId && host.generation === generation) host.clients += 1;
      push({ event: 'session.started', hostId, userId, clientId, jti, generation });
    },
    sessionEnded(hostId, userId, clientId, jti, generation = 0) {
      const host = hosts.get(hostId); if (host?.userId === userId && host.generation === generation) host.clients = Math.max(0, host.clients - 1);
      push({ event: 'session.ended', hostId, userId, clientId, jti, generation });
    },
    presence() { return [...hosts].map(([hostId, host]) => ({ hostId, userId: host.userId, generation: host.generation, clients: host.clients })); },
    start() {
      stopped = false;
      if (!enabled || heartbeat) return;
      heartbeat = setInterval(() => {
        push({ event: 'presence', hosts: this.presence() });
        const bytes = usage?.();
        if (bytes && Object.keys(bytes).length) push({ event: 'usage', bytes });
      }, heartbeatMs);
      heartbeat.unref?.();
    },
    stop() { stopped = true; if (heartbeat) clearInterval(heartbeat); heartbeat = null; if (timer) clearTimeout(timer); timer = null; },
    flush,
  };
}
