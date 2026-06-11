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

  const inferred = billingFailureDetails(code, payload.error.details);
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

function billingFailureDetails(code, payloadDetails = {}) {
  const account = appState.desktopAccount || {};
  if (code === "billing_credits_exhausted") {
    const balance = finiteNumber(payloadDetails.creditsBalance, account.creditsBalance);
    const estimated = finiteNumber(payloadDetails.estimatedCredits);
    const resetAt = payloadDetails.creditsResetAt || account.creditsResetAt || null;
    const weeklyUsed = finiteNumber(payloadDetails.weeklyCreditsUsed, account.weeklyCreditsUsed);
    const weeklyCap = finiteNumber(payloadDetails.weeklyCreditsCap, account.weeklyCreditsCap);
    const weeklyResetAt = payloadDetails.weeklyCreditsResetAt || account.weeklyCreditsResetAt || null;
    const balanceText = balance === null
      ? "does not have enough credits"
      : `has ${balance} credit${balance === 1 ? "" : "s"} remaining`;
    const estimateText = estimated === null ? "" : ` This request needs about ${estimated} credits.`;
    const resetText = resetAt ? ` Vibyra credits reset at ${resetAt}.` : "";
    const weeklyText = weeklyCap !== null && weeklyCap > 0 && weeklyUsed !== null && weeklyUsed >= weeklyCap
      ? ` Your weekly window is also full (${weeklyUsed}/${weeklyCap})${weeklyResetAt ? ` until ${weeklyResetAt}` : ""}.`
      : "";

    return {
      inferredCode: code,
      creditsBalance: balance,
      estimatedCredits: estimated,
      resetAt,
      weeklyCreditsUsed: weeklyUsed,
      weeklyCreditsCap: weeklyCap,
      weeklyCreditsResetAt: weeklyResetAt,
      message: `Your Vibyra token balance ${balanceText}.${estimateText}${resetText}${weeklyText} This is not a company CLI API-key error. Top up or upgrade your Vibyra plan to continue.`
    };
  }

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

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}
