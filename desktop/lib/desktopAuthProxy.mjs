import { desktopAppApiUrl } from "./appApiConfig.mjs";

const API_URL = desktopAppApiUrl();
const AUTH_ENDPOINTS = {
  login: "/api/auth/login",
  signup: "/api/auth/signup"
};
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const AUTH_RETRY_DELAY_MS = 200;

export async function requestDesktopAuth(kind, body, fetchImpl = fetch) {
  const endpoint = AUTH_ENDPOINTS[String(kind || "").toLowerCase()];
  if (!endpoint) {
    const error = new Error("Unsupported desktop authentication request");
    error.status = 404;
    throw error;
  }

  const url = `${API_URL}${endpoint}`;
  const init = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(authPayload(body))
  };

  let response;
  try {
    response = await fetchAuthWithRetry(url, init, fetchImpl);
  } catch (cause) {
    const error = new Error("Vibyra could not contact the account service. Your desktop may still be online; please try again.");
    error.status = 502;
    error.cause = cause;
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || result.message || "Could not sign in to Vibyra.");
    error.status = response.status || 502;
    throw error;
  }

  return result;
}

export async function startDesktopProviderAuth(provider, body, fetchImpl = fetch) {
  const normalized = normalizedProvider(provider);
  return requestProviderJson(
    `${API_URL}/api/auth/desktop/${normalized}/start`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(providerPayload(body))
    },
    fetchImpl
  );
}

export async function pollDesktopProviderAuth(provider, flowId, fetchImpl = fetch) {
  const normalized = normalizedProvider(provider);
  const id = String(flowId || "").trim();
  if (!/^[A-Za-z0-9]{40,100}$/.test(id)) {
    const error = new Error("Invalid desktop sign-in flow");
    error.status = 422;
    throw error;
  }
  return requestProviderJson(
    `${API_URL}/api/auth/desktop/${normalized}/status/${encodeURIComponent(id)}`,
    { method: "GET", headers: { Accept: "application/json" } },
    fetchImpl
  );
}

async function fetchAuthWithRetry(url, init, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(AUTH_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authPayload(body = {}) {
  return {
    email: String(body.email || ""),
    password: String(body.password || ""),
    deviceName: String(body.deviceName || "Vibyra Desktop"),
    installId: String(body.installId || ""),
    ...(body.name ? { name: String(body.name) } : {}),
    ...(body.publicIp ? { publicIp: String(body.publicIp) } : {})
  };
}

function providerPayload(body = {}) {
  return {
    deviceName: String(body.deviceName || "Vibyra Desktop"),
    installId: String(body.installId || ""),
    ...(body.publicIp ? { publicIp: String(body.publicIp) } : {})
  };
}

function normalizedProvider(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (!["apple", "google"].includes(normalized)) {
    const error = new Error("Unsupported desktop sign-in provider");
    error.status = 404;
    throw error;
  }
  return normalized;
}

async function requestProviderJson(url, init, fetchImpl) {
  let response;
  try {
    response = await fetchAuthWithRetry(url, init, fetchImpl);
  } catch (cause) {
    const error = new Error("Vibyra could not contact the account service. Please try again.");
    error.status = 502;
    error.cause = cause;
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || result.message || "Could not sign in to Vibyra.");
    error.status = response.status || 502;
    throw error;
  }
  return result;
}
