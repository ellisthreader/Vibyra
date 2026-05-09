import React from "react";
import { View } from "react-native";
import { BillingFeaturedPlan } from "./BillingFeaturedPlan";
import { BillingCycle, PLAN_TIERS, PlanKey } from "./types";

export function BillingPlanPager({ cycle, currentKey, recommendedKey, onSelect, busy }: {
  cycle: BillingCycle;
  currentKey: PlanKey;
  recommendedKey: PlanKey;
  onSelect: (key: PlanKey, cycle: BillingCycle) => void;
  busy?: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 10 }}>
      {PLAN_TIERS.map((tier) => (
        <BillingFeaturedPlan
          key={tier.key}
          tier={tier}
          cycle={cycle}
          onSelect={onSelect}
          busy={busy && tier.key === recommendedKey}
          isCurrent={tier.key === currentKey}
          isRecommended={tier.key === recommendedKey}
        />
      ))}
    </View>
  );
}
