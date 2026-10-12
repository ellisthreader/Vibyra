import React, { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import { Panel, Empty, ErrorMessage, Details, Facts } from "./OwnerPrimitives.jsx";
import { formatCount } from "./format.js";
import AccountDetails from "./AccountDetails.jsx";
import AccountTable from "./AccountTable.jsx";
import LicenseGate from "./LicenseGate.jsx";
import useOwnerAccess from "./useOwnerAccess.js";

export default function OwnerAccounts({ local, report, ownerId }) {
  const [query, setQuery] = useState({ search: "", status: "all", page: 1 });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const access = useOwnerAccess(ownerId);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    if (!access.expiresAt) {
      setData(null); setSelected(null);
      setQuery(current => current.search ? { ...current, search: "", page: 1 } : current);
    }
  }, [access.expiresAt]);
  useEffect(() => {
    if (local) return;
    let active = true;
    const generation = access.epoch.current;
    const controller = new AbortController();
    setBusy(true); setData(null); access.setError("");
    const timer = setTimeout(() => {
      apiRequest("/web-api/owner/accounts?" + new URLSearchParams(query), { signal: controller.signal, headers: { "X-Owner-Account": String(ownerId) } }).then(payload => {
        if (active && access.accept(payload, generation)) setData(payload);
      }).catch(caught => {
        if (active && caught.name !== "AbortError") access.failure(caught, generation);
      }).finally(() => { if (active) setBusy(false); });
    }, 250);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [query, revision, local, ownerId, access.accept, access.failure]);
  const change = (key, value) => { setSelected(null); setQuery(current => ({ ...current, [key]: value, page: 1 })); };
  if (local) return <Panel title="Protected account records"><p>Sign in to the production owner dashboard to view or manage individual accounts.</p></Panel>;
  if (access.challenge) return <LicenseGate challenge={access.challenge} onVerified={refresh} title="Verify to manage users" />;
  return <div className="od-flow">
    {access.error && <ErrorMessage onRetry={refresh}>{access.error} <a href="/owner/login">Sign in</a></ErrorMessage>}
    <Panel title="Account directory" subtitle="Search all accounts · newest first" action={<button className="od-button" disabled={busy} onClick={refresh}>{busy ? "Updating…" : "Refresh"}</button>}>
      <div className="od-account-search"><label>Search users<input type="search" value={query.search} maxLength={120} placeholder="Name, email or account ID"
        onChange={event => change("search", event.target.value)} /></label>
        <label>Status<select value={query.status} onChange={event => change("status", event.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="banned">Banned</option></select></label>
      </div>
      {!data || !access.expiresAt ? <Empty title={busy ? "Searching accounts…" : "Account records unavailable"} /> : <>
        {!data.accounts.length ? <Empty title="No matching accounts">Try a different name, email, ID or status.</Empty> : <AccountTable accounts={data.accounts} onSelect={setSelected} />}
        <div className="od-pagination"><span>{data.total ? "Showing " + ((data.page - 1) * data.per_page + 1) + "–" + Math.min(data.page * data.per_page, data.total) + " of " + data.total : "0 accounts"}</span>
          {data.last_page > 1 && <div><button className="od-button" disabled={busy || data.page <= 1} onClick={() => setQuery(current => ({ ...current, page: data.page - 1 }))}>Previous</button>
            <span>Page {data.page} of {data.last_page}</span><button className="od-button" disabled={busy || data.page >= data.last_page} onClick={() => setQuery(current => ({ ...current, page: data.page + 1 }))}>Next</button></div>}
        </div>
      </>}
    </Panel>
    <p className="od-note">Open an account to view balances, manage access, give credits or record a warning. Every action is recorded. Last recorded use does not mean the person is online.</p>
    <Details title="Account totals and recent use"><Facts rows={[
      ["All accounts · registered and guest", formatCount(report?.overview?.accounts?.total)],
      ["Accounts used · last 24 hours", formatCount(report?.overview?.operations?.accounts_used_24h)],
      ["Accounts used · last 7 days", formatCount(report?.overview?.operations?.accounts_used_7d)],
      ["Accounts used · last 30 days", formatCount(report?.overview?.accounts?.active_30d)],
    ]} /></Details>
    {selected && access.expiresAt && <AccountDetails key={selected} accountId={selected} ownerId={ownerId} access={access} onClose={() => { setSelected(null); refresh(); }} />}
  </div>;
}
