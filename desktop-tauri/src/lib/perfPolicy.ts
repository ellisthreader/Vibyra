// Pure verdict for "is this machine struggling?". Kept free of timers, IPC and
// React so every threshold below is directly testable.

export type PerfReason = "eventLoop" | "cpu" | "memory" | "compositing";
export type PerfLevel = "ok" | "degraded" | "severe";

/** Smoothed event-loop drift, in ms, over the last second. */
export const LAG_DEGRADED_MS = 250;
export const LAG_SEVERE_MS = 800;
/** Whole-system CPU, percent. */
export const CPU_DEGRADED = 85;
/** Vibyra's own CPU, already divided by core count. */
export const APP_CPU_DEGRADED = 70;
/** WebKit page renderer, expressed as raw load on its single hot core. */
export const RENDERER_CPU_DEGRADED = 80;
/** Used / total system memory. */
export const MEM_DEGRADED = 0.9;
export const MEM_SEVERE = 0.96;

export interface PerfWindow {
  /** EMA of `actualInterval - 1000`. The primary signal; always present. */
  lagMs: number;
  /** Native samples are absent until the first `perf_sample` resolves. */
  cpuPercent: number | null;
  appCpuPercent: number | null;
  rendererCpuPercent: number | null;
  memRatio: number | null;
  /** WebKit is compositing in shared memory — a known-slow path. */
  softwareCompositing: boolean;
  /** Auto may offer a one-click accelerated next launch without overriding an explicit choice. */
  autoGraphics: boolean;
  /** False when an environment variable makes the saved setting inert. */
  graphicsSwitchAvailable: boolean;
  /** Panes currently streaming output, used to pick the actionable message. */
  workingPanes: number;
}

export interface PerfVerdict {
  level: PerfLevel;
  reason: PerfReason;
}

const OK: PerfVerdict = { level: "ok", reason: "eventLoop" };

function memoryVerdict(ratio: number | null): PerfVerdict | null {
  if (ratio === null) return null;
  if (ratio >= MEM_SEVERE) return { level: "severe", reason: "memory" };
  if (ratio >= MEM_DEGRADED) return { level: "degraded", reason: "memory" };
  return null;
}

function cpuIsHot(window: PerfWindow): boolean {
  return (
    (window.cpuPercent !== null && window.cpuPercent >= CPU_DEGRADED) ||
    (window.appCpuPercent !== null && window.appCpuPercent >= APP_CPU_DEGRADED) ||
    (window.rendererCpuPercent !== null &&
      window.rendererCpuPercent >= RENDERER_CPU_DEGRADED)
  );
}

/**
 * Classifies one sampling window.
 *
 * Memory outranks everything because it has a different fix. Otherwise, when the
 * webview is on WebKit's shared-memory compositing path we attribute the stall to
 * `compositing`: it is the same slowness, but it has a one-switch remedy, so
 * naming it beats telling the user their computer is busy.
 */
export function judge(window: PerfWindow): PerfVerdict {
  const memory = memoryVerdict(window.memRatio);
  if (memory) return memory;

  const laggy = window.lagMs >= LAG_DEGRADED_MS;
  const stalled = window.lagMs >= LAG_SEVERE_MS;
  const hot = cpuIsHot(window);
  if (!laggy && !hot) return OK;

  const level: PerfLevel = stalled ? "severe" : "degraded";
  if (window.softwareCompositing) return { level, reason: "compositing" };
  return { level, reason: hot ? "cpu" : "eventLoop" };
}
