import { useCallback, useRef } from "react";

import { runNotificationAction } from "../../lib/notificationActions";
import { usePinnedNoticeBounds } from "../../lib/usePinnedNoticeBounds";
import { useNotificationStore } from "../../state/notificationStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { NotificationItem } from "../../notificationTypes";
import { Toast } from "./Toast";

/**
 * The corner perch, as one notification rather than a component of its own.
 *
 * Bottom-right at z 91, exactly where `UpdateBanner` used to sit — the belief
 * that there was a banner slot *above* the workspace is what once let this
 * render as a full-width bar across the bottom of the window. There is no such
 * slot: this component is the last flow child of `.app`, so its position comes
 * entirely from `notifications-pinned.css`.
 *
 * This is what replaced `UpdateBanner`. The card is the same `Toast` the corner
 * stack draws — same chip, same rail, same tier colours — only wider and
 * without a lifetime, because a standing offer that times out is not an offer.
 * Everything else it needs (history, preferences, sound, the desktop channel)
 * it gets by being in the store like everything else.
 */
export function PinnedNotice() {
  const item = useNotificationStore((state) => state.pinned);
  const dismiss = useNotificationStore((state) => state.dismiss);
  const ref = useRef<HTMLDivElement>(null);

  // Hooks run before the early return below, so the measurement is wired even
  // on the renders where there is nothing pinned.
  usePinnedNoticeBounds(ref, item !== null);

  const onAction = useCallback(
    (notice: NotificationItem) => {
      if (notice.action) runNotificationAction(notice.action);
      // Not dismissed on action: acting on an update moves it to its next
      // state, and that state wants this same slot.
    },
    [],
  );

  const onOpenSettings = useCallback(
    (notice: NotificationItem) => {
      dismiss(notice.id);
      useWorkspaceStore.getState().openSettingsSection("notifications");
    },
    [dismiss],
  );

  if (!item) return null;

  return (
    <div className="vpinned" ref={ref}>
      <Toast
        item={item}
        durationMs={0}
        leaving={false}
        onDismiss={dismiss}
        onAction={onAction}
        onOpenSettings={onOpenSettings}
        onExited={dismiss}
      />
    </div>
  );
}
