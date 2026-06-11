export const LOCAL_MEMBERSHIP_LIMIT_CAP = 12;

const PLAN_LIMITS = {
  free: { maxConcurrentAgents: 0, maxActiveProjects: 1 },
  starter: { maxConcurrentAgents: 1, maxActiveProjects: 1 },
  builder: { maxConcurrentAgents: 2, maxActiveProjects: 3 },
  pro: { maxConcurrentAgents: 4, maxActiveProjects: 10 }
};

export function maxConcurrentAgents(account) {
  return accountLimit(account, "maxConcurrentAgents", "max_concurrent_agents");
}

export function maxConcurrentTerminalAgents(account) {
  return Math.max(1, maxConcurrentAgents(account));
}

export function maxActiveProjects(account) {
  return accountLimit(account, "maxActiveProjects", "max_active_projects");
}

function accountLimit(account, camelKey, snakeKey) {
  if (!account) return LOCAL_MEMBERSHIP_LIMIT_CAP;
  const explicit = account?.[camelKey] ?? account?.[snakeKey];
  const fallback = PLAN_LIMITS[normalizedPlan(account?.plan)]?.[camelKey];
  const value = explicit === undefined || explicit === null || explicit === ""
    ? fallback
    : explicit;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(LOCAL_MEMBERSHIP_LIMIT_CAP, Math.max(0, Math.floor(parsed)));
}

function normalizedPlan(value) {
  const plan = String(value || "free").trim().toLowerCase();
  return Object.hasOwn(PLAN_LIMITS, plan) ? plan : "free";
}
