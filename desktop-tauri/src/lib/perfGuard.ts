import type { NotificationInput } from "../notificationTypes";
import type { PerfLevel, PerfReason, PerfVerdict, PerfWindow } from "./perfPolicy";

// The debounce between "the machine looks busy" and "tell the user". Everything
// here is pure: the sampler feeds verdicts in, notifications come out.

/** Consecutive bad windows before we believe it (~4s at a 1Hz sample). */
export const ENTER_SAMPLES = 4;
/** Consecutive good windows before we forget it. Deliberately far longer. */
export const EXIT_SAMPLES = 20;
export const COOLDOWN_MS = 10 * 60_000;
/** A hint, not a monitor: three per app run, then silence. */
export const MAX_PER_SESSION = 3;
/** Startup is always janky; measuring it would only produce a false positive. */
export const WARMUP_MS = 30_000;

export interface PerfGuardState {
  level: PerfLevel;
  badRun: number;
  goodRun: number;
  fired: number;
  lastFiredAt: Partial<Record<PerfReason, number>>;
  preempted: Partial<Record<PerfReason, boolean>>;
}

export interface PerfGuardContext {
  /** Milliseconds since the workspace mounted. */
  uptimeMs: number;
  /** Lag the user cannot see is lag they cannot be annoyed by. */
  away: boolean;
  window: PerfWindow;
}

export function initialGuardState(): PerfGuardState {
  return { level: "ok", badRun: 0, goodRun: 0, fired: 0, lastFiredAt: {}, preempted: {} };
}

function message(reason: PerfReason, window: PerfWindow): NotificationInput {
  const base = { category: "performance", severity: "warning", osEligible: false } as const;
  if (reason === "compositing") {
    const canPromoteAuto = window.autoGraphics && window.graphicsSwitchAvailable;
    return {
      ...base,
      title: canPromoteAuto
        ? "Auto detected slow terminal rendering"
        : "Vibyra is running in compatibility graphics mode",
      body: canPromoteAuto
        ? "The WebKit renderer is saturating a CPU core. Use GPU acceleration the next time Vibyra starts."
        : "Terminal output is composited on the CPU, which is why things feel slow. Allowing GPU acceleration may fix it.",
      dedupeKey: "perf:compositing",
      action: canPromoteAuto
        ? { id: "enableAcceleratedGraphics", label: "Allow GPU next launch" }
        : { id: "openGraphicsSettings", label: "Open graphics settings" },
    };
  }
  if (reason === "memory") {
    return {
      ...base,
      title: "Memory is nearly full",
      body: "Hibernating terminals you are not using frees their memory straight away.",
      dedupeKey: "perf:memory",
      action: { id: "hibernateIdleTerminals", label: "Hibernate idle terminals" },
    };
  }
  const panes = window.workingPanes;
  return {
    ...base,
    title: "Your machine is under load",
    body: panes > 1
      ? `${panes} agents are streaming output. Hibernating the idle ones frees CPU.`
      : "Vibyra may feel laggy until this settles.",
    dedupeKey: `perf:${reason}`,
    action: { id: "hibernateIdleTerminals", label: "Hibernate idle terminals" },
  };
}

/** True when this reason may fire now: never twice inside a cooldown, unless a
 * severe verdict spends its one allowed pre-emption. */
function allowed(state: PerfGuardState, verdict: PerfVerdict, now: number): boolean {
  if (state.fired >= MAX_PER_SESSION) return false;
  const last = state.lastFiredAt[verdict.reason];
  if (last === undefined || now - last >= COOLDOWN_MS) return true;
  return verdict.level === "severe" && !state.preempted[verdict.reason];
}

export function nextGuardState(
  prev: PerfGuardState,
  verdict: PerfVerdict,
  now: number,
  context: PerfGuardContext,
): { state: PerfGuardState; notify: NotificationInput | null } {
  // Browsers throttle timers while a window is hidden. Counting those delayed
  // callbacks would let background drift pre-qualify an episode, then fire a
  // stale warning on the first tick after focus returns. A visible problem must
  // earn the full consecutive-sample threshold again.
  if (context.away) {
    return { state: { ...prev, badRun: 0, goodRun: 0 }, notify: null };
  }

  if (verdict.level === "ok") {
    const goodRun = prev.goodRun + 1;
    const level: PerfLevel = goodRun >= EXIT_SAMPLES ? "ok" : prev.level;
    return { state: { ...prev, badRun: 0, goodRun, level }, notify: null };
  }

  const badRun = prev.badRun + 1;
  const state: PerfGuardState = { ...prev, badRun, goodRun: 0 };
  if (badRun < ENTER_SAMPLES) return { state, notify: null };
  if (context.uptimeMs < WARMUP_MS) {
    return { state: { ...state, level: verdict.level }, notify: null };
  }
  if (!allowed(state, verdict, now)) {
    return { state: { ...state, level: verdict.level }, notify: null };
  }

  const usedPreemption =
    state.lastFiredAt[verdict.reason] !== undefined && verdict.level === "severe";
  return {
    state: {
      ...state,
      level: verdict.level,
      // Firing closes the episode: the run must build back up to ENTER_SAMPLES
      // before another notification is considered, so a machine that stays busy
      // is judged once rather than re-judged every second.
      badRun: 0,
      fired: state.fired + 1,
      lastFiredAt: { ...state.lastFiredAt, [verdict.reason]: now },
      preempted: usedPreemption
        ? { ...state.preempted, [verdict.reason]: true }
        : state.preempted,
    },
    notify: message(verdict.reason, context.window),
  };
}
