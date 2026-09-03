import type { ReactNode } from "react";

/**
 * The empty state every panel shares: one glyph, one line, one thing to do.
 *
 * A panel with nothing in it used to be a sentence in dim text at the top of
 * an otherwise blank page, which reads as a page that failed to load. The
 * card gives the emptiness a shape and puts the next action inside it.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "empty--compact" : ""}`}>
      <span className="empty__glyph" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
