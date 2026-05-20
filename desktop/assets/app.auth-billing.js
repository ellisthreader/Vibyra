async function startDesktopBillingCheckout(plan, cycle = "monthly") {
  const planKey = String(plan || "starter").toLowerCase();
  if (!["starter", "builder", "pro"].includes(planKey)) return;
  await requestDesktopBilling("/api/billing/checkout", { kind: "subscription", plan: planKey, cycle });
}

async function openDesktopBillingPortal() {
  await requestDesktopBilling("/api/billing/portal", {});
}

async function requestDesktopBilling(endpoint, payload) {
  const token = desktopAuthSession()?.token;
  if (!token) {
    showAuthError("Log in again to manage membership.");
    return;
  }
  try {
    const response = await fetch(`${appApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !result?.url) {
      throw new Error(result?.error || result?.message || "Could not open billing.");
    }
    window.open(result.url, "_blank", "noopener");
  } catch (error) {
    showAuthError(error instanceof Error ? error.message : "Could not open billing.");
  }
}
