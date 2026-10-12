import { fixtureAccounts } from "./ownerFixtures.mjs";

const accounts = [...fixtureAccounts(1).accounts, ...fixtureAccounts(2).accounts].map((account, index) => ({
  ...account, email: account.email.includes("guests.vibyra.invalid") ? account.email : `sample.person.${account.id}@example.test`,
  owner_action_revision: 0, owner_banned_at: index === 5 ? "2026-10-10T09:00:00Z" : null,
}));
const receipts = new Map();
const balances = new Map(accounts.map(account => [account.id, 1205500]));
const history = new Map();
let expires = 0;
export const resetOwnerAccountPreview = () => { expires = 0; };
const access = scenario => scenario === "expire" ? (expires ||= Date.now() + 20000) : Date.now() + 600000;
const json = (response, data, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify({ ownerAccountId: "preview-owner", ...data })); };
export async function ownerAccountPreview(request, response, url, scenario) {
  if (!url.pathname.startsWith("/web-api/owner/accounts")) return false;
  if (scenario === "denied") { json(response, { ok: false, error: "Owner access denied." }, 403); return true; }
  if (scenario === "expire" && expires && expires <= Date.now()) { json(response, { ok: false, enabled: true, error: "owner_two_factor_required" }, 428); return true; }
  const parts = url.pathname.split("/");
  const account = accounts.find(item => item.id === Number(parts[4]));
  if (parts.length === 4) {
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const status = url.searchParams.get("status") || "all";
    const filtered = scenario === "empty" ? [] : accounts.filter(row => /^\d+$/.test(search) ? String(row.id) === search
      : [row.name, row.email].some(value => value.toLowerCase().includes(search)))
      .filter(row => status === "all" || (status === "banned" ? row.owner_banned_at : !row.owner_banned_at));
    const page = Number(url.searchParams.get("page") || 1);
    json(response, { ok: true, page, per_page: 25, last_page: Math.max(1, Math.ceil(filtered.length / 25)), total: filtered.length,
      accounts: filtered.slice((page - 1) * 25, page * 25), ownerAccessExpiresAt: access(scenario) }); return true;
  }
  if (!account) { json(response, { ok: false, error: "Account not found." }, 404); return true; }
  if (parts.length === 5) {
    const guest = account.email.includes("guests.vibyra.invalid");
    json(response, { ok: true, account, balances: [{ type: "tokens", label: "Tokens", available: String(balances.get(account.id)), held: "40000", scale: 10000 }],
      membership: { tier: account.plan, plan: account.plan },
      capabilities: { protected: false, credit: !account.owner_banned_at && !guest, warn: !account.owner_banned_at && !guest,
        ban: !account.owner_banned_at, unban: !!account.owner_banned_at }, history: history.get(account.id) || [], history_next: null,
      ownerAccessExpiresAt: access(scenario) }); return true;
  }
  if (parts[5] !== "actions") return false;
  let terms = {};
  if (request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    terms = JSON.parse(raw || "{}");
  }
  const id = parts[6] || terms.request_id;
  const old = receipts.get(id);
  if (request.method === "GET") { json(response, { ok: true, receipt: old || null, ownerAccessExpiresAt: access(scenario) }); return true; }
  const cancel = parts[7] === "cancel";
  if (old) {
    if (!cancel && old.action === "cancelled") json(response, { ok: false, error: "This request is cancelled." }, 409);
    else json(response, { ok: true, receipt: old, ownerAccessExpiresAt: access(scenario) });
    return true;
  }
  if (!cancel && terms.revision !== account.owner_action_revision) {
    json(response, { ok: false, error: "This account changed. Refresh and review again." }, 409); return true;
  }
  if (!cancel) {
    account.owner_action_revision += 1;
    if (terms.action === "ban") account.owner_banned_at = new Date().toISOString();
    if (terms.action === "unban") account.owner_banned_at = null;
    if (terms.action === "credit") balances.set(account.id, balances.get(account.id) + terms.amount * 10000);
  }
  const receipt = { request_id: id, actor_id: "preview-owner", user_id: account.id, action: cancel ? "cancelled" : terms.action,
    revision: account.owner_action_revision, created_at: new Date().toISOString(),
    ...(terms.action === "credit" ? { amount: terms.amount, balance: terms.balance, scale: 10000, units: String(terms.amount * 10000) } : {}),
    ...(terms.action === "warn" ? { visibility: "website_account" } : {}),
    ...(["ban", "unban"].includes(terms.action) ? { status: terms.action === "ban" ? "banned" : "active" } : {}) };
  receipts.set(id, receipt);
  history.set(account.id, [{ id, sequence: receipts.size, actor_id: "preview-owner", action: receipt.action,
    reason: cancel ? "Unconfirmed request cancelled." : terms.reason, message: terms.message || null, result: receipt, created_at: receipt.created_at }, ...(history.get(account.id) || [])]);
  if (scenario === "uncertain" && !cancel) json(response, { ok: false, error: "Simulated lost response. Check the action status." }, 502);
  else json(response, { ok: true, receipt, ownerAccessExpiresAt: access(scenario) });
  return true;
}
