import { BillingCycle, PlanKey } from "./types";

export function useProfileBillingPurchase(_selectedKey: PlanKey, _cycle: BillingCycle) {
  return {
    buyMembership: async () => {},
    isRestoring: false,
    isPurchasing: false,
    purchaseError: "",
    purchaseMessage: "",
    restorePurchases: async () => {}
  };
}
