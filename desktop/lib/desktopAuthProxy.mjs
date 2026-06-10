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
