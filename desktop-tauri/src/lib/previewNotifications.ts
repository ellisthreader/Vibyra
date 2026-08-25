import type { PreviewPhase, PreviewStatus } from "../previewTypes";
import type { NotificationInput } from "../notificationTypes";

// Preview phases arrive by polling rather than as events, so the transition is
// derived from the previous status the hook already keeps. Pure, so the edge
// rules are testable without a dev server.

/** The last log line usually carries the reason a dev server gave up. */
function reason(status: PreviewStatus): string | undefined {
  return status.error ?? status.logs[status.logs.length - 1] ?? undefined;
}

const LIVE: PreviewPhase[] = ["starting", "running"];

/**
 * Builds the notification for a preview phase change, or null when the change
 * is not worth interrupting for.
 */
export function previewNotification(
  previous: PreviewStatus | undefined,
  next: PreviewStatus,
): NotificationInput | null {
  if (previous?.phase === next.phase) return null;

  if (next.phase === "running" && previous?.phase === "starting") {
    return {
      kind: "preview",
      tier: "done",
      title: "Preview is running",
      body: next.url ?? undefined,
      dedupeKey: `preview:${next.targetId}`,
      // You are looking at the preview pane when this happens.
      osEligible: false,
      action: { id: "openPreview", label: "Open preview" },
    };
  }

  if (next.phase === "failed" && previous && LIVE.includes(previous.phase)) {
    return {
      kind: "preview",
      tier: "fail",
      title: "Preview stopped unexpectedly",
      body: reason(next),
      dedupeKey: `preview:${next.targetId}`,
      action: { id: "openPreview", label: "Open preview" },
    };
  }

  return null;
}

/** Last phase seen per target. Held here rather than read out of React state so
 * the check runs outside the state updater — updaters must stay pure, and
 * StrictMode invokes them twice, which would double-fire every notification. */
const lastStatus = new Map<string, PreviewStatus>();

export function notePreviewTransition(next: PreviewStatus): NotificationInput | null {
  const notice = previewNotification(lastStatus.get(next.targetId), next);
  lastStatus.set(next.targetId, next);
  return notice;
}
