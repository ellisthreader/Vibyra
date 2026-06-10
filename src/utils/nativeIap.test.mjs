import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  helper: new URL("./nativeIap.ts", import.meta.url),
  onboarding: new URL("../screens/onboarding/steps/usePricingPurchase.ts", import.meta.url),
  onboardingScreen: new URL("../screens/onboarding/steps/PricingScreen.tsx", import.meta.url),
  profile: new URL("../screens/workspace/inline/profile/useProfileBillingPurchase.ts", import.meta.url),
  profileScreen: new URL("../screens/workspace/inline/profile/BillingSheet.tsx", import.meta.url)
};

test("native billing surfaces share receipt reporting and expose restore purchases", async () => {
  const sources = Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([key, url]) => [key, await readFile(url, "utf8")])
  ));

  assert.match(sources.helper, /getAvailablePurchases/);
  assert.match(sources.helper, /reportIapReceipt/);
  assert.match(sources.helper, /finishTransaction/);
  assert.match(sources.onboarding, /restoreNativeIapPurchases/);
  assert.match(sources.profile, /restoreNativeIapPurchases/);
  assert.match(sources.onboardingScreen, /Restore Purchases/);
  assert.match(sources.profileScreen, /Restore Purchases/);
});
