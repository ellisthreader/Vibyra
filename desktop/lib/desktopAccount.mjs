import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { appState, event, pushEvents } from "./state.mjs";
import { desktopAppApiUrl } from "./appApiConfig.mjs";

const API_URL = desktopAppApiUrl();

export async function verifyAndSetDesktopAccount(token, publicIpOrFetch = "", fetchImpl = fetch) {
  const publicIp = typeof publicIpOrFetch === "function" ? "" : String(publicIpOrFetch || "").trim();
  const request = typeof publicIpOrFetch === "function" ? publicIpOrFetch : fetchImpl;
  const authToken = String(token || "").trim();
  if (!authToken) {
    const error = new Error("Missing Vibyra account session token");
    error.status = 401;
    throw error;
  }

  const response = await request(`${API_URL}/api/session`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authToken}`,
      ...(publicIp ? { "X-Vibyra-Public-IP": publicIp } : {})
    }
  });
  const payload = await readJson(response);
  if (!response.ok) {
    clearDesktopAccount("Your Vibyra session expired. Sign in again to continue.");
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

export function clearDesktopAccount(message = "Vibyra Desktop account signed out") {
  appState.desktopAccount = null;
  appState.desktopAccountToken = null;
  appState.pendingPair = null;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  pushEvents([event("Account", message, "warning")]);
}

export function persistDesktopAccountSession(token, account, { sessionPath } = {}) {
  const authToken = String(token || "").trim();
  const accountId = normalizedAccountId(account?.id);
  if (!authToken || accountId === null) {
    throw new Error("A verified Vibyra account session is required before persistence");
  }

  const path = sessionPath || desktopAccountSessionPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({
    token: authToken,
    account,
    savedAt: new Date().toISOString()
  })}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function restoreDesktopAccountSessionSnapshot({ sessionPath } = {}) {
  const path = sessionPath || desktopAccountSessionPath();
  try {
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    const token = String(snapshot?.token || "").trim();
    const account = snapshot?.account;
    if (!token || normalizedAccountId(account?.id) === null) {
      removeDesktopAccountSession({ sessionPath: path });
      return null;
    }
    appState.desktopAccountToken = token;
    appState.desktopAccount = account;
    return { token, account };
  } catch {
    return null;
  }
}

export function removeDesktopAccountSession({ sessionPath } = {}) {
  rmSync(sessionPath || desktopAccountSessionPath(), { force: true });
}

function desktopAccountSessionPath() {
  const agentHome = process.env.VIBYRA_AGENT_HOME || join(homedir(), ".vibyra-agent");
  return join(agentHome, "desktop-account-session.json");
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
  const account = {
    id,
    email: String(user?.email || ""),
    name: String(user?.name || ""),
    provider: String(user?.provider || "email"),
    emailVerified: Boolean(user?.emailVerified ?? user?.email_verified),
    plan,
    planBillingCycle: cycle,
    planRenewsAt: user?.planRenewsAt || user?.plan_renews_at || null,
    creditsResetAt: user?.creditsResetAt || user?.credits_reset_at || user?.planRenewsAt || user?.plan_renews_at || null,
    membershipEndsAt: user?.membershipEndsAt || user?.membership_ends_at || null,
    membershipCancelAtPeriodEnd: Boolean(
      user?.membershipCancelAtPeriodEnd ?? user?.membership_cancel_at_period_end
    ),
    billingProvider: String(user?.billingProvider || user?.billing_provider || ""),
    canManageStripeBilling: Boolean(user?.canManageStripeBilling ?? user?.can_manage_stripe_billing),
    planPricePence: numberOrZero(user?.planPricePence ?? user?.plan_price_pence),
    billingCurrency: String(user?.billingCurrency || user?.billing_currency || "gbp"),
    billingVatInclusive: Boolean(user?.billingVatInclusive ?? user?.billing_vat_inclusive ?? true),
    creditsBalance: numberOrZero(user?.creditsBalance ?? user?.credits_balance),
    creditsUsed: numberOrZero(user?.creditsUsed ?? user?.credits_used),
    monthlyCredits: numberOrZero(user?.monthlyCredits ?? user?.monthly_credits),
    dailyCreditsUsed: numberOrZero(user?.dailyCreditsUsed ?? user?.daily_credits_used),
    dailyCreditsCap: numberOrZero(user?.dailyCreditsCap ?? user?.daily_credit_cap),
    burstCreditsUsed: numberOrZero(user?.burstCreditsUsed ?? user?.burst_credits_used),
    burstCreditsCap: numberOrZero(user?.burstCreditsCap ?? user?.burst_credit_cap),
    burstCreditsResetAt: user?.burstCreditsResetAt || user?.burst_credits_reset_at || null,
    weeklyCreditsUsed: numberOrZero(user?.weeklyCreditsUsed ?? user?.weekly_credits_used),
    weeklyCreditsCap: numberOrZero(user?.weeklyCreditsCap ?? user?.weekly_credit_cap),
    weeklyCreditsResetAt: user?.weeklyCreditsResetAt || user?.weekly_credits_reset_at || null,
    allowedModelTiers: Array.isArray(user?.allowedModelTiers) ? user.allowedModelTiers.map(String) : allowedTiersForPlan(plan),
    level: user?.level || user?.levelProgress || null,
    profileImageUri: String(user?.profileImageUri || user?.profileImageUrl || user?.avatarUrl || user?.avatar || ""),
    signedInAt: new Date().toISOString()
  };
  copyOptionalNumber(account, user, "maxConcurrentAgents", "max_concurrent_agents");
  copyOptionalNumber(account, user, "maxActiveProjects", "max_active_projects");
  copyOptionalNumber(account, user, "contextTokenCap", "context_token_cap");
  return account;
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

function copyOptionalNumber(target, source, camelKey, snakeKey) {
  const value = source?.[camelKey] ?? source?.[snakeKey];
  if (value === undefined || value === null || value === "") return;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) target[camelKey] = numeric;
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
