let desktopBillingCatalog = null;
let desktopBillingCatalogLoading = false;

function billingPlanOptions() {
  const paid = planTiers.filter((plan) => plan.key !== "free");
  const remote = Array.isArray(desktopBillingCatalog?.plans) ? desktopBillingCatalog.plans : [];
  if (!remote.length) return paid;
  return paid.map((plan) => {
    const match = remote.find((item) => item?.key === plan.key);
    if (!match) return plan;
    return {
      ...plan,
      name: String(match.label || plan.name),
      price: billingCatalogPrice(match.monthlyPricePence, "monthly", plan.price),
      annualPrice: billingCatalogPrice(match.annualPricePence, "annual", plan.annualPrice),
      monthlyCredits: Number(match.monthlyCredits) || plan.monthlyCredits,
      annualCredits: Number(match.annualCredits) || plan.annualCredits,
      agents: Number(match.maxConcurrentAgents) || plan.agents,
      projects: Number(match.maxActiveProjects) || plan.projects
    };
  });
}

function billingCatalogPrice(pence, cycle, fallback) {
  const amount = Number(pence);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const currency = String(desktopBillingCatalog?.currency || "gbp").toUpperCase();
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 100 ? 2 : 0
  }).format(amount / 100);
  return `${formatted}/${cycle === "annual" ? "yr" : "mo"}`;
}

async function loadDesktopBillingCatalog() {
  if (desktopBillingCatalogLoading || desktopBillingCatalog) return;
  desktopBillingCatalogLoading = true;
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/billing/plans`, {
      headers: { Accept: "application/json" }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !Array.isArray(result?.plans)) return;
    desktopBillingCatalog = result;
    if (profileBillingPlanOpen && typeof profileRenderTarget === "function" && profileRenderTarget()) renderProfile();
    if (typeof tokenModalView !== "undefined" && tokenModalView === "plans"
      && typeof nodes !== "undefined" && nodes.tokenModal?.classList.contains("open")) renderTokenModal();
  } catch {
    // Local plan data keeps the upgrade surface usable while the backend is unavailable.
  } finally {
    desktopBillingCatalogLoading = false;
  }
}
