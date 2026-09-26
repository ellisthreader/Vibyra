import React, { useState } from "react";
import { apiRequest } from "../api.js";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function OwnerTwoFactorSetup({ onComplete }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  const verifyWithGoogle = async () => {
    const popup = window.open("", "vibyra-owner-verification", "popup,width=540,height=720");
    if (!popup) { setError("Allow the Google sign-in window and try again."); return; }
    setBusy(true);
    setError("");
    setStatus("Opening the Google account check…");
    try {
      const flow = await apiRequest("/web-api/owner/2fa/provider/start", { body: { provider: "google" } });
      if (!flow.authUrl || !flow.flowId) throw new Error("Google verification could not start.");
      popup.location.assign(flow.authUrl);
      setStatus("Complete the Google account check in the window that opened.");
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await wait(1500);
        const result = await apiRequest(`/web-api/owner/2fa/provider/status/${encodeURIComponent(flow.flowId)}`);
        if (result.status === "complete") {
          if (!result.enrollmentProof) throw new Error("Google verification did not return a setup proof.");
          popup.close();
          const next = await apiRequest("/web-api/owner/2fa/start", {
            body: { enrollmentProof: result.enrollmentProof },
          });
          setSetup(next);
          setStatus("");
          return;
        }
        if (["denied", "failed", "expired"].includes(result.status)) {
          throw new Error(result.error || "Google verification did not finish. Try again.");
        }
        if (popup.closed) throw new Error("Google account check was cancelled. Try again.");
      }
      throw new Error("Google verification timed out. Try again.");
    } catch (caught) {
      popup.close();
      setStatus("");
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest("/web-api/owner/2fa/confirm", { body: { code } });
      setCode("");
      setSetup(null);
      setRecoveryCodes(result.recoveryCodes);
    } catch (caught) {
      setError(caught.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return <section className="owner-panel owner-accounts-gate owner-setup">
    <p className="owner-kicker">Protect account records</p>
    <h2>Set up your authenticator</h2>
    {!setup && !recoveryCodes && <>
      <p>Check the Google account linked to Vibyra, then add a Vibyra authenticator code. Google may reuse an existing sign-in. A separate authenticator code is required each time you open owner account records.</p>
      <button type="button" disabled={busy} onClick={verifyWithGoogle}>{busy ? "Checking…" : "Check Google account"}</button>
      {status && <p role="status">{status}</p>}
    </>}
    {setup && <>
      <p>In your authenticator app, add an account manually using this key for {setup.account}. Then enter the current six-digit code.</p>
      <div className="owner-setup__secret"><span>Authenticator key</span><code>{setup.secret}</code></div>
      <form onSubmit={confirm}><label>Six-digit code<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus /></label>
        <button type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Enable protection"}</button></form>
    </>}
    {recoveryCodes && <>
      <p>Save these recovery codes now. Each code works once and they will not be shown again.</p>
      <div className="owner-setup__codes">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div>
      <button type="button" onClick={onComplete}>I saved my codes · continue to verification</button>
    </>}
    {error && <p className="owner-accounts-error" role="alert">{error}</p>}
  </section>;
}
