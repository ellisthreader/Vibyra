import { BellIcon } from "../common/StatusIcons";

/** Empty state for the notification centre, following the shape established
 * by the settings empty states: one mark, one line of reassurance, one of
 * guidance. */
export function NotificationEmpty() {
  return (
    <div className="ncenter__empty">
      <span className="nmark nmark--lg nmark--news">
        <BellIcon size={18} />
      </span>
      <h3>You’re all caught up</h3>
      <p>
        Finished runs, agents waiting on you, and anything that needs a decision will collect here
        while you work elsewhere.
      </p>
    </div>
  );
}
