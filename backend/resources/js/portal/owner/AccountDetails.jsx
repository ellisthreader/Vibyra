import React, { useEffect, useRef } from "react";
import { Facts } from "./OwnerPrimitives.jsx";
import { utc, isGuest } from "./ownerData.js";
import { formatCount } from "./format.js";
import OwnerIcon from "./OwnerIcon.jsx";

export default function AccountDetails({ account, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus?.(); };
  }, []);
  return <dialog className="od-dialog" ref={dialog} aria-labelledby="account-details-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header><div><p className="od-note">Account details</p><h2 id="account-details-title">{isGuest(account) ? "Guest account" : account.name || "Unnamed account"}</h2></div>
      <button className="od-icon-button" aria-label="Close account details" onClick={onClose}><OwnerIcon name="close" /></button></header>
    <p className="od-account-email">{account.email}</p>
    <Facts rows={[
      ["Plan", account.plan || "Unknown"],
      ["Email", account.email_verified_at ? "Verified" : "Unverified"],
      ["Joined", utc(account.created_at)],
      ["Last login", utc(account.last_login_at)],
      ["Logins · last 30 days", formatCount(account.logins_30d)],
      ["Last recorded session use", utc(account.last_session_used_at)],
      ["Sessions used · last 5 minutes", formatCount(account.recent_sessions_5m)],
    ]} />
    <p className="od-note">Recorded session use does not establish that a person is currently online.</p>
    <button className="od-button" onClick={onClose}>Done</button>
  </dialog>;
}
