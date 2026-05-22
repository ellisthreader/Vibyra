const planCycleKey = "vibyra.desktop.billingCycle";
let planPickerCycle = localStorage.getItem(planCycleKey) === "annual" ? "annual" : "monthly";

function renderPlanPicker(currentKey, accountCycle) {
  if (!localStorage.getItem(planCycleKey) && accountCycle === "annual") planPickerCycle = "annual";
  const current = planTiers.find((plan) => plan.key === currentKey) || planTiers[0];
  const paid = planTiers.filter((plan) => plan.key !== "free");
  const featured = paid.find((plan) => plan.key === recommendedPlanKey(currentKey)) || paid[1] || paid[0];
  const alternatives = paid.filter((plan) => plan.key !== featured.key).map((plan) => planOptionRow(plan, currentKey)).join("");
  const title = currentKey === "pro" ? "Your plan is already at the top" : `${featured.name} is the cleanest next step`;
  return `<button class="plans-back billing-back" type="button" data-token-view="profile" aria-label="Back to profile">${icon("chevron")}<span>Back</span></button><section class="billing-revamp"><header class="billing-revamp-head"><div><p>Current plan <strong>${escapeHtml(current.name)}</strong></p><h3>${escapeHtml(title)}</h3></div>${cycleToggle()}</header>${featuredPlan(featured, currentKey)}<div class="billing-plan-rows">${alternatives}</div></section>`;
}
function cycleToggle() {
  return `<div class="billing-cycle-toggle" role="group" aria-label="Billing cycle">${cycleButton("monthly", "Monthly")}${cycleButton("annual", "Annual")}</div>`;
}
function cycleButton(value, label) {
  const active = planPickerCycle === value;
  return `<button class="${active ? "active" : ""}" type="button" data-plan-cycle="${value}" aria-pressed="${active ? "true" : "false"}">${label}</button>`;
}
function recommendedPlanKey(currentKey) {
  if (currentKey === "starter") return "builder";
  if (currentKey === "builder") return "pro";
  if (currentKey === "pro") return "pro";
  return "builder";
}
function featuredPlan(plan, currentKey) {
  const current = plan.key === currentKey;
  const button = current ? `<span class="billing-current-chip">Current plan</span>` : `<button class="primary-button billing-primary" data-billing-plan="${escapeAttribute(plan.key)}" type="button">${escapeHtml(planButtonLabel(plan, currentKey))}</button>`;
  return `<article class="billing-hero plan-tone-${escapeAttribute(plan.key)}" style="--plan-image:url('${planImage(plan.key)}')"><div class="billing-hero-copy"><span>Recommended</span><h4>${escapeHtml(plan.name)}</h4><p>${planPrice(plan)} · ${formatCredits(planCredits(plan))} credits/month</p><small>${escapeHtml(planTagline(plan.key))}</small><div class="billing-hero-points">${planPoints(plan).map((point) => `<i>${escapeHtml(point)}</i>`).join("")}</div>${button}</div></article>`;
}
function planOptionRow(plan, currentKey) {
  const current = plan.key === currentKey;
  const action = current ? `<span class="billing-current-chip">Current</span>` : `<button class="secondary-button compact-button" data-billing-plan="${escapeAttribute(plan.key)}" type="button">${escapeHtml(planButtonLabel(plan, currentKey))}</button>`;
  return `<article class="billing-plan-row plan-tone-${escapeAttribute(plan.key)}"><img src="${planIcon(plan.key)}" alt="" /><div><strong>${escapeHtml(plan.name)}</strong><span>${planPrice(plan)} · ${formatCredits(planCredits(plan))} credits/month</span><small>${escapeHtml(planTagline(plan.key))}</small></div>${action}</article>`;
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
function planTagline(key) {
  return ({ starter: "Ship your first real build.", builder: "Daily building with more projects and agents.", pro: "Multi-agent power for serious workflows." })[key] || "Tinker and try things out.";
}
function planPoints(plan) {
  if (plan.key === "starter") return ["All AI models", "1 active project", "1 agent"];
  if (plan.key === "builder") return ["All premium models", "3 projects", "2 agents"];
  return ["Priority routing", "10 projects", "4 agents"];
}
function planButtonLabel(plan, currentKey) {
  return currentKey === "free" ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
}
function bindPlanPickerControls() {
  document.querySelectorAll("[data-plan-cycle]").forEach((button) => button.addEventListener("click", () => {
    planPickerCycle = button.dataset.planCycle === "annual" ? "annual" : "monthly";
    localStorage.setItem(planCycleKey, planPickerCycle);
    renderTokenModal();
  }));
}
function startDesktopBilling(plan) {
  if (typeof startDesktopBillingCheckout === "function") startDesktopBillingCheckout(plan, planPickerCycle);
}
