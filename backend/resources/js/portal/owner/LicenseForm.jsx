import React, { useState } from "react";

const dateInput = date => date.toISOString().slice(0, 16);
export default function LicenseForm({ busy, onCreate }) {
  const [fields, setFields] = useState({ label: "", beta_welcome: true, tokens: 300, allowance: "monthly", duration_months: 1,
    claim_by: dateInput(new Date(Date.now() + 30 * 86400000)), fixed_ends_at: "" });
  const [fixed, setFixed] = useState(false);
  const [review, setReview] = useState(false);
  const update = e => { setReview(false); setFields({ ...fields, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); };
  const submit = e => {
    e.preventDefault();
    if (!review) { setReview(true); return; }
    onCreate({ beta_welcome: fields.beta_welcome, label: fields.label, tokens: Number(fields.tokens), allowance: fields.allowance,
      duration_months: fixed ? null : Number(fields.duration_months),
      fixed_ends_at: fixed ? `${fields.fixed_ends_at}:00Z` : null, claim_by: `${fields.claim_by}:00Z` });
  };
  return <form className="portal-form license-form" onSubmit={submit}>
    <label>Internal label<input name="label" value={fields.label} onChange={update} maxLength={120} required disabled={busy} /></label>
    <div className="license-form__pair"><label>Tokens<input name="tokens" type="number" min="0" max="10000" step="1" value={fields.tokens} onChange={update} required disabled={busy} /></label>
      <label>Allowance<select name="allowance" value={fields.allowance} onChange={update} disabled={busy}><option value="monthly">Every month</option><option value="once">One time</option></select></label></div>
    <label>Pro validity<select value={fixed ? "fixed" : "duration"} disabled={busy} onChange={e => { setFixed(e.target.value === "fixed"); setReview(false); }}>
      <option value="duration">Starts when redeemed</option><option value="fixed">Ends on a fixed date</option></select></label>
    {fixed ? <label>Ends at · UTC<input name="fixed_ends_at" type="datetime-local" value={fields.fixed_ends_at} onChange={update} required disabled={busy} /></label>
      : <label>Months of Pro<input name="duration_months" type="number" min="1" max="36" step="1" value={fields.duration_months} onChange={update} required disabled={busy} /></label>}
    <label>Redeem before · UTC<input name="claim_by" type="datetime-local" value={fields.claim_by} onChange={update} required disabled={busy} /></label>
    <label className="license-beta"><input type="checkbox" name="beta_welcome" checked={fields.beta_welcome} onChange={update} disabled={busy} />Welcome this person as a beta tester</label>
    {review && <p className="license-review">One person can claim Pro {fixed ? `until ${fields.fixed_ends_at.replace("T", " ")} UTC` : `for ${fields.duration_months} month(s)`}, with {fields.tokens} tokens {fields.allowance === "monthly" ? "each month, without rollover" : "once"}. Unspent license tokens expire. No recurring payment. {fields.beta_welcome ? "Includes the beta-tester welcome." : "No beta-tester welcome."}</p>}
    <button className="portal-button portal-button--primary" disabled={busy}>{busy ? "Creating…" : review ? "Create license key" : "Review license"}</button>
  </form>;
}
