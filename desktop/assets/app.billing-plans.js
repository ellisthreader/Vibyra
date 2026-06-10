const planCycleKey = "vibyra.desktop.billingCycle";
let planPickerCycle = localStorage.getItem(planCycleKey) === "annual" ? "annual" : "monthly";

function renderPlanPicker(currentKey, accountCycle) {
  if (!localStorage.getItem(planCycleKey) && accountCycle === "annual") planPickerCycle = "annual";
  const account = typeof currentAccount === "function" ? currentAccount() : {};
  const plans = typeof billingPlanOptions === "function"
    ? billingPlanOptions()
    : planTiers.filter((plan) => plan.key !== "free");
  const meta = {
    billingProvider: account.billingProvider || "",
    cycle: accountCycle,
    tier: { key: currentKey }
  };
  return `<section class="profile-plan-picker token-plan-picker">
    <header class="profile-plan-heading"><h2>Choose your plan</h2>${cycleToggle()}</header>
    <div class="profile-plan-grid">${plans.map((plan) => profilePlanCard(plan, meta)).join("")}</div>
  </section>`;
}
function renderProfilePlanPicker(meta) {
  if (!localStorage.getItem(planCycleKey) && meta?.cycle === "annual") planPickerCycle = "annual";
  const currentKey = meta?.tier?.key || "free";
  const plans = typeof billingPlanOptions === "function"
    ? billingPlanOptions()
    : planTiers.filter((plan) => plan.key !== "free");
  const status = profileBillingMessage
    ? `<p class="profile-plan-status${profileBillingMessageDanger ? " is-danger" : ""}" role="${profileBillingMessageDanger ? "alert" : "status"}">${escapeHtml(profileBillingMessage)}</p>`
    : "";
  return `${profileHeader("", "Billing")}
    <section class="profile-plan-picker">
      <button class="profile-plan-back" type="button" data-profile-action="close-plans">${icon("chevron")}<span>Back</span></button>
      <header class="profile-plan-heading">
        <h2>Choose your plan</h2>
        ${cycleToggle()}
      </header>
      ${status}
      <div class="profile-plan-grid">${plans.map((plan) => profilePlanCard(plan, meta)).join("")}</div>
      <p class="profile-plan-footnote">${icon("shield")}Change or end membership from Billing. Paid access continues through the billing period.</p>
    </section>`;
}
function profilePlanCard(plan, meta) {
  const currentKey = meta?.tier?.key || "free";
  const currentCycle = meta?.cycle === "annual" ? "annual" : "monthly";
  const current = plan.key === currentKey && planPickerCycle === currentCycle;
  const popular = plan.key === "builder";
  const busy = typeof profileBillingBusy !== "undefined" && profileBillingBusy;
  const action = current
    ? `<span class="profile-plan-current">${icon("check")}Current plan</span>`
    : `<button class="${popular ? "primary-button" : "secondary-button"} profile-plan-action" data-billing-plan="${escapeAttribute(plan.key)}" type="button" ${busy ? "disabled" : ""}>${busy ? "Opening..." : escapeHtml(profilePlanButtonLabel(plan, meta))}</button>`;
  return `<div class="profile-plan-card-wrap">
    ${popular ? `<span class="profile-plan-badge">Most popular</span>` : ""}
    <article class="profile-plan-card plan-tone-${escapeAttribute(plan.key)}${popular ? " is-recommended" : ""}${current ? " is-current" : ""}" style="--plan-card-image:url('${planImage(plan.key)}')">
    <div class="profile-plan-card-top">
      <img src="${planIcon(plan.key)}" alt="" />
    </div>
    <div class="profile-plan-name"><h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(profilePlanAudience(plan.key))}</p></div>
    <div class="profile-plan-price"><strong>${planPrice(plan)}</strong><span>${planPickerCycle === "annual" ? "billed annually" : "billed monthly"}</span></div>
    <ul>${profilePlanFeatures(plan).map((feature) => `<li>${icon("check")}<span>${escapeHtml(feature)}</span></li>`).join("")}</ul>
    ${action}
    </article>
  </div>`;
}
function profilePlanButtonLabel(plan, meta) {
  const currentKey = meta?.tier?.key || "free";
  const currentCycle = meta?.cycle === "annual" ? "annual" : "monthly";
  const provider = String(meta?.billingProvider || "").toLowerCase();
  if (currentKey === "free") return `Upgrade to ${plan.name}`;
  if (provider === "stripe") return "Manage with Stripe";
  if (provider === "iap-apple") return "Manage with Apple";
  if (provider === "iap-google") return "Manage with Google Play";
  if (provider && provider !== "manual") return "Manage membership";
  if (plan.key === currentKey && planPickerCycle !== currentCycle) return `Switch to ${planPickerCycle}`;
  return `Switch to ${plan.name}`;
}
function profilePlanAudience(key) {
  return ({ starter: "For focused personal projects", builder: "For building every day", pro: "For demanding multi-agent work" })[key] || "";
}
function profilePlanFeatures(plan) {
  return [
    `${formatCredits(planCredits(plan))} credits each month`,
    plan.modelAccess,
    `${plan.projects} active project${plan.projects === 1 ? "" : "s"}`,
    `${plan.agents} coding agent${plan.agents === 1 ? "" : "s"}`
  ];
}
function showProfilePlanPicker() {
  profileBillingPlanOpen = true;
  profileBillingManageOpen = false;
  profileBillingCancelOpen = false;
  renderProfile();
  if (typeof loadDesktopBillingCatalog === "function") void loadDesktopBillingCatalog();
  if (typeof resetProfileModalScroll === "function") requestAnimationFrame(() => resetProfileModalScroll());
}
function hideProfilePlanPicker() {
  profileBillingPlanOpen = false;
  renderProfile();
  if (typeof resetProfileModalScroll === "function") requestAnimationFrame(() => resetProfileModalScroll());
}
function cycleToggle() {
  return `<div class="billing-cycle-toggle" role="group" aria-label="Billing cycle">${cycleButton("monthly", "Monthly")}${cycleButton("annual", "Annual")}</div>`;
}
function cycleButton(value, label) {
  const active = planPickerCycle === value;
  const busy = typeof profileBillingBusy !== "undefined" && profileBillingBusy;
  return `<button class="${active ? "active" : ""}" type="button" data-plan-cycle="${value}" aria-pressed="${active ? "true" : "false"}" ${busy ? "disabled" : ""}>${label}</button>`;
}
function planCredits(plan) {
  return planPickerCycle === "annual" && plan.key !== "free" ? plan.annualCredits : plan.monthlyCredits;
}
function planPrice(plan) {
  if (planPickerCycle === "annual" && plan.annualPrice) return plan.annualPrice;
  return plan.price || "£0";
}
function planImage(key) {
  return `/app-assets/billing-plans/${escapeAttribute(key)}-card.png`;
}
function planIcon(key) {
  return `/app-assets/plan-icons/${escapeAttribute(key)}.png`;
}
function bindPlanPickerControls(root = document) {
  root.querySelectorAll("[data-plan-cycle]").forEach((button) => button.addEventListener("click", () => {
    planPickerCycle = button.dataset.planCycle === "annual" ? "annual" : "monthly";
    localStorage.setItem(planCycleKey, planPickerCycle);
    if (typeof profileBillingPlanOpen !== "undefined" && profileBillingPlanOpen && typeof profileRenderTarget === "function" && profileRenderTarget()) renderProfile();
    else renderTokenModal();
  }));
}
function startDesktopBilling(plan) {
  const account = currentAccount();
  const paid = String(account.plan || "free").toLowerCase() !== "free";
  if (paid && typeof changeDesktopMembership === "function") {
    changeDesktopMembership(plan, planPickerCycle);
    return;
  }
  if (typeof startDesktopBillingCheckout === "function") startDesktopBillingCheckout(plan, planPickerCycle);
}
