import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useIAP, Purchase } from "expo-iap";
import { useAppContext } from "../../../context/AppContext";
import { membershipProductIds, membershipSkus } from "../data/plans";
import { BillingPeriod, Plan } from "../types";

export function usePricingPurchase(selectedPlan: Plan, billingPeriod: BillingPeriod, onClose: () => void) {
  const app = useAppContext();
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);

  const selectedProductId = membershipProductIds[selectedPlan][billingPeriod];

  const { connected: storeConnected, subscriptions, fetchProducts, finishTransaction, requestPurchase } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      try {
        await finishTransaction({ purchase, isConsumable: false });
        setPurchaseError("");
        setPurchaseMessage("Membership active. Taking you to connect your PC...");
        app.completeOnboarding();
        setTimeout(onClose, 650);
      } catch {
        setPurchaseError("Payment completed, but we could not finish the store transaction. Please restore purchases or contact support.");
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

  const selectedStoreProduct = subscriptions.find((subscription) => subscription.id === selectedProductId);
  const isPurchasing = purchasingProductId === selectedProductId;

  async function buyMembership() {
    setPurchaseError("");
    setPurchaseMessage("");

    if (!storeConnected) {
      setPurchaseError("In-app purchases need a development or store build. They will not open inside Expo Go.");
      return;
    }

    try {
      setPurchasingProductId(selectedProductId);
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
    isPurchasing,
    purchaseError,
    purchaseMessage,
    selectedProductId,
    selectedStoreProduct
  };
}
