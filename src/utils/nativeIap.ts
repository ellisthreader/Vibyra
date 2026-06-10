import { getAvailablePurchases, Purchase } from "expo-iap";
import { Platform } from "react-native";
import { IapReceiptResponse } from "./appApi";
import { reportIapReceipt } from "./billingApi";

type FinishTransaction = (input: { purchase: Purchase; isConsumable: boolean }) => Promise<void>;
type RemoteIapUser = NonNullable<IapReceiptResponse["user"]>;

export async function reportNativeIapPurchase(authToken: string | null, purchase: Purchase) {
  if (!authToken) throw new Error("Log in again to sync purchases.");

  const platform = Platform.OS === "ios" ? "apple" : Platform.OS === "android" ? "google" : null;
  const receipt = purchase.purchaseToken
    ?? (purchase as Purchase & { transactionReceipt?: string }).transactionReceipt
    ?? "";
  const transactionId = purchase.transactionId ?? purchase.id ?? receipt;

  if (!platform || !receipt || !transactionId) {
    throw new Error("The store purchase did not include a receipt Vibyra can verify.");
  }

  return reportIapReceipt(authToken, {
    platform,
    productId: purchase.productId,
    receipt,
    transactionId
  });
}

export async function restoreNativeIapPurchases(options: {
  authToken: string | null;
  finishTransaction: FinishTransaction;
  applyRemoteUser: (user: RemoteIapUser) => void;
}) {
  const purchases = await getAvailablePurchases({
    includeSuspendedAndroid: false,
    onlyIncludeActiveItemsIOS: true
  });
  let restored = 0;
  let failed = 0;
  let firstError: unknown;

  for (const purchase of purchases) {
    try {
      const result = await reportNativeIapPurchase(options.authToken, purchase);
      if (result.user) options.applyRemoteUser(result.user);
      restored += 1;
      try {
        await options.finishTransaction({
          purchase,
          isConsumable: purchase.productId.includes(".topup.")
        });
      } catch (error) {
        failed += 1;
        firstError ??= error;
      }
    } catch (error) {
      failed += 1;
      firstError ??= error;
    }
  }

  if (restored === 0 && firstError) throw firstError;
  return { failed, restored };
}
