import { send } from "./http.mjs";
import { PORT } from "./state.mjs";

export function authorizeDesktopUi(req, res, json = true) {
  if (isLoopbackRequest(req) && isTrustedDesktopOrigin(req)) return true;
  if (json) send(res, 403, { ok: false, error: "Desktop controls are only available on this computer" });
  else send(res, 403, "Desktop controls are only available on this computer");
  return false;
}

function isTrustedDesktopOrigin(req) {
  const origin = String(req.headers?.origin || "").trim();
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
    return loopback && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === PORT;
  } catch {
    return false;
  }
}

function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
