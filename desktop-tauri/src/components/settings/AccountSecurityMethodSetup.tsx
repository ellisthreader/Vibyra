import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { twoFactorMethodStart, twoFactorMethodConfirm, twoFactorMethodResend, twoFactorSendCode, type SecurityMethod, type SecurityEnrollment } from "../../ipc/accountSecurity";
import type { TwoFactorState } from "../../types";
import { RecoveryCodes } from "./AccountRecoveryCodes";

export const securityMethodNames = { totp: "Authenticator", sms: "Text message", email: "Email code" };

/** The active method keeps protecting sign-in until the replacement code succeeds. */
export function AccountSecurityMethodSetup({ state, onDone }: { state: TwoFactorState; onDone: (changed: boolean) => void }) {
  const [method, setMethod] = useState<SecurityMethod>(state.method ?? "totp");
  const [phone, setPhone] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<SecurityEnrollment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  if (codes) return <div className="two-factor"><RecoveryCodes codes={codes} onDone={() => onDone(true)} /></div>;
  return <div className="two-factor">
    {!setup ? <>
      <label>Verification method
        <select className="input" aria-label="Verification method" value={method} disabled={busy} onChange={(e) => setMethod(e.target.value as SecurityMethod)}>
          <option value="totp">Authenticator</option>
          <option value="sms" disabled={!state.smsAvailable}>Text message{!state.smsAvailable ? " — unavailable" : ""}</option>
          <option value="email" disabled={!state.emailAvailable}>Email code{!state.emailAvailable ? " — verify email first" : ""}</option>
        </select>
      </label>
      <p className="two-factor__lead">{method === "totp" ? "Use an authenticator app for your security codes." : method === "sms" ? "Receive a security code by text message." : "Receive a security code at your verified account email."}</p>
      {method === "sms" && <input className="input" type="tel" autoComplete="tel" aria-label="Phone number with country code" placeholder="Phone number, including +44" value={phone} disabled={busy} onChange={(e) => setPhone(e.target.value)} />}
      {state.enabled && <>
        <p className="two-factor__lead">Enter your current security code or a recovery code to change methods. Your current method stays on until setup is complete.</p>
        {state.method && state.method !== "totp" && <button className="btn" disabled={busy} onClick={() => void run(async () => { await twoFactorSendCode(); setSent(true); })}>{sent ? "Resend current code" : "Send current code"}</button>}
        {sent && <p role="status">Code sent. Wait a minute before requesting another.</p>}
        <input className="input" autoComplete="one-time-code" aria-label="Current security code" placeholder="Current security or recovery code" value={currentCode} disabled={busy} onChange={(e) => setCurrentCode(e.target.value)} />
      </>}
      <div className="two-factor__confirm">
        <button className="btn" disabled={busy} onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--primary" disabled={busy || (state.enabled && !currentCode.trim()) || (method === "sms" && !phone.trim())} onClick={() => void run(async () => setSetup(await twoFactorMethodStart(method, phone, currentCode)))}>{busy ? "Starting…" : "Continue"}</button>
      </div>
    </> : <>
      {setup.uri && setup.secret ? <div className="two-factor__pair">
        <div className="two-factor__qr"><QRCodeSVG value={setup.uri} size={132} marginSize={2} /></div>
        <div className="two-factor__steps"><p>Scan with your authenticator app, or enter this key.</p><code className="two-factor__secret">{setup.secret}</code><p>{setup.account}</p></div>
      </div> : <p className="two-factor__lead">Enter the code sent to {setup.account}. It expires in five minutes.</p>}
      {setup.method !== "totp" && <button className="btn" disabled={busy} onClick={() => void run(async () => { await twoFactorMethodResend(setup.enrollmentId); setSent(true); })}>Resend setup code</button>}
      {sent && setup.method !== "totp" && <p role="status">Code sent. Wait a minute before requesting another.</p>}
      <div className="two-factor__confirm">
        <input className="input" autoComplete="one-time-code" inputMode="numeric" aria-label="New verification code" placeholder="6-digit code" value={code} disabled={busy} onChange={(e) => setCode(e.target.value)} />
        <button className="btn" disabled={busy} onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--primary" disabled={busy || !code.trim()} onClick={() => void run(async () => setCodes(await twoFactorMethodConfirm(setup.enrollmentId, code)))}>{busy ? "Checking…" : "Confirm method"}</button>
      </div>
    </>}
    {error && <p className="profile-feedback profile-feedback--error" role="alert">{error}</p>}
  </div>;
}
