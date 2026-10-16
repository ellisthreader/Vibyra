// How fast each account may move data through the relay, and how much it has
// moved since the last report to the API. The relay cannot read frames, so it
// cannot tell terminal text from Live Preview pictures; it shapes speed instead.
// A sender over its rate is paused rather than cut off, so a terminal keeps
// working while a heavy stream simply slows down.
//
// Each account has a token bucket that refills at its rate and holds one second
// of data. `slowed` accounts (over their monthly allowance, as the API reports
// back) refill at the much lower slowed rate.
export const DEFAULT_BYTES_PER_SECOND = 4 * 1024 * 1024;
export const DEFAULT_SLOWED_BYTES_PER_SECOND = 16 * 1024;
const MAX_WAIT_MS = 5000;

export function createAllowance({ bytesPerSecond = DEFAULT_BYTES_PER_SECOND,
  slowedBytesPerSecond = DEFAULT_SLOWED_BYTES_PER_SECOND, now = Date.now } = {}) {
  const buckets = new Map();
  const unreported = new Map();
  let slowed = new Set();
  const metrics = { pauses: 0 };
  const rate = userId => (slowed.has(String(userId)) ? slowedBytesPerSecond : bytesPerSecond);

  return {
    /** Counts `bytes` against the account; returns how long the sender should wait, in ms (0 = carry on). */
    charge(userId, bytes) {
      const key = String(userId);
      unreported.set(key, (unreported.get(key) ?? 0) + bytes);
      const limit = rate(key);
      const at = now();
      const bucket = buckets.get(key) ?? { level: limit, at };
      bucket.level = Math.min(limit, bucket.level + ((at - bucket.at) / 1000) * limit) - bytes;
      bucket.at = at;
      buckets.set(key, bucket);
      if (bucket.level >= 0) return 0;
      metrics.pauses++;
      return Math.min(MAX_WAIT_MS, Math.ceil((-bucket.level / limit) * 1000));
    },
    /** Bytes moved per account since the last call, for the usage report. */
    drain() {
      const usage = Object.fromEntries(unreported);
      unreported.clear();
      return usage;
    },
    /** The accounts the API says are over their monthly allowance. */
    setSlowed(userIds) {
      if (!Array.isArray(userIds)) return;
      slowed = new Set(userIds.slice(0, 100000).map(String));
      for (const key of buckets.keys()) {
        const bucket = buckets.get(key);
        bucket.level = Math.min(bucket.level, rate(key));
      }
    },
    isSlowed(userId) { return slowed.has(String(userId)); },
    forget(userId) { buckets.delete(String(userId)); },
    diagnostics() { return { ...metrics, slowedAccounts: slowed.size, bytesPerSecond, slowedBytesPerSecond }; },
  };
}

// One pause per socket, extended rather than stacked: messages the socket had
// already buffered still arrive after `pause()` and add to the debt, and an
// earlier, shorter timer must not resume it before the longest wait is over.
const holds = new WeakMap();
export function holdSocket(socket, ms) {
  const until = Date.now() + ms;
  const current = holds.get(socket);
  if (current) { current.until = Math.max(current.until, until); return; }
  const state = { until };
  holds.set(socket, state);
  socket.pause();
  const check = () => {
    const left = state.until - Date.now();
    if (left > 0) { setTimeout(check, left).unref?.(); return; }
    holds.delete(socket);
    if (socket.readyState === 1) socket.resume();
  };
  setTimeout(check, ms).unref?.();
}
