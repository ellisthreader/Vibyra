import { useEffect, useRef, useState } from "react";

import { useAccountStore } from "../../state/accountStore";
import { twoFactorDelivery, type SecurityDelivery } from "../../ipc/accountSecurity";

/** The second half of a password login. The challenge itself is held in
 * native code; this only asks for the code, and takes a recovery code in
 * the same field because that is what a person reaches for when their
 * phone is the thing they have lost. */
export function AuthTwoFactorForm({ busy, error }: { busy: boolean; error: string | null }) {
  const [code, setCode] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const [delivery, setDelivery] = useState<SecurityDelivery | null>(null);
  const [deliveryError, setDeliveryError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => field.current?.focus(), []);
  useEffect(() => {
    let live = true;
    void twoFactorDelivery().then((value) => { if (live) setDelivery(value); }).catch((cause) => { if (live) setDeliveryError(String(cause)); });
    return () => { live = false; };
  }, []);
  const send = async () => {
    setSending(true); setDeliveryError("");
    try { setDelivery(await twoFactorDelivery(true)); } catch (cause) { setDeliveryError(String(cause)); } finally { setSending(false); }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !code.trim()) return;
    void useAccountStore.getState().submitTwoFactor(code);
  };

  return (
    <form className="auth-email" onSubmit={submit} noValidate>
      <p className="auth-email__lead">
        {delivery?.method === "sms" ? `Enter the code sent by text message to ${delivery.destination}.` : delivery?.method === "email" ? `Enter the code sent to ${delivery.destination}.` : "Enter the code from your authenticator app, or one of your recovery codes."}
      </p>
      {delivery && delivery.method !== "totp" && <>
        <button className="auth-link" type="button" disabled={busy || sending} onClick={() => void send()}>{sending ? "Sending…" : delivery.codeSent ? "Resend code" : "Send code"}</button>
        <p className="auth-email__lead">You can also use a recovery code. Wait a minute between sends.</p>
      </>}
      <input
        ref={field}
        className="auth-input"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Code"
        autoComplete="one-time-code"
        aria-label="Two-factor code"
      />
      <div className="auth-email__feedback" role="status" aria-live="polite">
        {(error || deliveryError) && <span className="auth-email__error">{error || deliveryError}</span>}
      </div>
      <button className="auth-submit" type="submit" disabled={busy || sending || !code.trim()}>
        {busy ? "Checking…" : "Continue"}
      </button>
      <button
        type="button"
        className="auth-link"
        disabled={busy}
        onClick={() => void useAccountStore.getState().cancelTwoFactor()}
      >
        Back to log in
      </button>
    </form>
  );
}
