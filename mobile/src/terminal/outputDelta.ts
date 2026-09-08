// The UI keeps a bounded tail. Find retained history in linear time so trimming
// does not reset/reparse the entire terminal on every high-volume output frame.
export function outputDelta(previous: string, next: string): { reset: boolean; data: string } {
  if (next.startsWith(previous)) return { reset: false, data: next.slice(previous.length) };
  if (!next || previous.length < 4096) return { reset: true, data: next };
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
