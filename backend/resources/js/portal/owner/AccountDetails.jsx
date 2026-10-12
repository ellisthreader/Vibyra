import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { Facts, Empty } from "./OwnerPrimitives.jsx";
import { utc, isGuest } from "./ownerData.js";
import { formatCount } from "./format.js";
import { balanceText, actionLabels } from "./ownerActionProtocol.js";
import OwnerIcon from "./OwnerIcon.jsx";
import AccountActions from "./AccountActions.jsx";

export default function AccountDetails({ accountId, ownerId, access, onClose }) {
  const dialog = useRef(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const [before, setBefore] = useState(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus?.(); };
  }, []);
  useEffect(() => {
    let active = true;
    const generation = access.epoch.current;
    const controller = new AbortController();
    setBusy(true); setError("");
    apiRequest(`/web-api/owner/accounts/${accountId}` + (before ? `?before=${before}` : ""), { signal: controller.signal, headers: { "X-Owner-Account": String(ownerId) } })
      .then(result => {
        if (!active || !access.accept(result, generation)) return;
        if (String(result.account?.id) !== String(accountId)) throw new Error("This account response could not be verified.");
        setProfile(current => before && current ? { ...result, history: [...current.history, ...result.history] } : result);
      }).catch(caught => {
        if (active && caught.name !== "AbortError") { setError(caught.message); access.failure(caught, generation); }
      }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [accountId, ownerId, revision, before, access.accept, access.failure]);
  const account = profile?.account;
  const refresh = () => { setBefore(null); setRevision(value => value + 1); };
  return <dialog className="od-dialog od-account-dialog" ref={dialog} aria-labelledby="account-details-title" onCancel={onClose}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header><div><p className="od-note">Account #{accountId}</p><h2 id="account-details-title">{account ? isGuest(account) ? "Guest account" : account.name || "Unnamed account" : "Account details"}</h2></div>
      <button className="od-icon-button" aria-label="Close account details" onClick={onClose}><OwnerIcon name="close" /></button></header>
    {error && <p className="od-error-text" role="alert">{error} <button className="od-link" onClick={refresh}>Try again</button></p>}
    {!profile ? <Empty title={busy ? "Loading account…" : "Account unavailable"} /> : <>
      <p className="od-account-email">{account.email}</p>
      <div className="od-account-summary"><span className={"od-badge " + (account.owner_banned_at ? "is-banned" : "")}>{account.owner_banned_at ? "Banned" : "Active"}</span>
        <span className="od-badge">{profile.membership.tier}</span><span className="od-note">{account.email_verified_at ? "Email verified" : "Email unverified"}</span></div>
      <div className="od-account-balances">{profile.balances.map(balance => <div key={balance.type}><span>{balance.label}</span>
        <strong>{balanceText(balance.available, balance.scale)}</strong><small>Available{balance.held != null ? ` · ${balanceText(balance.held, balance.scale)} reserved` : ""}</small></div>)}</div>
      {!profile.balances.length && <p className="od-note">This account has not initialized a supported wallet yet.</p>}
      <fieldset className="od-control-fieldset" disabled={busy || !!error}><AccountActions profile={profile} ownerId={ownerId} access={access} onComplete={refresh} /></fieldset>
      <details className="od-details"><summary>Account and login details</summary><Facts rows={[
        ["Joined", utc(account.created_at)], ["Current membership", profile.membership.plan],
        ["Last login", utc(account.last_login_at)], ["Logins · last 30 days", formatCount(account.logins_30d)],
        ["Last recorded session use", utc(account.last_session_used_at)], ["Sessions used · last 5 minutes", formatCount(account.recent_sessions_5m)],
        ...(account.owner_banned_at ? [["Banned since", utc(account.owner_banned_at)]] : []),
      ]} /></details>
      <section className="od-account-history"><h3>Action history</h3><p className="od-note">Internal reasons are visible only to owners.</p>
        {!profile.history.length ? <p className="od-muted">No owner actions recorded.</p> : <ol>{profile.history.map(item => <li key={item.id}>
          <div><strong>{actionLabels[item.action] || item.action}{item.action === "credit" ? ` · ${item.result.amount} ${item.result.balance}` : ""}</strong><time>{utc(item.created_at)}</time></div>
          <p>{item.reason}</p>{item.message && <blockquote>{item.message}</blockquote>}<small>Owner #{item.actor_id ?? "deleted"} · Reference {item.id}</small>
        </li>)}</ol>}
        {profile.history_next && <button className="od-button" disabled={busy} onClick={() => setBefore(profile.history_next)}>Load older actions</button>}
      </section>
    </>}
    <button className="od-button" onClick={onClose}>Done</button>
  </dialog>;
}
