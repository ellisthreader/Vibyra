import React, { useState } from "react";
import { apiRequest } from "../api.js";
import "../../../css/portal/licenses.css";

export const licenseMessage = status => ({
  pending_verification: "Verify your email to activate your Pro license.",
  unavailable: "Your account is ready, but the license could not be applied. Check the key or contact its issuer.",
  conflict: "Your account is ready. Redeem your key after your current membership or pending checkout ends.",
  disabled: "Your account is ready. License redemption is temporarily unavailable; keep your key and try again later.",
  redeemed: "Your Pro license was applied to this account.",
})[status];

export default function RedeemLicense({ user, onRedeemed }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const redeem = async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await apiRequest("/web-api/account/license", { body: { licenseKey: key, expectedAccountId: user.id } });
      setKey(""); setMessage("Pro activated. Your membership and tokens are ready.");
      await onRedeemed();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <section className="account-panel license-account">
    {user.license && <><h2>Pro license</h2><p>{user.license.tokens.toLocaleString()} tokens{user.license.allowance === "monthly" ? " each month" : " once"} · Ends {new Date(user.license.endsAt).toLocaleDateString("en-GB")}</p>
      {user.license.nextAt && <p>Next allowance {new Date(user.license.nextAt).toLocaleDateString("en-GB")}</p>}<p>No recurring payment.</p></>}
    {licenseMessage(user.licenseRedemptionStatus) && <p role="status">{licenseMessage(user.licenseRedemptionStatus)}</p>}
    <details className="license-disclosure"><summary>Redeem license</summary>
      <form className="portal-form" onSubmit={redeem}>
        <label>License key<input type="password" autoComplete="off" maxLength={100} value={key} disabled={busy}
          onChange={e => setKey(e.target.value)} placeholder="VPRO-…" required /></label>
        <button className="portal-button portal-button--primary" disabled={busy || !key.trim()}>{busy ? "Applying…" : "Activate Pro"}</button>
      </form>
    </details>
    {message && <p role="status">{message}</p>}
  </section>;
}
