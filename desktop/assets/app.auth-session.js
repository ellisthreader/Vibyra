function desktopAuthUser() {
  return desktopAuthSession()?.user || null;
}

function desktopAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(authKey) || "null");
  } catch {
    return null;
  }
}

function storeDesktopAuthSession(token, user) {
  if (!token || !user?.id) return;
  const session = desktopAuthSession() || {};
  localStorage.setItem(authKey, JSON.stringify({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan || "free",
      planBillingCycle: user.planBillingCycle || "monthly",
      planRenewsAt: user.planRenewsAt || null,
      creditsBalance: Number(user.creditsBalance) || 0,
      creditsUsed: Number(user.creditsUsed) || 0,
      monthlyCredits: Number(user.monthlyCredits) || 0,
      dailyCreditsUsed: Number(user.dailyCreditsUsed) || 0,
      dailyCreditsCap: Number(user.dailyCreditsCap) || 0,
      burstCreditsUsed: Number(user.burstCreditsUsed) || 0,
      burstCreditsCap: Number(user.burstCreditsCap) || 0,
      burstCreditsResetAt: user.burstCreditsResetAt || null,
      weeklyCreditsUsed: Number(user.weeklyCreditsUsed) || 0,
      weeklyCreditsCap: Number(user.weeklyCreditsCap) || 0,
      weeklyCreditsResetAt: user.weeklyCreditsResetAt || null,
      allowedModelTiers: Array.isArray(user.allowedModelTiers) ? user.allowedModelTiers : undefined,
      level: user.level || user.levelProgress || null,
      profileImageUri: user.profileImageUri || user.profileImageUrl || user.avatarUrl || user.avatar || ""
    },
    signedInAt: session.signedInAt || new Date().toISOString()
  }));
}

async function refreshDesktopAccountSession() {
  const token = desktopAuthSession()?.token;
  return token ? syncDesktopSession(token) : null;
}
