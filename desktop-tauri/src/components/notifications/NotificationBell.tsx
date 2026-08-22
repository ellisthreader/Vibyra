import { useCallback, useRef } from "react";

import type { NotificationItem } from "../../notificationTypes";
import { BellIcon } from "../common/StatusIcons";
import { NotificationCenter } from "./NotificationCenter";

export interface NotificationBellProps {
  /** Full history, newest-first ordering is applied by the centre. */
  items: readonly NotificationItem[];
  unread: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onAction?: (item: NotificationItem) => void;
  onDismiss?: (id: number) => void;
}

export function NotificationBell(props: NotificationBellProps) {
  const { items, unread, open, onOpenChange } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="nbell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`chip nbell__btn${unread > 0 ? " nbell__btn--unread" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => onOpenChange(!open)}
      >
        <BellIcon size={14} />
        {unread > 0 && <span className="nbell__badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {/* Politeness lives here rather than on the badge so a screen reader
          hears the count once, not once per re-render of the title bar. */}
      <span className="sr-only" role="status" aria-live="polite">
        {unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : ""}
      </span>

      {open && (
        <NotificationCenter
          items={items}
          rootRef={rootRef}
          triggerRef={buttonRef}
          onClose={close}
          onMarkAllRead={props.onMarkAllRead}
          onClearAll={props.onClearAll}
          onOpenSettings={props.onOpenSettings}
          onAction={props.onAction}
          onDismiss={props.onDismiss}
        />
      )}
    </div>
  );
}
