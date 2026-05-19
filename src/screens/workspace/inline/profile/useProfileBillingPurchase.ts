import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Purchase, useIAP } from "expo-iap";
import { useAppContext } from "../../../../context/AppContext";
import { membershipProductIds, membershipSkus } from "../../../onboarding/data/plans";
import { Plan } from "../../../onboarding/types";
import { reportIapReceipt } from "../../../../utils/billingApi";
import { BillingCycle, PlanKey } from "./types";

const PROFILE_PLAN_TO_STORE_PLAN: Partial<Record<PlanKey, Plan>> = {
  starter: "Starter",
  builder: "Builder",
  pro: "Pro"
};

export function useProfileBillingPurchase(selectedKey: PlanKey, cycle: BillingCycle) {
  const app = useAppContext();
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const selectedStorePlan = PROFILE_PLAN_TO_STORE_PLAN[selectedKey];
  const selectedProductId = selectedStorePlan ? membershipProductIds[selectedStorePlan][cycle] : null;

  const { connected: storeConnected, subscriptions, fetchProducts, finishTransaction, requestPurchase } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      try {
        const platform: "apple" | "google" = Platform.OS === "ios" ? "apple" : "google";
        const receipt = purchase.purchaseToken
          ?? (purchase as { transactionReceipt?: string }).transactionReceipt
          ?? "";
        const transactionId = (purchase as { transactionId?: string }).transactionId
          ?? (purchase as { purchaseToken?: string }).purchaseToken
          ?? "";

        if (receipt && transactionId && app.authToken) {
          const result = await reportIapReceipt(app.authToken, {
            platform,
            productId: purchase.productId,
            receipt,
            transactionId
          });
          if (result.user) app.applyRemoteUserFromIap(result.user);
        }

        await finishTransaction({ purchase, isConsumable: false });
        setPurchaseError("");
        setPurchaseMessage("Membership active. Your account has been updated.");
      } catch (error) {
        setPurchaseError(error instanceof Error ? error.message : "Payment completed, but Vibyra could not update your account.");
      } finally {
        setPurchasingProductId(null);
      }
    },
    onPurchaseError: (error) => {
      setPurchasingProductId(null);
      setPurchaseMessage("");
      setPurchaseError(error.message || "Purchase could not be completed.");
    },
    onError: (error) => {
      setPurchaseError(error.message || "The store is not available right now.");
    }
  });

  useEffect(() => {
    if (!storeConnected) return;
    fetchProducts({ skus: membershipSkus, type: "subs" }).catch(() => {
      setPurchaseError("Memberships are not available yet. Try a development build with store products configured.");
    });
  }, [fetchProducts, storeConnected]);

  async function buyMembership() {
    setPurchaseError("");
    setPurchaseMessage("");
    if (!selectedProductId) {
      setPurchaseError("Choose a paid plan to upgrade.");
      return;
    }
    if (!storeConnected) {
      setPurchaseError("In-app purchases need a development or store build. They will not open inside Expo Go.");
      return;
    }

    try {
      setPurchasingProductId(selectedProductId);
      const selectedStoreProduct = subscriptions.find((subscription) => subscription.id === selectedProductId);
      const androidOfferToken = Platform.OS === "android"
        ? selectedStoreProduct?.subscriptionOffers?.[0]?.offerTokenAndroid
        : undefined;

      await requestPurchase({
        type: "subs",
        request: {
          apple: { sku: selectedProductId },
          google: {
            skus: [selectedProductId],
            subscriptionOffers: androidOfferToken ? [{ sku: selectedProductId, offerToken: androidOfferToken }] : undefined
          }
        }
      });
    } catch (error) {
      setPurchasingProductId(null);
      setPurchaseError(error instanceof Error ? error.message : "Purchase could not be started.");
    }
  }

  return {
    buyMembership,
    isPurchasing: selectedProductId ? purchasingProductId === selectedProductId : false,
    purchaseError,
    purchaseMessage
  };
}
