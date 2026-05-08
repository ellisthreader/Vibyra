import { appApiRequest, BillingPlansResponse, CheckoutResponse, IapReceiptResponse } from "./appApi";

export function fetchBillingPlans() {
  return appApiRequest<BillingPlansResponse>("/api/billing/plans", undefined, undefined, { background: true });
}

export function startStripeCheckout(
  authToken: string,
  body:
    | { kind: "subscription"; plan: "starter" | "builder" | "pro"; cycle: "monthly" | "annual" }
    | { kind: "topup"; topup: string }
) {
  return appApiRequest<CheckoutResponse>(
    "/api/billing/checkout",
    { method: "POST", body: JSON.stringify(body) },
    authToken
  );
}

export function openBillingPortal(authToken: string) {
  return appApiRequest<CheckoutResponse>(
    "/api/billing/portal",
    { method: "POST", body: JSON.stringify({}) },
    authToken
  );
}

export function reportIapReceipt(
  authToken: string,
  body: { platform: "apple" | "google"; productId: string; transactionId: string; receipt: string }
) {
  return appApiRequest<IapReceiptResponse>(
    "/api/billing/iap-receipt",
    { method: "POST", body: JSON.stringify(body) },
    authToken
  );
}
