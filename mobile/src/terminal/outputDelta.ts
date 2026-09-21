// The UI keeps a bounded tail. Find retained history in linear time so trimming
// does not reset/reparse the entire terminal on every high-volume output frame.
export function outputDelta(previous: string, next: string): { reset: boolean; data: string } {
  if (next.startsWith(previous)) return { reset: false, data: next.slice(previous.length) };
  if (!next || previous.length < 4096) return { reset: true, data: next };
  // Once the tail is full, every frame is the previous text minus a little of
  // its head plus the new bytes. The ledger trims at a line start, so the
  // first stretch of `next` is somewhere in `previous`: a native search finds
  // it in microseconds, where the table below cost tens of milliseconds a
  // frame — at fifty frames a second, a busy agent stuttered the whole phone.
  const needle = next.slice(0, 256);
  if (needle.length === 256) {
    for (let at = previous.indexOf(needle); at >= 0; at = previous.indexOf(needle, at + 1)) {
      const tail = previous.slice(at);
      if (next.startsWith(tail)) return { reset: false, data: next.slice(tail.length) };
    }
  }
  const prefix = new Uint32Array(next.length);
  for (let i = 1, j = 0; i < next.length; i++) {
    while (j > 0 && next[i] !== next[j]) j = prefix[j - 1]!;
    if (next[i] === next[j]) j++;
    prefix[i] = j;
  }
  let overlap = 0;
  for (let i = 0; i < previous.length; i++) {
    while (overlap > 0 && (overlap === next.length || previous[i] !== next[overlap])) overlap = prefix[overlap - 1]!;
    if (previous[i] === next[overlap]) overlap++;
  }
  return overlap >= 1024 ? { reset: false, data: next.slice(overlap) } : { reset: true, data: next };
}
