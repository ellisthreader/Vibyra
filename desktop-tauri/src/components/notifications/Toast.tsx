import type { AnimationEvent, CSSProperties } from "react";

import type { NotificationItem } from "../../notificationTypes";
import { CloseIcon } from "../common/Icons";
import { isLoud, markFor } from "./notificationMarks";

export interface ToastProps {
  item: NotificationItem;
  /** Resolved lifetime in ms; 0 is sticky and draws no timer bar. */
  durationMs: number;
  /** True once the item has left the store — plays the exit animation. */
  leaving: boolean;
  onDismiss: (id: number) => void;
  onAction?: (item: NotificationItem) => void;
  /** Fired when the exit animation finishes; the stack drops the node then. */
  onExited: (id: number) => void;
}

export function Toast({ item, durationMs, leaving, onDismiss, onAction, onExited }: ToastProps) {
  const mark = markFor(item.severity);
  const loud = isLoud(item.severity);

  // The exit is a real animation, never `animation: none` — the node is
  // unmounted on `animationend`, so suppressing the animation would leak
  // every dismissed toast into the DOM forever. Under reduced motion the
  // global 0.01ms override makes it instant and still fires the event.
  const handleAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!leaving || event.target !== event.currentTarget) return;
    onExited(item.id);
  };

  return (
    <article
      className={`vtoast vtoast--${item.severity}${leaving ? " vtoast--leaving" : ""}`}
      style={{ "--vtoast-ms": `${durationMs}ms` } as CSSProperties}
      role={loud ? "alert" : "status"}
      aria-live={loud ? "assertive" : "polite"}
      aria-atomic="true"
      onAnimationEnd={handleAnimationEnd}
    >
      <span className={`${mark.className} nmark--sm vtoast__mark`}>
        <mark.Icon size={12} />
      </span>

      <div className="vtoast__text">
        <div className="vtoast__head">
          <h3>{item.title}</h3>
          {item.count > 1 && <span className="vtoast__count">×{item.count}</span>}
        </div>
        {item.body && <p className="vtoast__body">{item.body}</p>}
        {item.action && (
          <div className="vtoast__actions">
            <button type="button" className="chip vtoast__action" onClick={() => onAction?.(item)}>
              {item.action.label}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="icon-btn vtoast__close"
        aria-label={`Dismiss: ${item.title}`}
        title="Dismiss"
        onClick={() => onDismiss(item.id)}
      >
        <CloseIcon size={13} />
      </button>

      {durationMs > 0 && !leaving && <span className="vtoast__timer" aria-hidden="true" />}
    </article>
  );
}
