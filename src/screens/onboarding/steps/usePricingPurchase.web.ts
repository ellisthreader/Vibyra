import { useState } from "react";
import { Linking } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { startStripeCheckout } from "../../../utils/billingApi";
import { membershipProductIds, planKeyMap } from "../data/plans";
import { BillingPeriod, Plan } from "../types";

export function usePricingPurchase(selectedPlan: Plan, billingPeriod: BillingPeriod, onClose: () => void) {
  const app = useAppContext();
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const selectedProductId = membershipProductIds[selectedPlan][billingPeriod];

  async function buyMembership() {
    setPurchaseError("");
    setPurchaseMessage("");

    if (!app.authToken) {
      setPurchaseError("Log in again to upgrade your plan.");
      return;
    }

    try {
      setIsPurchasing(true);
      const result = await startStripeCheckout(app.authToken, {
        kind: "subscription",
        plan: planKeyMap[selectedPlan],
        cycle: billingPeriod
      });
      setPurchaseMessage("Opening secure checkout...");
      await Linking.openURL(result.url);
      onClose();
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Could not start checkout. Try again in a moment.");
    } finally {
      setIsPurchasing(false);
    }
  }

  return {
    buyMembership,
    isPurchasing,
    purchaseError,
    purchaseMessage,
    selectedProductId,
    selectedStoreProduct: undefined
  };
}
