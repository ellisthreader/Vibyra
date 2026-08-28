import { formatBytes, type UpdateProgress } from "./updatePolicy.ts";

export type StartupUpdatePhase =
  | "checking"
  | "current"
  | "downloading"
  | "installing"
  | "failed";

export type StartupProgressMode = "hidden" | "indeterminate" | "determinate";

export interface StartupUpdateCopy {
  title: string;
  detail: string;
  progressMode: StartupProgressMode;
  progressValue: number | null;
  progressLabel: string;
}

const MAX_FAILURE_DETAIL_LENGTH = 180;

function releaseName(version: string): string {
  const cleanVersion = version.trim();
  return cleanVersion ? `Vibyra ${cleanVersion}` : "Vibyra";
}

function failureDetail(error: string | null, fallback: string): string {
  const cleanError = error?.trim();
  if (!cleanError) return fallback;
  if (cleanError.length <= MAX_FAILURE_DETAIL_LENGTH) return cleanError;
  return `${cleanError.slice(0, MAX_FAILURE_DETAIL_LENGTH - 1).trimEnd()}…`;
}

function boundedPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/** Pure presentation table for the pre-workspace updater surface. */
export function startupUpdateCopy(
  phase: StartupUpdatePhase,
  version: string,
  progress: UpdateProgress,
  error: string | null,
): StartupUpdateCopy {
  if (phase === "checking") {
    return {
      title: "Checking for updates",
      detail: "Preparing Vibyra.",
      progressMode: "indeterminate",
      progressValue: null,
      progressLabel: "Checking for updates",
    };
  }

  if (phase === "current") {
    return {
      title: "Vibyra is ready",
      detail: "Opening Vibyra…",
      progressMode: "determinate",
      progressValue: 100,
      progressLabel: "Update check complete",
    };
  }

  if (phase === "downloading") {
    const determinate = progress.total > 0;
    const percent = boundedPercent(progress.percent);
    const received = Math.min(Math.max(0, progress.received), progress.total);
    const size = `${formatBytes(received)} of ${formatBytes(progress.total)}`;
    return {
      title: `Downloading ${releaseName(version)}`,
      detail: determinate ? `${percent}% — ${size}` : "Downloading securely…",
      progressMode: determinate ? "determinate" : "indeterminate",
      progressValue: determinate ? percent : null,
      progressLabel: determinate ? `Downloading update, ${percent}%` : "Downloading update",
    };
  }

  if (phase === "installing") {
    return {
      title: `Installing ${releaseName(version)}`,
      detail: "Vibyra will restart automatically.",
      progressMode: "indeterminate",
      progressValue: null,
      progressLabel: "Installing update",
    };
  }

  const updateFailed = Boolean(version.trim());
  return {
    title: updateFailed ? "The update couldn’t be completed" : "We couldn’t check for updates",
    detail: failureDetail(
      error,
      updateFailed
        ? "Your current version is still safe to use."
        : "Check your connection and try again, or open Vibyra now.",
    ),
    progressMode: "hidden",
    progressValue: null,
    progressLabel: "Update paused",
  };
}
