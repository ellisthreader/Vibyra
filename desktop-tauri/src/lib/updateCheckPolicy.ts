// Pure rules for Settings → Updates: how the state of a check, plus the state
// of any release it found, turn into one headline, one detail line and at most
// one button. Free of Tauri and React imports so the whole matrix is testable
// without a webview.

import { formatBytes, type UpdateProgress, type UpdateStatus } from "./updatePolicy.ts";

/** Tracks the *check itself*, deliberately apart from `UpdateStatus`, which
 * tracks the release lifecycle. The split is what lets a failing feed show up
 * in Settings without the announcement banner claiming a release exists. */
export type CheckState = "idle" | "checking" | "done" | "failed";

export type CheckTone = "neutral" | "ok" | "info" | "busy" | "error";

/** Which store method the button runs. Kept as data rather than a callback so
 * the whole table can be asserted without mounting React. */
export type CheckAction = "check" | "download" | "restart";

export interface UpdateSnapshot {
  status: UpdateStatus;
  checkState: CheckState;
  version: string;
  progress: UpdateProgress;
  /** Download/install failure. */
  error: string | null;
  /** Failure of the check request itself — a different thing entirely. */
  checkError: string | null;
}

export interface UpdateSummary {
  tone: CheckTone;
  headline: string;
  detail: string;
  action: { label: string; kind: CheckAction; busy: boolean } | null;
}

/**
 * The one place that answers "what is going on with updates, and what can I
 * press about it". A live release always outranks the check that found it, so
 * the status branches come first; `checkState` is the whole story only once
 * `status` is idle, which is the common case.
 */
export function updateSummary(snapshot: UpdateSnapshot): UpdateSummary {
  const { status, checkState, version, progress, error, checkError } = snapshot;

  if (status === "restartError") {
    return {
      tone: "error",
      headline: "Restart paused",
      detail: error ?? "Vibyra could not safely save your terminals before restarting.",
      action: { label: "Try restart again", kind: "restart", busy: false },
    };
  }
  if (status === "installing") {
    return {
      tone: "busy",
      headline: `Preparing Vibyra ${version}`,
      detail: "Saving every open terminal before restart…",
      action: { label: "Preparing…", kind: "restart", busy: true },
    };
  }
  if (status === "ready") {
    return {
      tone: "info",
      headline: `Vibyra ${version} is ready to install`,
      detail: "Restart to finish installing — open terminals will close.",
      action: { label: "Restart now", kind: "restart", busy: false },
    };
  }
  if (status === "downloading") {
    return {
      tone: "busy",
      headline: `Downloading Vibyra ${version}`,
      detail: progress.total > 0
        ? `${progress.percent}% — ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
        : "Downloading…",
      action: { label: "Downloading…", kind: "download", busy: true },
    };
  }
  if (status === "error") {
    return {
      tone: "error",
      headline: "Update failed",
      detail: error ?? "Something went wrong downloading the update.",
      action: { label: "Try again", kind: "download", busy: false },
    };
  }
  if (status === "available") {
    return {
      tone: "info",
      headline: `Vibyra ${version} is available`,
      detail: "Downloading takes about a minute, and you choose when to restart.",
      action: { label: "Download update", kind: "download", busy: false },
    };
  }

  if (checkState === "checking") {
    return {
      tone: "busy",
      headline: "Checking for updates…",
      detail: "Asking the release feed whether a newer build exists.",
      action: { label: "Checking…", kind: "check", busy: true },
    };
  }
  if (checkState === "failed") {
    return {
      tone: "error",
      headline: "Couldn't check for updates",
      detail: checkError
        ? `The release feed could not be reached — ${checkError}`
        : "The release feed could not be reached. Check your connection and try again.",
      action: { label: "Try again", kind: "check", busy: false },
    };
  }
  if (checkState === "done") {
    return {
      tone: "ok",
      headline: "Vibyra is up to date",
      detail: "You are on the newest published release.",
      action: { label: "Check again", kind: "check", busy: false },
    };
  }
  return {
    tone: "neutral",
    headline: "Vibyra updates itself",
    detail: "It checks shortly after launch, then every 20 minutes while open.",
    action: { label: "Check for updates", kind: "check", busy: false },
  };
}

/** Coarse on purpose: this line exists to prove the check is alive, not to be
 * a clock, and anything minute-accurate would go stale the moment the pane
 * stopped re-rendering. */
export function formatCheckedAt(lastCheckedAt: number | null, now: number): string {
  if (!lastCheckedAt) return "No successful check yet this session";
  const minutes = Math.floor(Math.max(0, now - lastCheckedAt) / 60_000);
  if (minutes < 1) return "Last checked just now";
  if (minutes < 60) return `Last checked ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last checked ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Last checked ${days} day${days === 1 ? "" : "s"} ago`;
}
