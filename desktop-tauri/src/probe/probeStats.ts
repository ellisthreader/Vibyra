// Bookkeeping for the keystroke-latency probe: pure, so the resolution rules
// (FIFO matching, late echoes, dropped keys) are testable without a terminal.

export interface KeystrokeSample {
  /** performance.now() when the key was handed to xterm. */
  sent: number;
  /** The echo byte arrived from native, parsed, and was painted — or null
   * while still pending. */
  event: number | null;
  parse: number | null;
  paint: number | null;
}

/** Keystrokes resolve strictly in the order they were sent: the echo stream
 * of a single quiet pane cannot reorder. `count` echoes arrived at `event`;
 * returns the samples that this event resolved, so the caller can stamp
 * their parse/paint times when those happen. */
export function resolveEchoes(
  pending: KeystrokeSample[],
  count: number,
  event: number,
): KeystrokeSample[] {
  const resolved = pending.splice(0, Math.min(count, pending.length));
  for (const sample of resolved) sample.event = event;
  return resolved;
}

/** Occurrences of the marker in an output chunk. */
export function countMarkers(data: string, marker: string): number {
  let count = 0;
  let at = data.indexOf(marker);
  while (at !== -1) {
    count += 1;
    at = data.indexOf(marker, at + marker.length);
  }
  return count;
}

export interface LatencySummary {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export function summarize(values: number[]): LatencySummary {
  if (values.length === 0) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    n: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}

export interface PhaseReport {
  phase: string;
  /** Keystroke → echo delivered to the webview. */
  echo: LatencySummary;
  /** Keystroke → xterm finished parsing the echo. */
  parse: LatencySummary;
  /** Keystroke → the next frame after the parse, i.e. it is on screen. */
  paint: LatencySummary;
  /** Keys whose echo never arrived inside the timeout. */
  dropped: number;
  /** Renderer frame spacing while the phase ran. */
  frames: LatencySummary;
}

export function phaseReport(
  phase: string,
  samples: KeystrokeSample[],
  dropped: number,
  frameGaps: number[],
): PhaseReport {
  const done = samples.filter((sample) => sample.paint !== null);
  return {
    phase,
    echo: summarize(done.map((sample) => (sample.event ?? 0) - sample.sent)),
    parse: summarize(done.map((sample) => (sample.parse ?? 0) - sample.sent)),
    paint: summarize(done.map((sample) => (sample.paint ?? 0) - sample.sent)),
    dropped,
    frames: summarize(frameGaps),
  };
}
