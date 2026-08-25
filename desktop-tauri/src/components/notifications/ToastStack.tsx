import { useCallback, useEffect, useState } from "react";

import type { AgentPromptOption, NotificationItem } from "../../notificationTypes";
import { Toast } from "./Toast";
import { ToastOverflow } from "./ToastOverflow";

export interface ToastStackProps {
  /** The store's visible toasts, already ordered by tier rank then recency. */
  items: readonly NotificationItem[];
  /** Notices the stack could not fit; 0 draws no overflow row. */
  overflow?: number;
  onDismiss: (id: number) => void;
  onAction?: (item: NotificationItem) => void;
  onAnswer?: (item: NotificationItem, option: AgentPromptOption) => void;
  onOpenSettings?: (item: NotificationItem) => void;
  /** Opens the bell, where the overflowed notices went. */
  onOpenOverflow?: () => void;
  /** Hovering the stack pauses the CSS timer bars; wire this to pause the
   * store's dismissal timers so the two stay in step. */
  onHoverChange?: (hovering: boolean) => void;
  /** Resolves an item's lifetime. Defaults to the item's own `timeoutMs`. */
  timeoutFor?: (item: NotificationItem) => number;
}

function defaultTimeout(item: NotificationItem): number {
  return item.timeoutMs ?? 0;
}

/**
 * Reconciles the rendered list against the store.
 *
 * Live items take the store's order, which is what makes tier rank visible:
 * the stack is `column-reverse`, so index 0 sits nearest the corner and an
 * unanswered `ask` is always the card closest to the cursor. Items the store
 * has dropped stay mounted for one exit animation, held at the index they
 * already occupied — moving a card while it fades reads as a glitch.
 */
function reconcile(
  previous: NotificationItem[],
  items: readonly NotificationItem[],
): NotificationItem[] {
  const live = new Set(items.map((item) => item.id));
  const next = [...items];
  previous.forEach((item, index) => {
    if (live.has(item.id)) return;
    next.splice(Math.min(index, next.length), 0, item);
  });
  return next;
}

export function ToastStack(props: ToastStackProps) {
  const {
    items,
    overflow = 0,
    onDismiss,
    onAction,
    onAnswer,
    onOpenSettings,
    onOpenOverflow,
    onHoverChange,
    timeoutFor = defaultTimeout,
  } = props;
  // Nodes outlive the store entry by one animation so the exit can play. An
  // item still rendered but absent from `items` is the leaving set — derived,
  // never a second piece of state to fall out of sync.
  const [rendered, setRendered] = useState<NotificationItem[]>(() => [...items]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setRendered((previous) => reconcile(previous, items));
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
          onAnswer={onAnswer}
          onOpenSettings={onOpenSettings}
          onExited={drop}
        />
      ))}
      {/* Last in the DOM, so `column-reverse` puts it at the top of the pile —
          furthest from the corner, like the notices it stands for. */}
      {overflow > 0 && onOpenOverflow && (
        <ToastOverflow count={overflow} onOpen={onOpenOverflow} />
      )}
    </div>
  );
}
