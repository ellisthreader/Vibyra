import type { AccountProfile, PlanLimits } from "../accountTypes";

/** The Pro features a plan can hold back, as upgrade prompts name them. */
export type PlanFeature = "terminals" | "projects" | "worktrees" | "preview" | "review" | "agents" | "cloud";

export interface PlanLimitNotice {
  feature: PlanFeature;
  message: string;
}

/** What an older account service, which sends no limits, is treated as. */
export const OPEN_LIMITS: PlanLimits = {
  enforced: false,
  plan: "free",
  trial: false,
  paidUntil: null,
  maxTerminals: null,
  maxProjects: null,
  safeWorktrees: true,
  preview: true,
  review: true,
  agents: true,
  remoteAccess: true,
};

/** Same Free floor as the backend's version-one workspace contract. */
export const FREE_LIMITS: PlanLimits = {
  ...OPEN_LIMITS, enforced: true, maxTerminals: 2, maxProjects: 1,
  safeWorktrees: false, preview: false, review: false, agents: false, remoteAccess: false,
};

export function limitsOf(profile: AccountProfile | null | undefined, now = Date.now()): PlanLimits {
  const limits = profile?.planLimits ?? OPEN_LIMITS;
  if (limits.enforced && limits.paidUntil !== null) {
    const until = Date.parse(limits.paidUntil);
    if (!Number.isFinite(until) || until <= now) return FREE_LIMITS;
  }
  return limits;
}

/** Whether this plan includes a feature. Open until the server enforces limits. */
export function allows(
  profile: AccountProfile | null | undefined,
  feature: "safeWorktrees" | "preview" | "review" | "agents" | "remoteAccess",
): boolean {
  const limits = limitsOf(profile);
  return !limits.enforced || limits[feature];
}

/** Whole days left on the free Pro trial, or null when not on one. */
export function trialDaysLeft(profile: AccountProfile | null | undefined, now = Date.now()): number | null {
  const limits = profile?.planLimits ?? OPEN_LIMITS;
  const ends = limits.trial && limits.paidUntil ? Date.parse(limits.paidUntil) : NaN;
  if (Number.isNaN(ends)) return null;
  return Math.max(0, Math.ceil((ends - now) / 86_400_000));
}

// Native commands mark a limit as `plan-limit:<feature>: <message>` so it
// becomes an upgrade prompt, wherever in an error string it ends up.
const MARKER = /plan-limit:(terminals|projects|worktrees|preview|review|agents|cloud): ([^\n]+?)(?:\)|$)/;

/** Whether the project at `position` (oldest first) is past the plan's limit. */
export function projectLocked(profile: AccountProfile | null | undefined, position: number): boolean {
  const limits = limitsOf(profile);
  return limits.enforced && limits.maxProjects !== null && position >= limits.maxProjects;
}

/** Whether one more project can be added to `saved`. */
export function canAddProject(profile: AccountProfile | null | undefined, saved: number): boolean {
  return !projectLocked(profile, saved);
}

export function planLimitFrom(error: unknown): PlanLimitNotice | null {
  const match = MARKER.exec(String(error ?? ""));
  return match ? { feature: match[1] as PlanFeature, message: match[2].trim() } : null;
}
