import React, { useState } from "react";
import OwnerTwoFactorSetup from "./OwnerTwoFactorSetup.jsx";
import { apiRequest } from "../api.js";

export default function LicenseGate({ challenge, onVerified }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!challenge.enabled && ["email", "google"].includes(challenge.provider))
    return <OwnerTwoFactorSetup provider={challenge.provider} onComplete={onVerified} />;
  const verify = async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { await apiRequest("/web-api/owner/verify-2fa", { body: { code } }); onVerified(); }
    catch (caught) { setError(caught.message); }
    finally { setCode(""); setBusy(false); }
  };
  return <section className="owner-panel"><h2>Verify to manage licenses</h2>
    <p>{challenge.enabled ? "Enter an authenticator or recovery code. Access lasts 10 minutes." : "Enable two-factor authentication in account settings first."}</p>
    {challenge.enabled && <form className="portal-form" onSubmit={verify}><label>Verification code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" maxLength={32} required /></label>
      <button className="portal-button" disabled={busy || !code.trim()}>Verify</button></form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
