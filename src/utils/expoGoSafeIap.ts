import type { UseIAPOptions } from "expo-iap";
import { isExpoGo } from "./expoRuntime";

type UseIapResult = ReturnType<typeof import("expo-iap")["useIAP"]>;

const EXPO_GO_IAP = {
  activeSubscriptions: [],
  availablePurchases: [],
  checkAlternativeBillingAvailabilityAndroid: async () => false,
  connected: false,
  createAlternativeBillingTokenAndroid: async () => null,
  fetchProducts: async () => {},
  finishTransaction: async () => {},
  getActiveSubscriptions: async () => {},
  getAvailablePurchases: async () => {},
  getPromotedProductIOS: async () => null,
  hasActiveSubscriptions: async () => false,
  products: [],
  promotedProductIOS: undefined,
  reconnect: async () => false,
  requestPurchase: async () => undefined,
  requestPurchaseOnPromotedProductIOS: async () => false,
  restorePurchases: async () => {},
  showAlternativeBillingDialogAndroid: async () => false,
  subscriptions: [],
  validateReceipt: async () => { throw new Error("Purchases are unavailable in Expo Go."); },
  verifyPurchase: async () => { throw new Error("Purchases are unavailable in Expo Go."); },
  verifyPurchaseWithProvider: async () => { throw new Error("Purchases are unavailable in Expo Go."); }
} as unknown as UseIapResult;

export function useExpoGoSafeIap(options?: UseIAPOptions): UseIapResult {
  if (isExpoGo) return EXPO_GO_IAP;
  const { useIAP } = require("expo-iap") as typeof import("expo-iap");
  return useIAP(options);
}
