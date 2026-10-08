import { useCallback } from "react";

import { runNotificationAction } from "../../lib/notificationActions";
import { timeoutFor } from "../../state/notificationQueue";
import { setTimersPaused, useNotificationStore } from "../../state/notificationStore";
import type { NotificationItem } from "../../notificationTypes";
import { ToastStack } from "./ToastStack";

/** Connects the presentational stack to the store. The stack itself stays
 * prop-driven so it can be rendered from a fixture. */
export function Toasts() {
  const items = useNotificationStore((state) => state.visible);
  const dismiss = useNotificationStore((state) => state.dismiss);

  const onAction = useCallback((item: NotificationItem) => {
    if (item.action) runNotificationAction(item.action);
    dismiss(item.id);
  }, [dismiss]);

  const lifetime = useCallback(
    (item: NotificationItem) => item.timeoutMs ?? timeoutFor(item.severity),
    [],
  );

  if (items.length === 0) return null;

  return (
    <ToastStack
      items={items}
      onDismiss={dismiss}
      onAction={onAction}
      onHoverChange={setTimersPaused}
      timeoutFor={lifetime}
    />
  );
}
