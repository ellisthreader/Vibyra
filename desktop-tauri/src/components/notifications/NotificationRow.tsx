import type { NotificationItem } from "../../notificationTypes";
import { relativeTime } from "../../lib/relativeTime";
import { CloseIcon } from "../common/Icons";
import { categoryMark, markFor } from "./notificationMarks";

export interface NotificationRowProps {
  item: NotificationItem;
  onAction?: (item: NotificationItem) => void;
  /** Omitted renders a row with no dismiss control. */
  onDismiss?: (id: number) => void;
}

export function NotificationRow({ item, onAction, onDismiss }: NotificationRowProps) {
  const mark = markFor(item.severity);
  const category = categoryMark(item.category);

  return (
    <article className={`nrow${item.read ? "" : " nrow--unread"}`}>
      <span className={`${mark.className} nmark--sm nrow__mark`}>
        <mark.Icon size={12} />
      </span>

      <div className="nrow__text">
        <div className="nrow__head">
          <h4>{item.title}</h4>
          {item.count > 1 && <span className="nrow__count">×{item.count}</span>}
        </div>
        {item.body && <p className="nrow__body">{item.body}</p>}
        <div className="nrow__meta">
          <category.Icon size={11} />
          <span>{category.label}</span>
          <span className="nrow__sep" aria-hidden="true">
            ·
          </span>
          <time dateTime={new Date(item.at).toISOString()}>{relativeTime(item.at)}</time>
          {item.action && (
            <button type="button" className="nrow__action" onClick={() => onAction?.(item)}>
              {item.action.label}
            </button>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          className="icon-btn nrow__close"
          aria-label={`Dismiss: ${item.title}`}
          title="Dismiss"
          onClick={() => onDismiss(item.id)}
        >
          <CloseIcon size={12} />
        </button>
      )}
    </article>
  );
}
