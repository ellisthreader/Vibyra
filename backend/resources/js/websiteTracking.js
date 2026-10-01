import { initWebsiteVitals } from "./websiteVitals.js";

const ROUTES = new Set(["/", "/downloads", "/benchmarks", "/login", "/signup", "/billing", "/checkout",
  "/billing/success", "/billing/cancel", "/account", "/account/downloads", "/legal/privacy", "/legal/terms"]);
const CTAS = new Set(["nav_downloads", "nav_login", "home_get_vibyra", "home_login",
  "downloads_windows", "downloads_linux", "downloads_linux_deb", "downloads_macos_arm64",
  "downloads_macos_x64", "signup_submit", "pricing_opened", "faq_opened",
  "hero_download", "hero_walkthrough", "hero_film", "plans_buy", "plans_signup",
  "mobile_waitlist", "getting_started_download", "nav_mobile_download", "faq_downloads",
  "billing_buy", "billing_start_free", "checkout_signup", "checkout_login", "checkout_pay"]);
const PLATFORMS = new Set(["windows", "linux", "linux-deb", "macos-arm64", "macos-x64"]);
const FORMS = new Set(["signup", "waitlist", "faq", "billing"]);
const path = location.pathname.replace(/\/+$/, "") || "/";
const startedForms = new Set();
const seenErrors = new Set();
let consent = "unknown";
let lastActivity = Date.now();
let lastTick = Date.now();

function token() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
}

function acquisition() {
  const params = new URLSearchParams(location.search);
  const result = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    if (params.has(key)) result[key] = params.get(key);
  }
  try {
    if (document.referrer) result.referrer_domain = new URL(document.referrer).hostname;
  } catch { /* No usable referring domain. */ }
  return result;
}

export function setWebsiteTrackingChoice(choice) {
  consent = choice;
  lastTick = Date.now();
  lastActivity = Date.now();
}

export function trackWebsiteEvent(event, dimension, engagedSeconds, metadata = {}) {
  if (!["aggregate", "linked"].includes(consent)) return false;
  if (event === "website_cta_clicked" && !CTAS.has(dimension)) return false;
  if (event === "website_download_clicked" && !PLATFORMS.has(dimension)) return false;
  if (["website_form_started", "website_form_submitted"].includes(event) && !FORMS.has(dimension)) return false;
  if (["website_page_view", "website_engagement_interval", "website_performance", "website_error"].includes(event)
    && !ROUTES.has(dimension)) return false;
  const body = { event, dimension, event_id: crypto.randomUUID() };
  if (engagedSeconds) body.engaged_seconds = engagedSeconds;
  Object.assign(body, metadata);
  fetch("/web-api/analytics/event", { method: "POST", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token(), Accept: "application/json" },
    body: JSON.stringify(body) }).catch(() => {});
  return true;
}

export function initWebsiteTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-analytics-cta], [data-analytics-download]");
    if (!target) return;
    if (target.dataset.analyticsCta) trackWebsiteEvent("website_cta_clicked", target.dataset.analyticsCta);
    if (target.dataset.analyticsDownload) trackWebsiteEvent("website_download_clicked", target.dataset.analyticsDownload);
  });
  document.addEventListener("focusin", (event) => {
    const form = event.target.closest("form[data-analytics-form]");
    const name = form?.dataset.analyticsForm;
    if (FORMS.has(name) && !startedForms.has(name)) {
      startedForms.add(name);
      trackWebsiteEvent("website_form_started", name);
    }
  });
  document.addEventListener("submit", (event) => {
    const name = event.target?.dataset?.analyticsForm;
    if (FORMS.has(name)) trackWebsiteEvent("website_form_submitted", name);
  });
  for (const type of ["pointerdown", "keydown", "scroll", "touchstart"]) {
    window.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true });
  }
  window.setInterval(() => {
    const now = Date.now();
    const seconds = Math.min(30, Math.floor((now - lastTick) / 1000));
    lastTick = now;
    if (!ROUTES.has(path) || !document.hasFocus() || document.visibilityState !== "visible"
      || now - lastActivity > 30000 || seconds < 1) return;
    trackWebsiteEvent("website_engagement_interval", path, seconds);
  }, 10000);
  initWebsiteVitals((metric_name, metric_value) => trackWebsiteEvent(
    "website_performance", path, undefined, { metric_name, metric_value }));
  window.addEventListener("error", (event) => {
    const category = event.target === window ? "script" : "resource";
    if (!seenErrors.has(category)) {
      seenErrors.add(category);
      trackWebsiteEvent("website_error", path, undefined, { error_category: category });
    }
  }, true);
  window.addEventListener("unhandledrejection", () => {
    if (seenErrors.has("promise")) return;
    seenErrors.add("promise");
    trackWebsiteEvent("website_error", path, undefined, { error_category: "promise" });
  });
  window.addEventListener("vibyra:network-error", () => {
    if (seenErrors.has("network")) return;
    seenErrors.add("network");
    trackWebsiteEvent("website_error", path, undefined, { error_category: "network" });
  });
}

export function trackCurrentPage() {
  if (ROUTES.has(path)) trackWebsiteEvent("website_page_view", path, undefined, acquisition());
}
