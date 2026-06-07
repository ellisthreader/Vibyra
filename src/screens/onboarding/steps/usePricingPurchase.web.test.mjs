import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboardingWeb = new URL("./usePricingPurchase.web.ts", import.meta.url);
const onboardingNative = new URL("./usePricingPurchase.ts", import.meta.url);
const profileWeb = new URL("../../workspace/inline/profile/useProfileBillingPurchase.web.ts", import.meta.url);

test("web purchase hooks do not load expo-iap while native purchase remains intact", async () => {
  const [onboardingWebSource, onboardingNativeSource, profileWebSource] = await Promise.all([
    readFile(onboardingWeb, "utf8"),
    readFile(onboardingNative, "utf8"),
    readFile(profileWeb, "utf8")
  ]);

  assert.doesNotMatch(onboardingWebSource, /from ["']expo-iap["']/);
  assert.doesNotMatch(profileWebSource, /from ["']expo-iap["']/);
  assert.match(onboardingWebSource, /startStripeCheckout/);
  assert.match(onboardingNativeSource, /from ["']expo-iap["']/);
});
