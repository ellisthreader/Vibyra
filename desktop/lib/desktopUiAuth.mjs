import { send } from "./http.mjs";

export function authorizeDesktopUi(req, res, json = true) {
  if (isLoopbackRequest(req)) return true;
  if (json) send(res, 403, { ok: false, error: "Desktop controls are only available on this computer" });
  else send(res, 403, "Desktop controls are only available on this computer");
  return false;
}

function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
