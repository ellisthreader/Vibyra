import type { ActivityCounts, ProjectActivity } from "../ipc/projectActivity";

export interface ActivityViewDay extends ActivityCounts {
  date: string;
  label: string;
  shortDate: string;
  includesWorkingTree: boolean;
}

const EMPTY: ActivityCounts = {
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  commits: 0,
  binaryFiles: 0,
};

function localKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function merge(left: ActivityCounts, right: ActivityCounts): ActivityCounts {
  return {
    additions: left.additions + right.additions,
    deletions: left.deletions + right.deletions,
    changedFiles: left.changedFiles + right.changedFiles,
    commits: left.commits + right.commits,
    binaryFiles: left.binaryFiles + right.binaryFiles,
  };
}

function hasChanges(counts: ActivityCounts): boolean {
  return counts.additions + counts.deletions + counts.changedFiles + counts.binaryFiles > 0;
}

export function activityDays(activity: ProjectActivity, now = new Date()): ActivityViewDay[] {
  const committed = new Map(activity.days.map((day) => [day.date, day]));
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - index);
    const key = localKey(date);
    const base = committed.get(key) ?? EMPTY;
    const includesWorkingTree = index === 0 && hasChanges(activity.workingTree);
    const counts = includesWorkingTree ? merge(base, activity.workingTree) : base;
    return {
      ...counts,
      date: key,
      label: index === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" }),
      shortDate: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      includesWorkingTree,
    };
  });
}

export function activitySummary(days: ActivityViewDay[]): ActivityCounts {
  return days.reduce<ActivityCounts>((total, day) => merge(total, day), { ...EMPTY });
}

export function activityBarWidth(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "0%";
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

export function compactCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 1_000 ? "compact" : "standard" })
    .format(value);
}
