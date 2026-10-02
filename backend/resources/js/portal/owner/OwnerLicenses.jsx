import React, { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import LicenseForm from "./LicenseForm.jsx";
import LicenseGate from "./LicenseGate.jsx";
import "../../../css/portal/licenses.css";

const date = value => value ? `${new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "—";
const status = row => row.revoked_at ? "Revoked" : row.redeemed_at
  ? Date.parse(row.ends_at.replace(" ", "T") + "Z") <= Date.now() ? "Expired" : "Active"
  : Date.parse(row.claim_by.replace(" ", "T") + "Z") <= Date.now() ? "Unclaimed · expired" : "Ready to claim";

export default function OwnerLicenses({ local = false }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState("");
  const [data, setData] = useState(null), [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false), [issued, setIssued] = useState(null);
  const [revision, setRevision] = useState(0), [revoke, setRevoke] = useState(null);
  const [creation, setCreation] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const refresh = () => setRevision(n => n + 1);
  const failure = caught => {
    if ([401, 403, 419, 428].includes(caught.status)) {
      setData(null); setIssued(null); setRevoke(null); setExpiresAt(null);
      setChallenge(caught.status === 428 ? caught.payload : null);
    }
    if (caught.status !== 428) setError(caught.message);

  };
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => {
      setIssued(null); setData(null); setRevoke(null);
      setChallenge({ enabled: true }); setExpiresAt(null);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const authorize = result => {
    if (!Number.isFinite(result.ownerAccessExpiresAt) || result.ownerAccessExpiresAt <= Date.now()) {
      failure({ status: 428, payload: { enabled: true } }); return false;
    }
    setExpiresAt(result.ownerAccessExpiresAt); return true;
  };
  useEffect(() => {
    if (local) return;
    let active = true;
    const timer = setTimeout(() => {
      apiRequest(`/web-api/owner/licenses?page=${page}&search=${encodeURIComponent(search)}`)
        .then(result => { if (active && authorize(result)) { setData(result); setChallenge(null); } })
        .catch(caught => { if (active) failure(caught); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [page, search, revision, local]);
  const create = async terms => {
    // Retain the exact request across uncertain network outcomes and gate expiry.
    const request = creation ?? { ...terms, request_id: crypto.randomUUID() };
    setCreation(request); setBusy(true); setError("");
    try {
      const result = await apiRequest("/web-api/owner/licenses", { body: request });
      if (!authorize(result)) return;
      setIssued(result); setCreation(null); setShowForm(false); refresh();
    } catch (caught) { failure(caught); if (caught.status === 422 || caught.status === 503) setCreation(null); }
    finally { setBusy(false); }
  };
  const confirmRevoke = async () => {
    setBusy(true); setError("");
    try { await apiRequest(`/web-api/owner/licenses/${revoke.id}/revoke`, { body: {} }); setRevoke(null); refresh(); }
    catch (caught) { failure(caught); }
    finally { setBusy(false); }
  };
  if (local) return <section className="owner-panel"><h2>Production owner access required</h2><p>Sign in to the protected owner dashboard to manage licenses.</p></section>;
  if (challenge) return <LicenseGate challenge={challenge} onVerified={refresh} />;
  return <div className="owner-flow owner-licenses">
    {error && <p role="alert">{error}</p>}
    <section className="owner-panel"><div className="owner-panel__heading"><h2>Pro licenses</h2>
      <button className="portal-button" disabled={!data?.enabled || busy} onClick={() => setShowForm(!showForm)}>{showForm ? "Close" : "Create license"}</button></div>
      {data && !data.enabled && <p>New licenses and redemption are currently disabled. Existing licenses can still be revoked.</p>}
      {showForm && <LicenseForm busy={busy || !!creation} onCreate={create} />}
      {creation && <p role="status">The creation result is unconfirmed. <button className="portal-link-button" disabled={busy} onClick={() => create(creation)}>Check same request</button></p>}
      {issued && <div className="license-issued"><h3>{issued.key ? "Save this key now" : "License already created"}</h3>
        {issued.key ? <><p>This is the only time the full key is shown. Anyone holding it can claim it.</p><code>{issued.key}</code>
          <button className="portal-button" onClick={() => navigator.clipboard.writeText(issued.key).catch(() => setError("Copy failed. Select the key and copy it manually."))}>Copy key</button></>
          : <p>The key cannot be shown again. Revoke license {issued.id} and create a replacement if you did not receive it.</p>}
        <button className="portal-link-button" onClick={() => setIssued(null)}>Dismiss</button></div>}
    </section>
    <section className="owner-panel"><label className="license-search">Search licenses<input value={search} maxLength={120} placeholder="Label or redeemed email" onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      {!data && <p role="status">Loading licenses…</p>}
      <div className="license-table"><table><thead><tr><th>License</th><th>Allowance</th><th>Validity</th><th>Status / account</th><th>Actions</th></tr></thead>
        <tbody>{data?.licenses.map(row => <tr key={row.id}><td><strong>{row.label}</strong><small>•••• {row.key_suffix}</small></td>
          <td>{row.tokens.toLocaleString()} tokens<small>{row.allowance === "monthly" ? "Every month" : "One time"}</small></td>
          <td>{row.ends_at || row.fixed_ends_at ? `Ends ${date(row.ends_at || row.fixed_ends_at)}` : `${row.duration_months} month(s) after redemption`}<small>Claim before {date(row.claim_by)}</small></td>
          <td>{status(row)}<small>{row.redeemed_email || "Unclaimed"}</small></td>
          <td>{!row.revoked_at && <button className="portal-link-button" disabled={busy} onClick={() => setRevoke(row)}>Revoke</button>}</td></tr>)}</tbody></table></div>
      {data?.licenses.length === 0 && <p>No licenses found.</p>}
      {data && <div className="license-pages"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {data.lastPage}</span><button disabled={page >= data.lastPage} onClick={() => setPage(page + 1)}>Next</button></div>}
    </section>
    {revoke && <section className="owner-panel license-review" role="alert"><h3>Revoke {revoke.label}?</h3><p>This stops its Pro benefits and removes its unspent license tokens. Purchased tokens and subscriptions are preserved.</p>
      <button className="portal-button" disabled={busy} onClick={confirmRevoke}>Revoke license</button> <button className="portal-link-button" disabled={busy} onClick={() => setRevoke(null)}>Keep license</button></section>}
  </div>;
}
