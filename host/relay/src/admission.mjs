// Do not trust forwarded headers until ingress identity is configured and tested.
// A generous transport-peer cap accommodates shared proxy/mobile NAT addresses;
// account limits apply after cryptographic authentication.
export function createAdmission({ now = Date.now, attemptsPerMinute = 600,
  maxPending = 128, maxAddresses = 4096 } = {}) {
  const attempts = new Map();
  const pending = new Set();
  const metrics = { refused: 0 };
  return {
    metrics,
    accept(req) {
      const at = now();
      for (const [ip, item] of attempts) if (at - item.at >= 60000) attempts.delete(ip);
      const ip = req.socket.remoteAddress;
      let item = attempts.get(ip);
      if (!item) {
        if (attempts.size >= maxAddresses) { metrics.refused++; return false; }
        attempts.set(ip, item = { at, count: 0 });
      }
      if (++item.count > attemptsPerMinute || pending.size >= maxPending) { metrics.refused++; return false; }
      return true;
    },
    track(socket) { pending.add(socket); socket.once('close', () => pending.delete(socket)); },
    authenticated(socket) { pending.delete(socket); },
  };
}
