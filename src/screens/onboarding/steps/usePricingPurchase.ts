import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useIAP, Purchase } from "expo-iap";
import { useAppContext } from "../../../context/AppContext";
import { membershipProductIds, membershipSkus } from "../data/plans";
import { BillingPeriod, Plan } from "../types";
import { reportNativeIapPurchase, restoreNativeIapPurchases } from "../../../utils/nativeIap";

export function usePricingPurchase(selectedPlan: Plan, billingPeriod: BillingPeriod, onClose: () => void) {
  const app = useAppContext();
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const selectedProductId = membershipProductIds[selectedPlan][billingPeriod];

  const { connected: storeConnected, subscriptions, fetchProducts, finishTransaction, requestPurchase } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      try {
        const result = await reportNativeIapPurchase(app.authToken, purchase);
        if (result.user) app.applyRemoteUserFromIap(result.user);

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

  async function restorePurchases() {
    setPurchaseError("");
    setPurchaseMessage("");
    if (!storeConnected) {
      setPurchaseError("Restore Purchases needs a development or store build.");
      return;
    }

    try {
      setIsRestoring(true);
      const result = await restoreNativeIapPurchases({
        authToken: app.authToken,
        finishTransaction,
        applyRemoteUser: app.applyRemoteUserFromIap
      });
      if (result.restored === 0) {
        setPurchaseMessage("No active purchases were found for this store account.");
        return;
      }
      const partial = result.failed > 0 ? ` ${result.failed} store transaction${result.failed === 1 ? "" : "s"} still need retrying.` : "";
      setPurchaseMessage(`Restored ${result.restored} purchase${result.restored === 1 ? "" : "s"}.${partial}`);
      app.completeOnboarding();
      setTimeout(onClose, 650);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Purchases could not be restored.");
    } finally {
      setIsRestoring(false);
    }
  }

  return {
    buyMembership,
    isRestoring,
    isPurchasing,
    purchaseError,
    purchaseMessage,
    restorePurchases,
    selectedProductId,
    selectedStoreProduct
  };
}
