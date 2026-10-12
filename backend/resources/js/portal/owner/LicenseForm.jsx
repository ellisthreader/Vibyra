import React, { useState } from "react";

const dateInput = date => date.toISOString().slice(0, 16);
export default function LicenseForm({ busy, locked = false, onCreate }) {
  const disabled = busy || locked;
  const [fields, setFields] = useState({
    label: "", beta_welcome: true, tokens: 300, allowance: "monthly",
    duration_months: 1, claim_by: dateInput(new Date(Date.now() + 30 * 86400000)), fixed_ends_at: "",
  });
  const [fixed, setFixed] = useState(false);
  const [review, setReview] = useState(false);
  const update = event => {
    setReview(false);
    setFields({ ...fields, [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
  };
  const submit = event => {
    event.preventDefault();
    if (!review) { setReview(true); return; }
    onCreate({
      beta_welcome: fields.beta_welcome, label: fields.label,
      tokens: Number(fields.tokens), allowance: fields.allowance,
      duration_months: fixed ? null : Number(fields.duration_months),
      fixed_ends_at: fixed ? fields.fixed_ends_at + ":00Z" : null,
      claim_by: fields.claim_by + ":00Z",
    });
  };
  return <form className="portal-form license-form" onSubmit={submit}>
    <div className="od-license-fields">
      <label>License label
        <input name="label" placeholder="e.g. Early supporter" value={fields.label} onChange={update} maxLength={120} required disabled={disabled} />
      </label>
      <fieldset><legend>Pro access</legend>
        <label>When does access end?
          <select value={fixed ? "fixed" : "duration"} disabled={disabled} onChange={event => { setFixed(event.target.value === "fixed"); setReview(false); }}>
            <option value="duration">After a number of months</option><option value="fixed">On a fixed date</option>
          </select>
        </label>
        {fixed ? <label>Pro ends · UTC
          <input name="fixed_ends_at" type="datetime-local" value={fields.fixed_ends_at} onChange={update} required disabled={disabled} />
        </label> : <label>Months of Pro after redemption
          <input name="duration_months" type="number" min="1" max="36" step="1" value={fields.duration_months} onChange={update} required disabled={disabled} />
        </label>}
      </fieldset>
      <fieldset><legend>Token allowance</legend>
        <div className="license-form__pair">
          <label>Tokens<input name="tokens" type="number" min="0" max="10000" step="1" value={fields.tokens} onChange={update} required disabled={disabled} /></label>
          <label>Frequency<select name="allowance" value={fields.allowance} onChange={update} disabled={disabled}><option value="monthly">Every month</option><option value="once">One time</option></select></label>
        </div>
      </fieldset>
      <label>Redeem by · UTC
        <input name="claim_by" type="datetime-local" value={fields.claim_by} onChange={update} required disabled={disabled} />
        <small className="od-muted">The key must be claimed before this deadline.</small>
      </label>
      <label className="license-beta"><input type="checkbox" name="beta_welcome" checked={fields.beta_welcome} onChange={update} disabled={disabled} />Include the beta-tester welcome</label>
    </div>
    <aside className="od-license-summary">
      <h3>{review ? "Confirm this license" : "What they’ll receive"}</h3>
      <p><strong>{fields.label || "One recipient"}</strong></p>
      <p>{fixed ? "Pro until " + (fields.fixed_ends_at ? fields.fixed_ends_at.replace("T", " ") + " UTC" : "your selected date")
        : fields.duration_months + " month(s) of Pro, starting when redeemed."}</p>
      <p><strong>{fields.tokens || 0} tokens</strong> {fields.allowance === "monthly" ? "each month, without rollover." : "once."}</p>
      <p>Unspent license tokens expire. There is no recurring payment.</p>
      <p>{fields.beta_welcome ? "Includes the beta-tester welcome." : "No beta-tester welcome."}</p>
      <p className="od-note">Redeem by {fields.claim_by.replace("T", " ")} UTC.</p>
      {review && <p role="status">Review complete. Create the key when these terms are correct.</p>}
      <button className="portal-button portal-button--primary" disabled={disabled}>{busy ? "Creating…" : locked ? "Awaiting confirmation" : review ? "Create license key" : "Review license"}</button>
    </aside>
  </form>;
}
