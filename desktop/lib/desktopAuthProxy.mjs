import { desktopAppApiUrl } from "./appApiConfig.mjs";

const API_URL = desktopAppApiUrl();
const AUTH_ENDPOINTS = {
  login: "/api/auth/login",
  signup: "/api/auth/signup"
};

export async function requestDesktopAuth(kind, body, fetchImpl = fetch) {
  const endpoint = AUTH_ENDPOINTS[String(kind || "").toLowerCase()];
  if (!endpoint) {
    const error = new Error("Unsupported desktop authentication request");
    error.status = 404;
    throw error;
  }

  let response;
  try {
    response = await fetchImpl(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(authPayload(body))
    });
  } catch {
    const error = new Error("Could not reach Vibyra. Check your internet connection and try again.");
    error.status = 502;
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
