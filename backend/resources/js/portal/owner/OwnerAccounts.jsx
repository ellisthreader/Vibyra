import React, { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import OwnerTwoFactorSetup from "./OwnerTwoFactorSetup.jsx";
import { Panel, Empty, ErrorMessage, Details, Facts } from "./OwnerPrimitives.jsx";
import { formatCount } from "./format.js";
import { utc, isGuest } from "./ownerData.js";
import AccountDetails from "./AccountDetails.jsx";

export default function OwnerAccounts({ local, report }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    if (local) return;
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    apiRequest("/web-api/owner/accounts?page=" + page, { signal: controller.signal }).then(payload => {
      if (active) { setData(payload); setChallenge(null); }
    }).catch(caught => {
      if (!active) return;
      setData(null);
      setSelected(null);
      if (caught.status === 428) setChallenge(caught.payload);
      else {
        setChallenge(null);
        setError(caught.status === 401 ? "Your session has expired. Sign in again to view accounts."
          : caught.status === 403 ? "This account does not have owner access." : caught.message || "Please try again.");
      }
    }).finally(() => { if (active) setBusy(false); });
    const timer = window.setTimeout(refresh, 60000);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [page, revision, local]);
  useEffect(() => { setSelected(null); }, [page]);

  const verify = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/web-api/owner/verify-2fa", { body: { code } });
      setCode("");
      refresh();
    } catch (caught) {
      setError(caught.message);
      setCode("");
      setBusy(false);
    }
  };
  if (local) return <Panel title="Protected account records"><p>Sign in to the production owner dashboard to view names, email addresses and account details. This preview contains aggregate data only.</p></Panel>;
  if (challenge && !challenge.enabled && ["google", "email"].includes(challenge.provider)) {
    return <OwnerTwoFactorSetup provider={challenge.provider} onComplete={refresh} />;
  }
  if (challenge) return <Panel title="Verify to view account details" className="od-verification">
    <p>{challenge.enabled ? "Enter an authenticator or recovery code. Access lasts 10 minutes." : "Enable two-factor authentication in Vibyra account settings, then return here."}</p>
    {challenge.enabled && <form onSubmit={verify}><label>Verification code
      <input value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" inputMode="text" maxLength={20} required autoFocus />
    </label><button className="od-button od-primary" disabled={busy || !code.trim()}>{busy ? "Checking…" : "View account details"}</button></form>}
    {error && <p className="od-error-text" role="alert">{error}</p>}
  </Panel>;
  return <div className="od-flow">
    {error && <ErrorMessage onRetry={refresh}>{error} <a href="/owner/login">Sign in</a></ErrorMessage>}
    <Panel title="Account directory" subtitle="Newest accounts first · guest accounts are included" action={<button className="od-button" disabled={busy} onClick={refresh}>{busy ? "Updating…" : "Refresh"}</button>}>
      {!data ? <Empty title={error ? "Account records unavailable" : "Loading accounts…"} /> : <>
        {!data.accounts.length ? <Empty title="No accounts on this page" /> :
          <div className="od-table-scroll" role="region" aria-label="Account directory" tabIndex="0">
            <table className="od-users-table"><thead><tr><th>Account</th><th>Plan</th><th>Verification</th><th>Joined</th><th>Last recorded use</th></tr></thead>
              <tbody>{data.accounts.map(account => <tr key={account.id}>
                <td><button className="od-account-button" onClick={() => setSelected(account)}>
                  <span className="od-avatar">{isGuest(account) ? "G" : (account.name || account.email || "?")[0].toUpperCase()}</span>
                  <span><strong>{isGuest(account) ? "Guest account" : account.name || "Unnamed account"}</strong>
                    <small>{isGuest(account) ? "Guest #" + account.id : account.email}</small></span>
                </button></td>
                <td><span className={"od-badge " + (account.plan === "pro" ? "is-pro" : "")}>{account.plan || "Unknown"}</span></td>
                <td><span className="od-verification-label">{account.email_verified_at ? "Verified" : isGuest(account) ? "Guest" : "Unverified"}</span></td>
                <td>{utc(account.created_at, true)}</td><td>{utc(account.last_session_used_at, true)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        <div className="od-pagination"><span>{data.total ? "Showing " + ((data.page - 1) * data.per_page + 1) + "–" + Math.min(data.page * data.per_page, data.total) + " of " + data.total : "0 accounts"}</span>
          {data.last_page > 1 && <div><button className="od-button" disabled={busy || data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button>
            <span>Page {data.page} of {data.last_page}</span><button className="od-button" disabled={busy || data.page >= data.last_page} onClick={() => setPage(data.page + 1)}>Next</button></div>}
        </div>
      </>}
    </Panel>
    <p className="od-note">Last recorded use means an authenticated session was used, not that the person is online. Open an account for its exact times and login records.</p>
    <Details title="Account totals and recent use"><Facts rows={[
      ["All accounts · registered and guest", formatCount(report?.overview?.accounts?.total)],
      ["Accounts used · last 24 hours", formatCount(report?.overview?.operations?.accounts_used_24h)],
      ["Accounts used · last 7 days", formatCount(report?.overview?.operations?.accounts_used_7d)],
      ["Accounts used · last 30 days", formatCount(report?.overview?.accounts?.active_30d)],
    ]} /><p>These fixed windows count authenticated token use. They do not establish that someone is online.</p></Details>
    {selected && <AccountDetails account={selected} onClose={() => setSelected(null)} />}
  </div>;
}
