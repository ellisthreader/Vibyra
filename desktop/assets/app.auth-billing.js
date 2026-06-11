async function startDesktopBillingCheckout(plan, cycle = "monthly") {
  const planKey = String(plan || "starter").toLowerCase();
  if (!["starter", "builder", "pro"].includes(planKey)) return;
  await requestDesktopBilling("/desktop/account-api/billing/checkout", { kind: "subscription", plan: planKey, cycle });
}

async function changeDesktopMembership(plan, cycle = "monthly") {
  const planKey = String(plan || "").toLowerCase();
  if (!["starter", "builder", "pro"].includes(planKey)) return;
  await requestDesktopBilling("/desktop/account-api/billing/change", { plan: planKey, cycle }, true);
}

async function openDesktopBillingPortal() {
  await requestDesktopBilling("/desktop/account-api/billing/portal", {});
}

async function requestDesktopBilling(endpoint, payload, acceptUser = false) {
  const token = desktopAuthSession()?.token;
  if (!token) {
    setDesktopBillingStatus(false, "Log in again to manage membership.", true);
    return;
  }
  if (profileBillingBusy) return;
  const electronShell = typeof isElectronShell === "function" && isElectronShell();
  const popup = electronShell ? null : window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  setDesktopBillingStatus(true, "Opening secure billing...");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || (!result?.url && !(acceptUser && result?.user))) {
      throw new Error(result?.error || result?.message || "Could not open billing.");
    }
    if (result.user) {
      popup?.close();
      storeDesktopAuthSession(token, result.user);
      if (typeof currentState !== "undefined") currentState = { ...currentState, desktopAccount: result.user };
      closeTokenModal();
      profileBillingPlanOpen = false;
      profileBillingManageOpen = false;
      setDesktopBillingStatus(false, "Membership changed.");
      renderProfile();
      return;
    }
    if (popup) popup.location.replace(result.url);
    else window.open(result.url, "_blank", "noopener");
    refreshBillingAfterExternalReturn();
    setDesktopBillingStatus(false, "");
  } catch (error) {
    popup?.close();
    setDesktopBillingStatus(false, error instanceof Error ? error.message : "Could not open billing.", true);
  }
}

function refreshBillingAfterExternalReturn() {
  setTimeout(() => window.addEventListener("focus", async () => {
    if (typeof refreshDesktopAccountSession === "function") await refreshDesktopAccountSession().catch(() => null);
    if (typeof profileRenderTarget === "function" && profileRenderTarget()) renderProfile();
  }, { once: true }), 500);
}

function setDesktopBillingStatus(busy, message, danger = false) {
  profileBillingBusy = Boolean(busy);
  profileBillingMessage = String(message || "");
  profileBillingMessageDanger = Boolean(danger);
  if (typeof profileRenderTarget === "function" && profileRenderTarget()) renderProfile();
}
