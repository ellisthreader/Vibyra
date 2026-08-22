import { useCallback } from "react";

import { runNotificationAction } from "../../lib/notificationActions";
import { useNotificationStore } from "../../state/notificationStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { NotificationItem } from "../../notificationTypes";
import { NotificationBell } from "./NotificationBell";

/** Connects the bell and its panel to the store, so `TitleBar` stays a layout
 * file and `NotificationBell` stays renderable from a fixture. */
export function NotificationBellHost() {
  const items = useNotificationStore((state) => state.history);
  const unread = useNotificationStore((state) => state.unread);
  const open = useNotificationStore((state) => state.centreOpen);
  const setOpen = useNotificationStore((state) => state.setCentreOpen);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const clearHistory = useNotificationStore((state) => state.clearHistory);

  const onAction = useCallback((item: NotificationItem) => {
    if (item.action) runNotificationAction(item.action);
    useNotificationStore.getState().setCentreOpen(false);
  }, []);

  const onOpenSettings = useCallback(() => {
    useNotificationStore.getState().setCentreOpen(false);
    useWorkspaceStore.getState().openSettingsSection("notifications");
  }, []);

  return (
    <NotificationBell
      items={items}
      unread={unread}
      open={open}
      onOpenChange={setOpen}
      onMarkAllRead={markAllRead}
      onClearAll={clearHistory}
      onOpenSettings={onOpenSettings}
      onAction={onAction}
    />
  );
}
