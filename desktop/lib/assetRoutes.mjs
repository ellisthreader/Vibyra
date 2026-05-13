import { join, normalize, relative } from "node:path";
import { send, sendFile } from "./http.mjs";

export async function sendSafeAsset(res, root, pathname, prefix) {
  const assetPath = decodeURIComponent(pathname.replace(prefix, ""));
  const filePath = join(root, normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, ""));
  const rel = relative(root, filePath);
  if (rel.startsWith("..") || rel === "" || rel.startsWith("/")) {
    send(res, 404, { ok: false, error: "Asset not found" });
    return;
  }
  await sendFile(res, filePath);
}
