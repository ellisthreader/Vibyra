import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { headers, readBody, send } from "./http.mjs";
import { appState } from "./state.mjs";

const ACCOUNT_API_PREFIX = "/desktop/account-api";
const REQUEST_TIMEOUT_MS = 10_000;
const FIXED_ROUTES = new Map([
  ["GET /sessions", "/api/account/sessions"],
  ["DELETE /sessions", "/api/account/sessions"],
  ["POST /profile", "/api/account/profile"],
  ["DELETE /account", "/api/account"],
  ["GET /referral", "/api/referrals/me"],
  ["POST /billing/checkout", "/api/billing/checkout"],
  ["POST /billing/change", "/api/billing/change"],
  ["POST /billing/portal", "/api/billing/portal"],
  ["POST /billing/cancel", "/api/billing/cancel"]
]);

export async function handleDesktopAccountProxy(req, res, url, options = {}) {
  if (url.pathname !== ACCOUNT_API_PREFIX && !url.pathname.startsWith(`${ACCOUNT_API_PREFIX}/`)) {
    return false;
  }
  if (!authorizeDesktopUi(req, res)) return true;

  const upstreamPath = desktopAccountUpstreamPath(req.method, url.pathname);
  if (!upstreamPath) {
    send(res, 404, accountError("unsupported_account_route", "Unsupported desktop account route."));
    return true;
  }

  const token = String(appState.desktopAccountToken || "").trim();
  if (!token) {
    send(res, 401, accountError("account_session_required", "Log in to Vibyra Desktop to manage your account."));
    return true;
  }

  const init = {
    method: req.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  };
  if (isProviderDeletionStart(req.method, url.pathname)) {
    await readBody(req);
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({ purpose: "deletion" });
  } else if (req.method === "POST") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(await readBody(req));
  }

  const fetchImpl = options.fetchImpl || fetch;
  const apiUrl = options.apiUrl || desktopAppApiUrl();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timer;

  try {
    const result = await Promise.race([
      fetchUpstream(fetchImpl, `${apiUrl}${upstreamPath}`, init, controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(proxyFailure(504, "account_proxy_timeout", "The Vibyra account service timed out."));
        }, timeoutMs);
      })
    ]);
    res.writeHead(result.status, headers(result.contentType));
    res.end(result.payload);
  } catch (error) {
    if (timedOut || error?.status === 504) {
      send(res, 504, accountError("account_proxy_timeout", "The Vibyra account service timed out."));
    } else {
      send(res, 502, accountError(
        "account_proxy_unavailable",
        "Vibyra could not contact the account service."
      ));
    }
  } finally {
    clearTimeout(timer);
  }
  return true;
}

async function fetchUpstream(fetchImpl, url, init, signal) {
  const response = await fetchImpl(url, { ...init, signal });
  return {
    status: response.status,
    contentType: response.headers?.get?.("content-type") || "application/json",
    payload: await response.text()
  };
}

export function desktopAccountUpstreamPath(method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  const relativePath = String(pathname || "").slice(ACCOUNT_API_PREFIX.length);
  const fixed = FIXED_ROUTES.get(`${normalizedMethod} ${relativePath}`);
  if (fixed) return fixed;

  const providerStart = relativePath.match(/^\/provider-delete\/(apple|google)\/start$/);
  if (normalizedMethod === "POST" && providerStart) {
    return `/api/auth/desktop/${providerStart[1]}/start`;
  }
  const providerStatus = relativePath.match(
    /^\/provider-delete\/(apple|google)\/status\/([A-Za-z0-9]{40,100})$/
  );
  if (normalizedMethod === "GET" && providerStatus) {
    return `/api/auth/desktop/${providerStatus[1]}/status/${providerStatus[2]}`;
  }

  if (normalizedMethod !== "DELETE") return null;
  const deviceRoute = relativePath.match(/^\/devices\/([^/]+)$/);
  if (!deviceRoute) return null;
  try {
    const deviceId = decodeURIComponent(deviceRoute[1]);
    return deviceId ? `/api/account/devices/${encodeURIComponent(deviceId)}` : null;
  } catch {
    return null;
  }
}

function isProviderDeletionStart(method, pathname) {
  return String(method || "").toUpperCase() === "POST"
    && /^\/desktop\/account-api\/provider-delete\/(apple|google)\/start$/.test(pathname);
}

function accountError(code, error) {
  return { ok: false, code, error };
}

function proxyFailure(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
