import { BillingCycle, PLAN_TIERS, PlanKey, PlanTier } from "./types";

export function normalizePlanKey(plan: string): PlanKey {
  const key = plan.trim().toLowerCase();
  if (key === "starter" || key === "builder" || key === "pro") return key;
  return "free";
}

export function getPlanTier(key: PlanKey): PlanTier {
  return PLAN_TIERS.find((tier) => tier.key === key) ?? PLAN_TIERS[0];
}

export function getDisplayPrice(tier: PlanTier, cycle: BillingCycle) {
  const annual = cycle === "annual";
  return {
    cadence: (annual ? tier.annualCadence : tier.cadence).replace("per ", ""),
    note: annual && tier.key !== "free" ? tier.annualSubtext : undefined,
    price: annual ? tier.annualPrice : tier.price,
    tokens: annual && tier.annualTokens ? tier.annualTokens : tier.tokens
  };
}
