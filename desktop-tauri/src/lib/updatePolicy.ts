// Pure rules for the in-app updater: how a download-progress stream turns
// into a percentage, and what the banner says at each step. Kept free of
// Tauri imports so the whole flow is testable without a webview.

/** Mirrors `DownloadEvent` from `@tauri-apps/plugin-updater`. */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export type UpdateStatus =
  | "idle"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "restartError"
  | "error";

export interface UpdateProgress {
  received: number;
  /** 0 until the server announces a length — some responses omit it. */
  total: number;
  percent: number;
}

export const NO_PROGRESS: UpdateProgress = { received: 0, total: 0, percent: 0 };

/** `Progress` carries a chunk size, never a running total, so the received
 * count has to be accumulated here. A missing/zero `contentLength` leaves
 * `percent` at 0 and the UI falls back to an indeterminate bar. */
export function advanceProgress(
  current: UpdateProgress,
  event: DownloadEvent,
): UpdateProgress {
  if (event.event === "Started") {
    return { ...NO_PROGRESS, total: Math.max(0, event.data.contentLength ?? 0) };
  }
  if (event.event === "Finished") {
    return { ...current, percent: 100 };
  }
  const received = current.received + Math.max(0, event.data.chunkLength);
  if (current.total <= 0) {
    return { ...current, received, percent: 0 };
  }
  const capped = Math.min(received, current.total);
  return {
    received: capped,
    total: current.total,
    percent: Math.min(100, Math.round((capped / current.total) * 100)),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export interface BannerCopy {
  title: string;
  detail: string;
  action: string;
  /** Whether the primary button should be disabled while work is in flight. */
  busy: boolean;
}

export interface NavUpdateCopy {
  label: string;
  title: string;
  busy: boolean;
}

/** Compact titlebar copy keeps the update reachable after its banner is
 * dismissed without turning the chrome into a second notification card. */
export function navUpdateCopy(
  status: UpdateStatus,
  version: string,
  progress: UpdateProgress,
): NavUpdateCopy | null {
  if (status === "idle" || !version) return null;
  if (status === "ready") {
    return { label: "Restart to update", title: `Install Vibyra ${version}`, busy: false };
  }
  if (status === "installing") {
    return { label: "Saving terminals…", title: `Installing Vibyra ${version}`, busy: true };
  }
  if (status === "restartError") {
    return { label: "Retry restart", title: `Retry installing Vibyra ${version}`, busy: false };
  }
  if (status === "downloading") {
    const label = progress.total > 0 ? `Updating ${progress.percent}%` : "Updating…";
    return { label, title: `Downloading Vibyra ${version}`, busy: true };
  }
  if (status === "error") {
    return { label: "Retry update", title: `Retry Vibyra ${version}`, busy: false };
  }
  return { label: `Update ${version}`, title: `Update to Vibyra ${version}`, busy: false };
}

/** Release notes are author-written and can be any length; the banner has one
 * line for them, so anything longer falls back to the generic prompt rather
 * than overflowing the card. */
const MAX_NOTE_LENGTH = 90;

export function bannerCopy(
  status: UpdateStatus,
  version: string,
  progress: UpdateProgress,
  error: string | null,
  notes = "",
): BannerCopy {
  if (status === "restartError") {
    return {
      title: "Restart paused",
      detail: error ?? "Vibyra could not safely save and restart.",
      action: "Try restart again",
      busy: false,
    };
  }
  if (status === "error") {
    return {
      title: "Update failed",
      detail: error ?? "Something went wrong downloading the update.",
      action: "Try again",
      busy: false,
    };
  }
  if (status === "ready") {
    return {
      title: `Vibyra ${version} is ready`,
      detail: "Restart to finish installing — open terminals will close.",
      action: "Restart now",
      busy: false,
    };
  }
  if (status === "installing") {
    return {
      title: `Preparing Vibyra ${version}`,
      detail: "Saving every open terminal before restart…",
      action: "Preparing…",
      busy: true,
    };
  }
  if (status === "downloading") {
    const size = progress.total > 0
      ? `${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
      : "Downloading…";
    return {
      title: `Downloading Vibyra ${version}`,
      detail: progress.total > 0 ? `${progress.percent}% — ${size}` : size,
      action: "Downloading…",
      busy: true,
    };
  }
  const note = notes.trim().split("\n")[0].trim();
  return {
    title: `Vibyra ${version} is available`,
    detail: note && note.length <= MAX_NOTE_LENGTH
      ? note
      : "Update now — it takes about a minute.",
    action: "Update now",
    busy: false,
  };
}
