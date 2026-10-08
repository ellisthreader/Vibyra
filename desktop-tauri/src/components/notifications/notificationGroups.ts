// Bucketing for the notification centre. Pure and `now`-injected so it is
// unit-testable; per-row wording stays with the house `relativeTime()` helper
// rather than growing a second relative-time implementation here.
import type { NotificationItem } from "../../notificationTypes";

export type NotificationGroupId = "now" | "today" | "yesterday" | "earlier";

export interface NotificationGroup {
  id: NotificationGroupId;
  label: string;
  items: NotificationItem[];
}

const JUST_NOW_MS = 60_000;

const LABELS: Record<NotificationGroupId, string> = {
  now: "Just now",
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function groupIdFor(at: number, now: number): NotificationGroupId {
  if (now - at < JUST_NOW_MS) return "now";
  const today = startOfDay(now);
  if (at >= today) return "today";
  // Subtracting one millisecond lands inside yesterday whatever the DST shift.
  if (at >= startOfDay(today - 1)) return "yesterday";
  return "earlier";
}

/** Newest first, adjacent items of the same bucket merged into one section. */
export function groupNotifications(
  items: readonly NotificationItem[],
  now: number,
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const item of [...items].sort((left, right) => right.at - left.at)) {
    const id = groupIdFor(item.at, now);
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.items.push(item);
    else groups.push({ id, label: LABELS[id], items: [item] });
  }
  return groups;
}
