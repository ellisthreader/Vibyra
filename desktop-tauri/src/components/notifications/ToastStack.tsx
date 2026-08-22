import { useCallback, useEffect, useState } from "react";

import type { NotificationItem } from "../../notificationTypes";
import { Toast } from "./Toast";

export interface ToastStackProps {
  /** The store's visible toasts, oldest first. */
  items: readonly NotificationItem[];
  onDismiss: (id: number) => void;
  onAction?: (item: NotificationItem) => void;
  /** Hovering the stack pauses the CSS timer bars; wire this to pause the
   * store's dismissal timers so the two stay in step. */
  onHoverChange?: (hovering: boolean) => void;
  /** Resolves an item's lifetime. Defaults to the item's own `timeoutMs`. */
  timeoutFor?: (item: NotificationItem) => number;
}

function defaultTimeout(item: NotificationItem): number {
  return item.timeoutMs ?? 0;
}

export function ToastStack(props: ToastStackProps) {
  const { items, onDismiss, onAction, onHoverChange, timeoutFor = defaultTimeout } = props;
  // Nodes outlive the store entry by one animation so the exit can play. An
  // item still rendered but absent from `items` is the leaving set — derived,
  // never a second piece of state to fall out of sync.
  const [rendered, setRendered] = useState<NotificationItem[]>(() => [...items]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setRendered((previous) => {
      const live = new Map(items.map((item) => [item.id, item]));
      const next = previous.map((item) => live.get(item.id) ?? item);
      const known = new Set(previous.map((item) => item.id));
      for (const item of items) if (!known.has(item.id)) next.push(item);
      return next;
    });
  }, [items]);

  const drop = useCallback((id: number) => {
    setRendered((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const setHover = useCallback(
    (hovering: boolean) => {
      setPaused(hovering);
      onHoverChange?.(hovering);
    },
    [onHoverChange],
  );

  if (rendered.length === 0) return null;

  const live = new Set(items.map((item) => item.id));

  return (
    <div
      className={`vtoast-stack${paused ? " vtoast-stack--paused" : ""}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {rendered.map((item) => (
        <Toast
          key={item.id}
          item={item}
          durationMs={timeoutFor(item)}
          leaving={!live.has(item.id)}
          onDismiss={onDismiss}
          onAction={onAction}
          onExited={drop}
        />
      ))}
    </div>
  );
}
