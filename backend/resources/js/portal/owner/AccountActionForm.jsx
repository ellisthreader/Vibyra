import React, { useState } from "react";

export default function AccountActionForm({ action, profile, busy, onSubmit, onCancel }) {
  const [revision] = useState(profile.account.owner_action_revision);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(profile.balances[0]?.type || "");
  const [review, setReview] = useState(false);
  const account = profile.account;
  const label = profile.balances.find(item => item.type === balance)?.label || "credits";
  const titles = { credit: "Give credits", warn: "Record a warning", ban: "Ban this account", unban: "Remove this ban" };
  const impact = {
    credit: `Adds ${amount || "the entered amount"} ${label.toLowerCase()} to this account. This does not change its membership.`,
    warn: "This message will appear in the user’s website account. No email or push notification is sent.",
    ban: "Blocks new sign-ins and authenticated Vibyra service access, revokes sessions, and stops managed access through normal shutdown. Subscriptions and account data are preserved. Offline local software is unaffected.",
    unban: "Restores sign-in and service access. The user must sign in again; revoked sessions stay revoked.",
  };
  const terms = { action, revision, reason: reason.trim(),
    ...(action === "credit" ? { amount: Number(amount), balance } : {}), ...(action === "warn" ? { message: message.trim() } : {}) };
  const submit = event => { event.preventDefault(); if (review) onSubmit(terms); else setReview(true); };
  return <form className="od-account-action" onSubmit={submit}>
    <h3>{review ? "Review: " : ""}{titles[action]}</h3>
    <p><strong>{account.name || "Account"}</strong> · {account.email} · #{account.id}</p>
    <p className={action === "ban" ? "od-caution" : "od-note"}>{impact[action]}</p>
    {!review ? <fieldset disabled={busy}>
      {action === "credit" && <div className="od-form-two"><label>Balance<select value={balance} onChange={event => setBalance(event.target.value)}>
        {profile.balances.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}
      </select></label><label>Amount<input type="number" min="1" max="10000" step="1" value={amount} onChange={event => setAmount(event.target.value)} required /></label></div>}
      {action === "warn" && <label>Warning shown to the user<textarea rows="4" minLength={3} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} required /></label>}
      <label>Internal reason<textarea rows="2" minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} required /></label>
      <small>Only owners can see the internal reason. It is saved in the action history.</small>
    </fieldset> : <div className="od-action-review">
      {action === "warn" && <p><strong>User warning</strong><span>{message}</span></p>}
      <p><strong>Internal reason</strong><span>{reason}</span></p>
    </div>}
    <div className="od-actions"><button className={"od-button " + (action === "ban" ? "od-danger" : "od-primary")} disabled={busy}>
      {busy ? "Applying…" : review ? "Confirm " + titles[action].toLowerCase() : "Review action"}
    </button><button type="button" className="od-button" disabled={busy} onClick={review ? () => setReview(false) : onCancel}>{review ? "Back" : "Cancel"}</button></div>
  </form>;
}
