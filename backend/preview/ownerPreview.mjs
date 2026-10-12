import { ownerAccountPreview, resetOwnerAccountPreview } from "./ownerAccountPreview.mjs";
import http from "node:http";
import { reviewPage } from "./reviewPage.mjs";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { fixtureReport, fixtureAccounts, fixtureLicenses } from "./ownerFixtures.mjs";

const root = path.resolve(import.meta.dirname, "..");
const vite = await createServer({ configFile: false, root, server: { middlewareMode: true, hmr: false, host: "127.0.0.1" }, appType: "custom" });
let verified = false;
const created = new Map();
const rows = structuredClone(fixtureLicenses);
const scenarios = ["normal", "empty", "unavailable", "sparse", "stale", "error", "denied", "verify", "setup", "uncertain", "expire"];
const json = (response, value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
async function api(request, response, url, scenario) {
  if (url.pathname === "/web-api/session") return json(response, { user: request.headers.cookie?.includes("owner-preview-login=1") ? null : { id: "preview-owner", name: "Ellis", email: "owner@example.test" } });
  if (url.pathname === "/web-api/auth/providers") return json(response, { providers: { google: false, apple: false } });
  if (url.pathname === "/web-api/owner/analytics") {
    if (["error", "denied"].includes(scenario)) return json(response, { ok: false, error: "Preview response: " + scenario }, scenario === "error" ? 503 : 403);
    return json(response, fixtureReport(Number(url.searchParams.get("days")), scenario));
  }
  if (url.pathname === "/web-api/owner/verify-2fa") {
    verified = true; resetOwnerAccountPreview();
    return json(response, { ok: true, expires_at: new Date(Date.now() + 600000).toISOString() });
  }
  if (["verify", "setup"].includes(scenario) && !verified) return json(response, { ok: false, enabled: scenario !== "setup", provider: "email", error: "owner_two_factor_required" }, 428);
  if (await ownerAccountPreview(request, response, url, scenario)) return;
  if (url.pathname === "/web-api/owner/licenses" && request.method === "GET") {
    const search = url.searchParams.get("search")?.toLowerCase() || "";
    return json(response, { ok: true, enabled: true, ownerAccessExpiresAt: Date.now() + 600000, lastPage: 1, licenses: scenario === "empty" ? [] : rows.filter(row => row.label.toLowerCase().includes(search) || row.redeemed_email?.includes(search)) });
  }
  if (url.pathname === "/web-api/owner/licenses" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    const old = created.get(input.request_id);
    if (old) return json(response, { ok: true, id: old, key: null, ownerAccessExpiresAt: Date.now() + 600000 });
    const id = "demo-" + (created.size + 1);
    created.set(input.request_id, id);
    rows.unshift({ ...input, id, key_suffix: "DEMO", redeemed_at: null, revoked_at: null, ends_at: null });
    if (scenario === "uncertain") return json(response, { ok: false, error: "Simulated lost response. The demo license was created." }, 502);
    return json(response, { ok: true, id, key: "DEMO-ONLY-NOT-A-REAL-KEY", ownerAccessExpiresAt: Date.now() + 600000 });
  }
  if (url.pathname.endsWith("/revoke")) {
    const row = rows.find(row => url.pathname.includes("/" + row.id + "/"));
    if (row) row.revoked_at = new Date().toISOString();
    return json(response, { ok: true });
  }
  return json(response, { ok: false, error: "Unavailable in the design preview." }, 404);
}
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:8137");
    const scenario = /owner-preview=([^;]+)/.exec(request.headers.cookie || "")?.[1] || "normal";
    if (url.pathname === "/review") { response.setHeader("Content-Type", "text/html"); return response.end(reviewPage(url)); }
    if (url.pathname.startsWith("/web-api/")) return await api(request, response, url, scenario);
    if (url.pathname === "/vibyra-cobalt.png") {
      response.setHeader("Content-Type", "image/png");
      return fs.createReadStream(path.join(root, "public/vibyra-cobalt.png")).pipe(response);
    }
    if (url.pathname === "/owner" || url.pathname === "/owner/login") {
      const selected = scenarios.includes(url.searchParams.get("scenario")) ? url.searchParams.get("scenario") : scenario;
      verified = false; resetOwnerAccountPreview();
      response.setHeader("Set-Cookie", ["owner-preview=" + selected + "; Path=/; SameSite=Strict", "owner-preview-login=" + (url.pathname.endsWith("/login") ? "1" : "0") + "; Path=/; SameSite=Strict"]);
      const banner = '<div class="preview-banner" style="font:12px system-ui;background:#eaf0ff;color:#2449b8;padding:8px 20px;display:flex;align-items:center;gap:12px">Design preview · synthetic data only <select aria-label="Preview scenario" onchange="location.href=\'/owner?scenario=\'+this.value">' + scenarios.map(item => '<option ' + (item === selected ? "selected" : "") + '>' + item + '</option>').join("") + '</select><a href="/owner/login">Owner login preview</a></div>';
      const previewStyle = '<style>@media(min-width:801px){body:has(.preview-banner) .od-sidebar{top:38px}}.preview-banner{position:relative;z-index:100}</style>';
      const html = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="preview-only"><title>Owner dashboard preview</title>' + previewStyle + '</head><body>' + (url.searchParams.has("embed") ? "" : banner) + '<div id="portal-root"></div><script type="module" src="/preview/owner-entry.jsx"></script></body></html>';
      response.setHeader("Content-Type", "text/html");
      return response.end(await vite.transformIndexHtml(url.pathname, html));
    }
    vite.middlewares(request, response, () => { response.writeHead(404); response.end(); });
  } catch (error) { json(response, { error: String(error.message) }, 500); }
}).listen(8137, "127.0.0.1", () => console.log("Owner preview: http://127.0.0.1:8137/owner"));
