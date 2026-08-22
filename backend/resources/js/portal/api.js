const ENDPOINTS = {
  session: "/web-api/session",
  login: "/web-api/auth/login",
  signup: "/web-api/auth/signup",
  logout: "/web-api/auth/logout",
  plans: "/api/billing/plans",
  checkout: "/web-api/billing/checkout",
  portal: "/web-api/billing/portal",
  releases: "/web-api/releases",
};

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
}

export async function apiRequest(path, options = {}) {
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers = { Accept: "application/json", ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method.toUpperCase())) headers["X-CSRF-TOKEN"] = csrfToken();

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new ApiError(payload?.error ?? "Vibyra could not complete that request.", response.status, payload);
  }
  return payload ?? { ok: true };
}

export const portalApi = {
  session: () => apiRequest(ENDPOINTS.session),
  login: (fields) => apiRequest(ENDPOINTS.login, { body: fields }),
  signup: (fields) => apiRequest(ENDPOINTS.signup, { body: fields }),
  logout: () => apiRequest(ENDPOINTS.logout, { method: "DELETE" }),
  plans: () => apiRequest(ENDPOINTS.plans),
  checkout: (plan, cycle) => apiRequest(ENDPOINTS.checkout, {
    body: { kind: "subscription", plan, cycle },
  }),
  billingPortal: () => apiRequest(ENDPOINTS.portal, { body: {} }),
  releases: () => apiRequest(ENDPOINTS.releases),
  startProvider: (provider) => apiRequest(`/web-api/auth/provider/${provider}/start`, { body: {} }),
  providerStatus: (provider, flowId) => apiRequest(
    `/web-api/auth/provider/${provider}/status/${encodeURIComponent(flowId)}`
  ),
};

export function downloadPath(platform) {
  return `/downloads/${encodeURIComponent(platform)}`;
}
