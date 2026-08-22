// Measures how congested the main thread is, without competing for it.
//
// Deliberately NOT a requestAnimationFrame loop. WebKitGTK throttles rAF hard
// when nothing is animating, so an idle app would read as a few frames a second
// — a false alarm — and a permanent loop keeps the compositor awake, costing the
// very performance it claims to measure. One timer per second, comparing the
// interval it asked for against the one it got, measures blockage directly and
// behaves the same on WebKitGTK and WebView2.

const SAMPLE_MS = 1_000;
/** Weight of the newest sample; roughly a five-sample window. */
const EMA_ALPHA = 0.4;

/** Exported for tests: the smoothing that keeps one stray GC off the verdict. */
export function nextEma(previous: number | null, sample: number): number {
  if (previous === null) return sample;
  return previous + EMA_ALPHA * (sample - previous);
}

export interface DriftSample {
  /** Smoothed `actualInterval - SAMPLE_MS`, floored at zero. */
  lagMs: number;
  /** Long tasks seen since the last sample. Chromium/WebView2 only; always 0
   * on WebKitGTK, which does not implement the Long Tasks API. */
  longTasks: number;
}

function supportsLongTasks(): boolean {
  const types = globalThis.PerformanceObserver?.supportedEntryTypes;
  return Array.isArray(types) && types.includes("longtask");
}

/** Counts >50ms tasks where the engine reports them, and stays silent where it
 * does not. Enrichment only — the drift signal never depends on this. */
function observeLongTasks(bump: () => void): () => void {
  if (!supportsLongTasks()) return () => {};
  try {
    const observer = new PerformanceObserver((list) => {
      for (let index = 0; index < list.getEntries().length; index += 1) bump();
    });
    observer.observe({ type: "longtask", buffered: false });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

/**
 * Starts sampling and returns the stop function. `onSample` fires once a second
 * and must stay cheap: it runs on the same thread it is measuring.
 */
export function startDriftSampler(onSample: (sample: DriftSample) => void): () => void {
  let ema: number | null = null;
  let longTasks = 0;
  let last = performance.now();
  const stopLongTasks = observeLongTasks(() => {
    longTasks += 1;
  });
  const timer = setInterval(() => {
    const now = performance.now();
    const drift = Math.max(0, now - last - SAMPLE_MS);
    last = now;
    ema = nextEma(ema, drift);
    const sample: DriftSample = { lagMs: ema, longTasks };
    longTasks = 0;
    onSample(sample);
  }, SAMPLE_MS);
  return () => {
    clearInterval(timer);
    stopLongTasks();
  };
}
