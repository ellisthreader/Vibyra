import React, { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import OwnerTwoFactorSetup from "./OwnerTwoFactorSetup.jsx";

const date = (value) => value ? new Date(value).toLocaleString("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
}) + " UTC" : "—";

export default function OwnerAccounts({ local }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (local) return;
    let active = true;
    setBusy(true);
    setError("");
    apiRequest(`/web-api/owner/accounts?page=${page}`).then((payload) => {
      if (active) { setData(payload); setChallenge(null); }
    }).catch((caught) => {
      if (!active) return;
      if (caught.status === 428) setChallenge(caught.payload);
      else setError(caught.message);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, revision, local]);

  const verify = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/web-api/owner/verify-2fa", { body: { code } });
      setCode("");
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(caught.message);
      setCode("");
      setBusy(false);
    }
  };

  if (local) return <section className="owner-state" role="status"><strong>Production owner access only</strong>
    <p>This local one-click account shows aggregate production snapshots. Names, email addresses and login records stay on the protected production service.</p></section>;
  if (challenge && !challenge.enabled && challenge.provider === "google")
    return <OwnerTwoFactorSetup onComplete={() => setRevision((value) => value + 1)} />;
  if (challenge) return <section className="owner-panel owner-accounts-gate">
    <p className="owner-kicker">Extra protection</p><h2>Verify before opening account records</h2>
    {challenge.enabled ? <p>Enter a current authenticator code or a recovery code. Access lasts 10 minutes.</p>
      : <p>Enable two-factor authentication in Vibyra iOS or Desktop Account settings, then return here. Owner account records require a separate authenticator code.</p>}
    {challenge.enabled && <>
      <form onSubmit={verify}><label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)}
        autoComplete="one-time-code" inputMode="text" maxLength={20} required autoFocus /></label>
        <button type="submit" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Open account records"}</button></form></>}
    {error && <p className="owner-accounts-error" role="alert">{error}</p>}
  </section>;

  return <div className="owner-flow"><section className="owner-panel owner-accounts">
    <div className="owner-panel__heading"><div><p className="owner-kicker">Operational account data</p>
      <h2>Accounts &amp; sessions</h2></div><span>{data ? `${data.total} accounts` : ""}</span></div>
    <p className="owner-footnote">Login counts come from successful authentication records. Last session use means an authenticated token was used; it does not prove the person is online.</p>
    {error && <p className="owner-accounts-error" role="alert">{error}</p>}
    {busy && !data ? <p className="owner-empty">Loading account records…</p> : null}
    {data && <><div className="owner-accounts-scroll"><table><thead><tr>
      <th scope="col">Account</th><th scope="col">Plan</th><th scope="col">Created</th>
      <th scope="col">Last login</th><th scope="col">Logins · 30d</th>
      <th scope="col">Last session use</th><th scope="col">Used in last 5m</th>
    </tr></thead><tbody>{data.accounts.map((account) => <tr key={account.id}>
      <td><strong>{account.name || "Unnamed account"}</strong><small>{account.email}</small>
        <small>{account.email_verified_at ? "Verified email" : "Email unverified"}</small></td>
      <td>{account.plan || "—"}</td><td>{date(account.created_at)}</td>
      <td>{date(account.last_login_at)}</td><td>{account.logins_30d ?? "—"}</td>
      <td>{date(account.last_session_used_at)}</td><td>{account.recent_sessions_5m}</td>
    </tr>)}</tbody></table></div>
      {!data.accounts.length && <p className="owner-empty">No account records on this page.</p>}
      <div className="owner-accounts-pages"><span>Page {data.page} of {data.last_page}</span>
        <div><button type="button" onClick={() => setPage((value) => value - 1)} disabled={busy || page <= 1}>Previous</button>
          <button type="button" onClick={() => setPage((value) => value + 1)} disabled={busy || page >= data.last_page}>Next</button></div>
      </div></>}
  </section></div>;
}
