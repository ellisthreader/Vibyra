// Pure copy rules for the boot window: one signal from Rust in, one line of
// text and one rail state out. Free of Tauri and DOM imports so the whole
// matrix is testable without a webview — the same shape `updatePolicy.ts`
// uses for the in-session updater, and for the same reason.

/** Mirrors `BootPhase` in `src-tauri/src/boot_window.rs`. The two lists are
 * pinned to each other by `bootState.test.mjs`, which reads the Rust source —
 * a phase added on one side only would otherwise render as a blank line. */
export type BootPhase =
  | "starting"
  | "checking"
  | "downloading"
  | "installing"
  | "launching"
  | "failed";

export interface BootSignal {
  phase: BootPhase;
  /** The release being fetched or applied; absent outside those phases. */
  version?: string;
  /** 0–100, sent only once the server announces a content length. Absent
   * means "downloading, total unknown", which the rail shows as a sweep
   * rather than a bar pinned at zero. */
  percent?: number;
}

export interface BootView {
  status: string;
  /** False sweeps the sliver; true fills the rail to `percent`. */
  determinate: boolean;
  percent: number;
}

/** Named rather than inlined so the copy reads the same in both branches: a
 * download and the install that follows it must refer to the release the same
 * way, or the line appears to change subject halfway through. */
function release(version: string | undefined): string {
  const trimmed = (version ?? "").trim();
  return trimmed ? `Vibyra ${trimmed}` : "the update";
}

function clampPercent(percent: number | undefined): number {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/**
 * The one place that decides what the boot window says.
 *
 * Every phase resolves to a line — there is no empty state, because a splash
 * showing a mark and nothing else reads as a hang. `failed` is deliberately
 * reassuring rather than alarming: the app is about to open regardless, and
 * an update that could not install is not the user's problem to solve here.
 */
export function bootView(signal: BootSignal): BootView {
  const percent = clampPercent(signal.percent);
  const determinate = signal.phase === "downloading" && typeof signal.percent === "number";

  if (signal.phase === "downloading") {
    const name = release(signal.version);
    return {
      status: determinate ? `Downloading ${name} — ${percent}%` : `Downloading ${name}…`,
      determinate,
      percent,
    };
  }

  const status: Record<Exclude<BootPhase, "downloading">, string> = {
    starting: "Starting up…",
    checking: "Checking for updates…",
    installing: `Installing ${release(signal.version)}…`,
    launching: "Opening your workspace…",
    failed: "Couldn't install the update — starting anyway…",
  };

  return { status: status[signal.phase], determinate: false, percent: 0 };
}
