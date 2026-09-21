import { invoke } from "@tauri-apps/api/core";

import type { CreditsSummary, TopupOption } from "../types";

/** Membership and credits. Every address these open is chosen natively: a
 * one-time Stripe URL never crosses into the renderer. */

export function accountCredits(): Promise<CreditsSummary> {
  return invoke("account_credits");
}

export function accountTopupOptions(): Promise<TopupOption[]> {
  return invoke("account_topup_options");
}

export function accountBillingPortal(): Promise<void> {
  return invoke("account_billing_portal");
}

export function accountBillingTopup(topup: string): Promise<void> {
  return invoke("account_billing_topup", { topup });
}

/** Opens an enumerated page: the website's plans page, or Apple's
 * subscriptions page. The renderer names a page, never a URL. */
export function accountBillingPage(page: "plans" | "appStore"): Promise<void> {
  return invoke("account_billing_page", { page });
}
