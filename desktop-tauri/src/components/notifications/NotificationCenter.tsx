import { useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { useAnchoredPanel } from "../../lib/useAnchoredPanel";
import type { NotificationItem } from "../../notificationTypes";
import { GearIcon } from "../common/Icons";
import { NotificationEmpty } from "./NotificationEmpty";
import { filterItems, NotificationFilters } from "./NotificationFilters";
import { NotificationRow } from "./NotificationRow";
import { groupNotifications } from "./notificationGroups";

export interface NotificationCenterProps {
  items: readonly NotificationItem[];
  /** Wrapper holding both bell and panel; bounds the outside-click test. */
  rootRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onAction?: (item: NotificationItem) => void;
  onDismiss?: (id: number) => void;
}

export function NotificationCenter(props: NotificationCenterProps) {
  const { items, rootRef, triggerRef, onClose, onAction, onDismiss } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  useAnchoredPanel({ open: true, onClose, rootRef, panelRef, triggerRef });

  const [filter, setFilter] = useState("all");

  // `items` is a stored array, so this recomputes only when history or the
  // chosen filter changes.
  const groups = useMemo(
    () => groupNotifications(filterItems(items, filter), Date.now()),
    [items, filter],
  );
  const hasUnread = items.some((item) => !item.read);

  return (
    <div className="ncenter" role="dialog" aria-label="Notifications" ref={panelRef}>
      <header className="ncenter__head">
        <h2>Notifications</h2>
        <div className="ncenter__head-actions">
          <button
            type="button"
            className="ncenter__link"
            disabled={!hasUnread}
            onClick={props.onMarkAllRead}
          >
            Mark all read
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Notification settings"
            title="Notification settings"
            onClick={props.onOpenSettings}
          >
            <GearIcon size={14} />
          </button>
        </div>
      </header>

      <NotificationFilters items={items} active={filter} onChange={setFilter} />

      {groups.length === 0 ? (
        <NotificationEmpty />
      ) : (
        <div className="ncenter__list">
          {groups.map((group, index) => (
            <section className="ncenter__group" key={`${group.id}-${index}`}>
              <h3 className="section-label ncenter__group-label">{group.label}</h3>
              {group.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onAction={onAction}
                  onDismiss={onDismiss}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <footer className="ncenter__foot">
          <button type="button" className="ncenter__link" onClick={props.onClearAll}>
            Clear all
          </button>
        </footer>
      )}
    </div>
  );
}
