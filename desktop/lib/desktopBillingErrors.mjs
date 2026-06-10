import { appState } from "./state.mjs";

export async function makeBillingFailureNonRetryable(response) {
  if (
    ![400, 429].includes(response.status)
    || !response.headers.get("content-type")?.includes("application/json")
  ) {
    return response;
  }
  let payload;
  try {
    payload = JSON.parse(await response.clone().text());
  } catch {
    return response;
  }
  const code = String(payload?.error?.code || "");
  if (!code.startsWith("billing_")) return response;

  const inferred = billingWindowDetails(code);
  const message = inferred.message || String(payload.error.message || "Vibyra could not reserve credits for this request.");
  const details = {
    ...inferred,
    ...(payload.error.details || {}),
    billingStatus: Number(payload.error.details?.billingStatus) || response.status
  };
  return new Response(message, {
    status: 400,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-store",
      "x-vibyra-billing-code": inferred.inferredCode || code,
      "x-vibyra-billing-source-code": code,
      "x-vibyra-billing-status": String(details.billingStatus)
    }
  });
}

function billingWindowDetails(code) {
  const account = appState.desktopAccount || {};
  const windows = [
    {
      code: "billing_burst_cap",
      label: "short-term",
      used: Number(account.burstCreditsUsed),
      cap: Number(account.burstCreditsCap),
      resetAt: account.burstCreditsResetAt
    },
    {
      code: "billing_weekly_cap",
      label: "weekly",
      used: Number(account.weeklyCreditsUsed),
      cap: Number(account.weeklyCreditsCap),
      resetAt: account.weeklyCreditsResetAt
    }
  ].filter((window) => window.cap > 0 && Number.isFinite(window.used));
  const directWindow = windows.find((window) => window.code === code);
  if (!directWindow && code !== "billing_usage_cap") return {};
  windows.sort((left, right) => (left.cap - left.used) - (right.cap - right.used));
  const window = directWindow || windows[0];
  if (!window) return {};
  const reset = window.resetAt ? ` It resets at ${window.resetAt}.` : "";

  return {
    inferredCode: window.code,
    creditsUsed: window.used,
    creditsCap: window.cap,
    resetAt: window.resetAt || null,
    message: `Your ${window.label} AI usage window does not have enough capacity for this request (${window.used}/${window.cap} credits used).${reset}`
  };
}
