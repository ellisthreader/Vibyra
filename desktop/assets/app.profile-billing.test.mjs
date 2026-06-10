import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.profile-billing.js", import.meta.url), "utf8");
const plansSource = readFileSync(new URL("./app.billing-plans.js", import.meta.url), "utf8");
const catalogSource = readFileSync(new URL("./app.billing-catalog.js", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const modalsSource = readFileSync(new URL("./app.modals.js", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const cancellationSource = readFileSync(new URL("./app.profile-billing-cancel.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.profile-billing.css", import.meta.url), "utf8");
const planStyles = readFileSync(new URL("./app.profile-billing-plans.css", import.meta.url), "utf8");
const planArtStyles = readFileSync(new URL("./app.profile-billing-plan-art.css", import.meta.url), "utf8");
const manageStyles = readFileSync(new URL("./app.profile-billing-manage.css", import.meta.url), "utf8");
const cancellationStyles = readFileSync(new URL("./app.profile-billing-cancel.css", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function renderBilling(meta, state = {}) {
  const context = {
    escapeAttribute: escapeHtml,
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    profileBillingCancelBusy: false,
    profileBillingCancelDanger: false,
    profileBillingCancelMessage: "",
    profileBillingCancelOpen: false,
    profileBillingManageOpen: Boolean(state.manageOpen),
    profileHeader: (_kicker, title) => `<header><h1>${escapeHtml(title)}</h1></header>`
  };
  vm.runInNewContext(`${cancellationSource}\n${source}`, context);
  return vm.runInNewContext(`profileBillingSection(${JSON.stringify(meta)})`, context);
}

const paidMeta = {
  account: { planRenewsAt: "2026-07-09T00:00:00.000Z" },
  allowance: 1800,
  billingProvider: "stripe",
  billingCurrency: "gbp",
  burstCap: 100,
  burstUsed: 42,
  canManageStripeBilling: true,
  cycle: "annual",
  creditsResetAt: "2026-07-09T00:00:00.000Z",
  planPricePence: 49000,
  planLabel: "Builder annual",
  tier: { annualPrice: "£490/yr", key: "builder", price: "£49/mo" },
  used: 450,
  weeklyCap: 1000,
  weeklyUsed: 875
};

test("paid billing hides management details behind one simple action", () => {
  const html = renderBilling(paidMeta);
  assert.match(html, /Builder annual/);
  assert.match(html, /£490 · Annual/);
  assert.match(html, /Next credit refresh 9 July 2026/);
  assert.match(html, /450 \/ 1,800/);
  assert.match(html, /42% used/);
  assert.match(html, /88% used/);
  assert.match(html, /data-profile-action="show-membership-management"/);
  assert.match(html, />Manage membership<\/button>/);
  assert.doesNotMatch(html, /data-profile-action="manage-billing"/);
  assert.doesNotMatch(html, /Stripe securely handles|Cancel membership|Why are you leaving/);
  assert.doesNotMatch(html, /Change plan|data-profile-action="open-plans"/);
});

test("expanded Stripe management exposes provider and cancellation actions", () => {
  const context = {
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    profileBillingBusy: true,
    profileBillingMessage: "Opening secure billing...",
    profileBillingMessageDanger: false,
    profileBillingCancelBusy: false,
    profileBillingCancelDanger: false,
    profileBillingCancelMessage: "",
    profileBillingCancelOpen: false,
    profileBillingManageOpen: true,
    escapeAttribute: escapeHtml,
    profileHeader: (_kicker, title) => `<header><h1>${escapeHtml(title)}</h1></header>`
  };
  vm.runInNewContext(`${cancellationSource}\n${source}`, context);
  const html = vm.runInNewContext(`profileBillingSection(${JSON.stringify(paidMeta)})`, context);
  assert.match(html, /Manage membership/);
  assert.match(html, /data-profile-action="change-membership"/);
  assert.match(html, />Change membership<\/button>/);
  assert.match(html, /data-profile-action="show-billing-cancel"/);
  assert.match(html, />End membership<\/button>/);
  assert.ok(html.indexOf("Billing details") < html.indexOf("Change membership"));
  assert.doesNotMatch(html, /Choose another plan|Cancel your plan/);
  assert.match(html, /Opening\.\.\./);
  assert.match(html, /role="status">Opening secure billing\.\.\./);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /Why are you leaving/);
});

test("free billing offers upgrade without renewal or payment claims", () => {
  const html = renderBilling({
    account: { planRenewsAt: "2026-07-09T00:00:00.000Z" },
    allowance: 100,
    burstCap: 0,
    cycle: "monthly",
    planLabel: "Free",
    tier: { key: "free", price: "£0" },
    used: 10,
    weeklyCap: 0
  });
  assert.match(html, /data-profile-action="open-plans"/);
  assert.match(html, />Upgrade plan</);
  assert.match(html, /Not available/);
  assert.doesNotMatch(html, /credit refresh|Stripe|payment|invoice|manage-billing/i);
});

test("Settings upgrade stays inside Billing and renders a simple plan comparison", () => {
  const context = {
    escapeAttribute: escapeHtml,
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    localStorage: { getItem: () => null, setItem: () => {} },
    planTiers: [
      { key: "free", name: "Free", price: "£0", monthlyCredits: 50, annualCredits: 50, agents: 0, projects: 1, modelAccess: "Budget models" },
      { key: "starter", name: "Starter", price: "£20/mo", annualPrice: "£225/yr", monthlyCredits: 350, annualCredits: 350, agents: 1, projects: 1, modelAccess: "All models" },
      { key: "builder", name: "Builder", price: "£49/mo", annualPrice: "£585/yr", monthlyCredits: 1000, annualCredits: 1000, agents: 2, projects: 3, modelAccess: "All models" },
      { key: "pro", name: "Pro", price: "£99/mo", annualPrice: "£1,170/yr", monthlyCredits: 2000, annualCredits: 2000, agents: 4, projects: 10, modelAccess: "All models" }
    ],
    profileBillingMessage: "",
    profileBillingMessageDanger: false,
    profileHeader: (_kicker, title) => `<header><h1>${escapeHtml(title)}</h1></header>`
  };
  vm.runInNewContext(plansSource, context);
  const html = vm.runInNewContext(`renderProfilePlanPicker(${JSON.stringify({
    tier: { key: "free" }
  })})`, context);

  assert.match(html, />Back<\/span>/);
  assert.match(html, /Choose your plan/);
  assert.doesNotMatch(html, /Current plan:|More credits, projects/);
  assert.match(html, /Starter/);
  assert.match(html, /Builder/);
  assert.match(html, /Pro/);
  assert.match(html, /Most popular/);
  assert.match(html, /profile-plan-badge/);
  assert.match(html, /data-billing-plan="builder"/);
  assert.match(html, /--plan-card-image:url\('\/app-assets\/billing-plans\/builder-card\.png'\)/);
  assert.doesNotMatch(html, /billing-hero|token-modal/);
  assert.match(actionsSource, /open-plans"\) \{ showProfilePlanPicker\(\)/);
  assert.match(actionsSource, /change-membership"\) \{ showProfilePlanPicker\(\)/);
  assert.match(actionsSource, /bindPlanPickerControls\(root\)/);
  assert.match(plansSource, /planPickerCycle === currentCycle/);
  assert.match(plansSource, /Manage with Stripe/);
  assert.match(plansSource, /Switch to \$\{planPickerCycle\}/);
  assert.match(catalogSource, /\/api\/billing\/plans/);
  assert.match(catalogSource, /monthlyPricePence/);
  assert.match(planArtStyles, /background-image: var\(--plan-card-image\)/);
  assert.match(planArtStyles, /linear-gradient\(180deg/);
  assert.match(appHtml, /app\.profile-billing-plan-art\.css/);
});

test("profile dropdown upgrade uses the same three-card plan design", () => {
  const context = {
    currentAccount: () => ({ billingProvider: "" }),
    escapeAttribute: escapeHtml,
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    localStorage: { getItem: () => null, setItem: () => {} },
    planTiers: [
      { key: "free", name: "Free", price: "£0", monthlyCredits: 50, annualCredits: 50, agents: 0, projects: 1, modelAccess: "Budget models" },
      { key: "starter", name: "Starter", price: "£20/mo", annualPrice: "£225/yr", monthlyCredits: 350, annualCredits: 350, agents: 1, projects: 1, modelAccess: "All models" },
      { key: "builder", name: "Builder", price: "£49/mo", annualPrice: "£585/yr", monthlyCredits: 1000, annualCredits: 1000, agents: 2, projects: 3, modelAccess: "All models" },
      { key: "pro", name: "Pro", price: "£99/mo", annualPrice: "£1,170/yr", monthlyCredits: 2000, annualCredits: 2000, agents: 4, projects: 10, modelAccess: "All models" }
    ],
    profileBillingBusy: false,
    profileBillingMessage: "",
    profileBillingMessageDanger: false
  };
  vm.runInNewContext(plansSource, context);
  const html = vm.runInNewContext(`renderPlanPicker("free", "monthly")`, context);

  assert.match(html, /token-plan-picker/);
  assert.match(html, /Choose your plan/);
  assert.match(html, /profile-plan-card plan-tone-starter/);
  assert.match(html, /profile-plan-card plan-tone-builder is-recommended/);
  assert.match(html, /profile-plan-card plan-tone-pro/);
  assert.match(html, /profile-plan-badge">Most popular/);
  assert.doesNotMatch(html, /data-token-view="profile"|>Back<\/span>/);
  assert.doesNotMatch(html, /billing-hero|billing-plan-row|cleanest next step/);
  assert.match(modalsSource, /loadDesktopBillingCatalog/);
  assert.match(catalogSource, /tokenModalView === "plans"/);
  assert.ok(shellSource.includes('querySelector(".token-plan-picker")'));
});

test("Apple and Google paid plans link to their subscription providers", () => {
  const apple = renderBilling({ ...paidMeta, billingProvider: "iap-apple", canManageStripeBilling: false }, { manageOpen: true });
  const google = renderBilling({ ...paidMeta, billingProvider: "iap-google", canManageStripeBilling: false }, { manageOpen: true });
  assert.match(apple, /data-profile-action="open-url"/);
  assert.match(apple, /data-profile-value="https:\/\/apps\.apple\.com\/account\/subscriptions"/);
  assert.match(apple, /Manage Apple subscription/);
  assert.doesNotMatch(apple, /manage-billing|Stripe/);
  assert.match(google, /data-profile-action="open-url"/);
  assert.match(google, /data-profile-value="https:\/\/play\.google\.com\/store\/account\/subscriptions"/);
  assert.match(google, /Manage Google Play subscription/);
  assert.doesNotMatch(google, /manage-billing|Stripe/);
});

test("manual memberships expose concise billing data and membership actions", () => {
  const context = {
    escapeAttribute: escapeHtml,
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    profileBillingCancelBusy: false,
    profileBillingCancelDanger: false,
    profileBillingCancelMessage: "",
    profileBillingCancelOpen: false,
    profileBillingManageOpen: true,
    profileHeader: (_kicker, title) => `<header><h1>${escapeHtml(title)}</h1></header>`
  };
  vm.runInNewContext(`${cancellationSource}\n${source}`, context);
  const manual = vm.runInNewContext(`profileBillingSection(${JSON.stringify({ ...paidMeta, billingProvider: "manual", canManageStripeBilling: false })})`, context);
  assert.match(manual, /Test card ···· 4242/);
  assert.match(manual, /DEMO-0001 <span>Paid<\/span>/);
  assert.match(manual, /data-profile-action="change-membership"/);
  assert.match(manual, /data-profile-action="show-billing-cancel"/);
  assert.doesNotMatch(manual, /protected demo billing data|cannot create charges|Test environment/);
  assert.doesNotMatch(manual, /data-profile-action="manage-billing"|Stripe/);
});

test("expanded cancellation asks for reason, feedback, and explicit confirmation", () => {
  const context = {
    escapeAttribute: escapeHtml,
    escapeHtml,
    formatCredits: (value) => Number(value || 0).toLocaleString("en-GB"),
    profileBillingCancelBusy: false,
    profileBillingCancelDanger: false,
    profileBillingCancelMessage: "",
    profileBillingCancelOpen: true,
    profileBillingManageOpen: true,
    profileHeader: (_kicker, title) => `<header><h1>${escapeHtml(title)}</h1></header>`
  };
  vm.runInNewContext(`${cancellationSource}\n${source}`, context);
  const html = vm.runInNewContext(`profileBillingSection(${JSON.stringify({
    ...paidMeta,
    billingProvider: "manual",
    membershipEndsAt: "2026-07-09T00:00:00.000Z"
  })})`, context);
  assert.match(html, /Why are you leaving\?/);
  assert.match(html, /It costs too much/);
  assert.match(html, /Another reason/);
  assert.match(html, /billing-cancel-details/);
  assert.match(html, /billing-cancel-confirmed/);
  assert.match(html, /Confirm cancellation/);
  assert.match(html, /Keep membership/);
  assert.match(html, /stays active until 9 July 2026/);
  assert.doesNotMatch(html, /end immediately|now on Free/);
});

test("scheduled cancellation shows paid-through date without another end action", () => {
  const html = renderBilling({
    ...paidMeta,
    membershipCancelAtPeriodEnd: true,
    membershipEndsAt: "2027-06-09T00:00:00.000Z"
  }, { manageOpen: true });
  assert.match(html, /Membership ends 9 June 2027/);
  assert.match(html, /Cancellation scheduled/);
  assert.doesNotMatch(html, /data-profile-action="show-billing-cancel"/);
});

test("unknown paid providers expose billing support in Billing", () => {
  const html = renderBilling({ ...paidMeta, billingProvider: "partner", canManageStripeBilling: true }, { manageOpen: true });
  assert.match(html, /Contact Vibyra to manage this membership/);
  assert.match(html, /mailto:support@vibyra\.app/);
  assert.doesNotMatch(html, /data-profile-action="manage-billing"|Stripe/);
});

test("billing values are clamped and account copy is escaped", () => {
  const html = renderBilling({
    ...paidMeta,
    burstUsed: 999,
    planLabel: "<script>alert(1)</script>",
    weeklyUsed: -5
  });
  assert.match(html, /100% used/);
  assert.match(html, /0% used/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("billing styles stay scoped and responsive", () => {
  assert.match(styles, /\.profile-billing-management/);
  assert.match(manageStyles, /\.profile-billing-manage-entry/);
  assert.match(manageStyles, /\.profile-billing-manage-panel/);
  assert.match(manageStyles, /@keyframes profile-membership-reveal/);
  assert.match(manageStyles, /prefers-reduced-motion/);
  assert.match(styles, /\.profile-billing-security-details/);
  assert.match(cancellationStyles, /\.profile-billing-cancel-panel/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(planStyles, /\.profile-plan-grid/);
  assert.match(planStyles, /grid-template-columns: repeat\(3/);
  assert.match(planStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /(^|})\s*(button|section|h2|p)\s*\{/m);
  assert.doesNotMatch(manageStyles, /(^|})\s*(button|section|h2|p)\s*\{/m);
  assert.doesNotMatch(cancellationStyles, /(^|})\s*(button|section|h2|p)\s*\{/m);
  assert.ok(appHtml.indexOf("app.profile-billing-cancel.js") < appHtml.indexOf("app.profile-billing.js"));
  assert.ok(appHtml.indexOf("app.profile-billing.js") < appHtml.indexOf("app.profile-render.js"));
  assert.match(appHtml, /app\.profile-billing\.css/);
});
