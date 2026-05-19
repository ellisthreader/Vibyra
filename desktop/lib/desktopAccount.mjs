import { appState, event, pushEvents } from "./state.mjs";

const API_URL = normalizeApiUrl(process.env.VIBYRA_DESKTOP_API_URL || process.env.VIBYRA_API_URL || "http://127.0.0.1:8000");

export async function verifyAndSetDesktopAccount(token, fetchImpl = fetch) {
  const authToken = String(token || "").trim();
  if (!authToken) {
    const error = new Error("Missing Vibyra account session token");
    error.status = 401;
    throw error;
  }

  const response = await fetchImpl(`${API_URL}/api/session`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authToken}`
    }
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || "Vibyra account session could not be verified");
    error.status = response.status || 401;
    throw error;
  }

  const account = publicAccount(payload?.user);
  if (!account) {
    const error = new Error("Vibyra account session did not include a valid user");
    error.status = 401;
    throw error;
  }

  if (appState.desktopAccount?.id && appState.desktopAccount.id !== account.id) {
    appState.pendingPair = null;
    appState.pairedDevice = null;
    appState.phoneSession = null;
  }
  appState.desktopAccount = account;
  appState.desktopAccountToken = authToken;
  pushEvents([event("Account", `${account.name || account.email || "Account"} signed in on Vibyra Desktop`, "success")]);
  return account;
}

export function clearDesktopAccount() {
  appState.desktopAccount = null;
  appState.desktopAccountToken = null;
  appState.pendingPair = null;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  pushEvents([event("Account", "Vibyra Desktop account signed out", "warning")]);
}

export function sameAccountPairCheck(body) {
  const desktopAccountId = normalizedAccountId(appState.desktopAccount?.id);
  if (desktopAccountId === null) {
    return { ok: false, status: 403, error: "Log in to Vibyra Desktop with the same account as your phone." };
  }

  const phoneAccountId = normalizedAccountId(body?.accountId);
  if (phoneAccountId === null) {
    return { ok: false, status: 401, error: "Phone account identity is required before pairing." };
  }

  if (phoneAccountId !== desktopAccountId) {
    return { ok: false, status: 403, error: "This desktop is logged in to a different Vibyra account." };
  }

  return { ok: true };
}

export function normalizedAccountId(value) {
  const id = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function publicAccount(user) {
  const id = normalizedAccountId(user?.id);
  if (id === null) return null;
  const plan = String(user?.plan || "free");
  const cycle = String(user?.planBillingCycle || user?.plan_billing_cycle || "monthly");
  return {
    id,
    email: String(user?.email || ""),
    name: String(user?.name || ""),
    plan,
    planBillingCycle: cycle,
    planRenewsAt: user?.planRenewsAt || user?.plan_renews_at || null,
    creditsBalance: numberOrZero(user?.creditsBalance ?? user?.credits_balance),
    creditsUsed: numberOrZero(user?.creditsUsed ?? user?.credits_used),
    monthlyCredits: numberOrZero(user?.monthlyCredits ?? user?.monthly_credits),
    dailyCreditsUsed: numberOrZero(user?.dailyCreditsUsed ?? user?.daily_credits_used),
    dailyCreditsCap: numberOrZero(user?.dailyCreditsCap ?? user?.daily_credit_cap),
    weeklyCreditsUsed: numberOrZero(user?.weeklyCreditsUsed ?? user?.weekly_credits_used),
    weeklyCreditsCap: numberOrZero(user?.weeklyCreditsCap ?? user?.weekly_credit_cap),
    allowedModelTiers: Array.isArray(user?.allowedModelTiers) ? user.allowedModelTiers.map(String) : allowedTiersForPlan(plan),
    level: user?.level || user?.levelProgress || null,
    profileImageUri: String(user?.profileImageUri || user?.profileImageUrl || user?.avatarUrl || user?.avatar || ""),
    signedInAt: new Date().toISOString()
  };
}

export function syncDesktopAccountFromUser(user) {
  const account = publicAccount(user);
  if (account && (!appState.desktopAccount?.id || appState.desktopAccount.id === account.id)) {
    appState.desktopAccount = account;
  }
  return account;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function allowedTiersForPlan(plan) {
  return String(plan || "free").toLowerCase() === "free"
    ? ["free", "budget"]
    : ["free", "budget", "balanced", "premium"];
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeApiUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}
