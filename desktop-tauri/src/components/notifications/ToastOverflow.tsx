import { MoreIcon } from "../common/Icons";

export interface ToastOverflowProps {
  count: number;
  onOpen: () => void;
}

/**
 * The notices the stack could not fit.
 *
 * Before rank ordering, an evicted toast simply vanished — which was worst for
 * exactly the notices that mattered, because a burst of finished agents could
 * push a blocked one off screen. Sticky tiers now hold their slot and the
 * transient remainder collapses to this one row, so nothing is silently lost.
 */
export function ToastOverflow({ count, onOpen }: ToastOverflowProps) {
  return (
    <button type="button" className="vtoast-more" onClick={onOpen}>
      <MoreIcon size={13} />
      <span>
        {count} more notification{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
