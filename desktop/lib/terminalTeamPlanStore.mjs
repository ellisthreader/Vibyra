const plans = new Map();

export function storeTerminalTeamPlan(plan) {
  if (!plan?.planId) throw new TypeError("A Team plan identifier is required.");
  const stored = immutableCopy(plan);
  const existing = plans.get(stored.planId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(stored)) {
    throw new Error("A different Team plan already uses this identifier.");
  }
  plans.set(stored.planId, stored);
  return immutableCopy(stored);
}

export function teamPlanById(planId) {
  const plan = plans.get(String(planId || "").trim());
  return plan ? immutableCopy(plan) : null;
}

export function clearTerminalTeamPlansForTests() {
  plans.clear();
}

function immutableCopy(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
