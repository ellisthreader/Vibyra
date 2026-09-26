const ROUTES = new Set(["/", "/downloads", "/benchmarks", "/login", "/signup", "/billing",
  "/account", "/account/downloads", "/legal/privacy", "/legal/terms"]);
const CTAS = new Set(["nav_downloads", "nav_login", "home_get_vibyra", "home_login",
  "downloads_windows", "downloads_linux", "downloads_linux_deb", "downloads_macos_arm64",
  "downloads_macos_x64", "signup_submit", "pricing_opened", "faq_opened"]);
const PLATFORMS = new Set(["windows", "linux", "linux-deb", "macos-arm64", "macos-x64"]);
const path = location.pathname.replace(/\/+$/, "") || "/";
let consent = "unknown";
let lastActivity = Date.now();
let lastTick = Date.now();

function token() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
}

export function setWebsiteTrackingChoice(choice) {
  consent = choice;
  lastTick = Date.now();
  lastActivity = Date.now();
}

export function trackWebsiteEvent(event, dimension, engagedSeconds) {
  if (!["aggregate", "linked"].includes(consent)) return;
  if (event === "website_cta_clicked" && !CTAS.has(dimension)) return;
  if (event === "website_download_clicked" && !PLATFORMS.has(dimension)) return;
  if (["website_page_view", "website_engagement_interval"].includes(event) && !ROUTES.has(dimension)) return;
  const body = { event, dimension, event_id: crypto.randomUUID() };
  if (engagedSeconds) body.engaged_seconds = engagedSeconds;
  fetch("/web-api/analytics/event", { method: "POST", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token(), Accept: "application/json" },
    body: JSON.stringify(body) }).catch(() => {});
}

export function initWebsiteTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-analytics-cta], [data-analytics-download]");
    if (!target) return;
    if (target.dataset.analyticsCta) trackWebsiteEvent("website_cta_clicked", target.dataset.analyticsCta);
    if (target.dataset.analyticsDownload) trackWebsiteEvent("website_download_clicked", target.dataset.analyticsDownload);
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
}

export function trackCurrentPage() {
  if (ROUTES.has(path)) trackWebsiteEvent("website_page_view", path);
}
