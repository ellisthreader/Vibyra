import { useCallback } from "react";

import { runNotificationAction } from "../../lib/notificationActions";
import { useNotificationStore } from "../../state/notificationStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { NotificationItem } from "../../notificationTypes";
import { Toast } from "./Toast";

/**
 * The banner slot above the workspace, as one notification rather than a
 * component of its own.
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
    <div className="vpinned">
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
