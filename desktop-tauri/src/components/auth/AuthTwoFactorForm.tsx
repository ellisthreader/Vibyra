import { useEffect, useRef, useState } from "react";

import { useAccountStore } from "../../state/accountStore";

/** The second half of a password login. The challenge itself is held in
 * native code; this only asks for the code, and takes a recovery code in
 * the same field because that is what a person reaches for when their
 * phone is the thing they have lost. */
export function AuthTwoFactorForm({ busy, error }: { busy: boolean; error: string | null }) {
  const [code, setCode] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !code.trim()) return;
    void useAccountStore.getState().submitTwoFactor(code);
  };

  return (
    <form className="auth-email" onSubmit={submit} noValidate>
      <p className="auth-email__lead">
        Enter the code from your authenticator app, or one of your recovery codes.
      </p>
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
        {error && <span className="auth-email__error">{error}</span>}
      </div>
      <button className="auth-submit" type="submit" disabled={busy || !code.trim()}>
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
