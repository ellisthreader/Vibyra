const SAFE_DESTINATIONS = new Set(["/billing", "/checkout", "/downloads", "/account", "/owner"]);
const PAID_PLANS = new Set(["starter", "builder", "pro"]);

export function purchaseIntent(search = window.location.search) {
  const params = new URLSearchParams(search);
  const plan = PAID_PLANS.has(params.get("plan")) ? params.get("plan") : "";
  const cycle = params.get("cycle") === "annual" ? "annual" : "monthly";
  const offer = /^[a-z0-9_]{1,40}$/.test(params.get('offer') ?? '') ? params.get('offer') : '';
  const version = params.get('version') ?? '';
  const scope = params.get('scope') ?? '';
  return { plan, cycle, offer, version, scope };
}

export function safeNext(search = window.location.search, fallback = "/account") {
  const value = new URLSearchParams(search).get("next") ?? "";
  return SAFE_DESTINATIONS.has(value) ? value : fallback;
}

export function withIntent(path, intent = purchaseIntent()) {
  const params = new URLSearchParams();
  for (const key of ['offer', 'version', 'scope']) if (intent[key]) params.set(key, intent[key]);
  if (intent.plan) {
    params.set("plan", intent.plan);
    params.set("cycle", intent.cycle);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function authPath(mode, next = "/account", intent = purchaseIntent()) {
  const params = new URLSearchParams({ next });
  for (const key of ['offer', 'version', 'scope']) if (intent[key]) params.set(key, intent[key]);
  if (intent.plan) {
    params.set("plan", intent.plan);
    params.set("cycle", intent.cycle);
  }
  return `/${mode}?${params.toString()}`;
}

export function go(path) {
  window.location.assign(path);
}
