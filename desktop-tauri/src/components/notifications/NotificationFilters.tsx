import { TIER_FILTERS } from "../../lib/notificationTiers.ts";
import type { NotificationItem } from "../../notificationTypes";

export interface NotificationFiltersProps {
  items: readonly NotificationItem[];
  active: string;
  onChange: (id: string) => void;
}

/** The items a filter id admits. Exported so the centre and the row of chips
 * can never disagree about what "Problems" means. */
export function filterItems(
  items: readonly NotificationItem[],
  id: string,
): readonly NotificationItem[] {
  const tiers = TIER_FILTERS.find((filter) => filter.id === id)?.tiers;
  if (!tiers) return items;
  return items.filter((item) => tiers.includes(item.tier));
}

/**
 * Four questions people actually ask a notification history, built from tiers
 * rather than from kinds: "what is blocking me" is a tier question, and it is
 * the only one anyone asks in a hurry.
 *
 * A filter with nothing behind it is hidden rather than disabled — an empty
 * "Problems" is good news, and a greyed-out chip makes it look like a fault.
 */
export function NotificationFilters({ items, active, onChange }: NotificationFiltersProps) {
  const counts = TIER_FILTERS.map((filter) => ({
    ...filter,
    count: filterItems(items, filter.id).length,
  })).filter((filter) => filter.tiers === null || filter.count > 0);

  if (counts.length <= 1) return null;

  return (
    <div className="ncenter__filters" role="group" aria-label="Filter notifications">
      {counts.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="ncenter__filter"
          aria-pressed={filter.id === active}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
          <span className="ncenter__filter-count">{filter.count}</span>
        </button>
      ))}
    </div>
  );
}
