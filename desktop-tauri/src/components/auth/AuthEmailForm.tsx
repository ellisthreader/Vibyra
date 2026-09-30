import { useEffect, useRef, useState } from "react";

import { type EmailAuthMode, validateEmailAuth } from "../../lib/accountPolicy";

interface AuthEmailFormProps {
  active: boolean;
  initialMode?: EmailAuthMode;
  busy: boolean;
  serverError: string | null;
  onLogin: (email: string, password: string) => void;
  onSignup: (name: string, email: string, password: string) => void;
  onForgot: (email: string) => Promise<string>;
  onResetError: () => void;
  onRecoveryChange?: (recovering: boolean) => void;
}

export function AuthEmailForm({ active, initialMode = "login", busy, serverError, onLogin, onSignup, onForgot, onResetError, onRecoveryChange }: AuthEmailFormProps) {
  const [mode, setMode] = useState<EmailAuthMode>("login");
  const [recovering, setRecovering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) { setMode(initialMode); setRecovering(false); setLocalError(null); setNotice(null); }
  }, [initialMode, active]);

  useEffect(() => {
    if (active) firstFieldRef.current?.focus();
  }, [active, mode, recovering]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    if (recovering) {
      if (!email.trim()) {
        setLocalError("Enter your email address.");
        return;
      }
      setLocalError(null);
      void onForgot(email.trim()).then(setNotice);
      return;
    }
    const problem = validateEmailAuth(mode, { name, email, password });
    setLocalError(problem);
    if (problem) return;
    if (mode === "login") onLogin(email.trim(), password);
    else onSignup(name.trim(), email.trim(), password);
  };

  const error = localError ?? serverError;
  const submitLabel = recovering
    ? busy ? "Sending…" : "Send reset link"
    : mode === "login"
      ? busy ? "Signing in…" : "Sign in"
      : busy ? "Creating account…" : "Create account";

  return (
    <form className="auth-email" onSubmit={submit} noValidate>
      <div className={`auth-reveal ${!recovering && mode === "signup" ? "auth-reveal--open" : ""}`} inert={recovering || mode !== "signup"}>
        <div className="auth-reveal__inner">
          <label className="auth-field">Your name<input
            ref={mode === "signup" ? firstFieldRef : undefined}
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            aria-label="Your name"
            tabIndex={!recovering && mode === "signup" ? 0 : -1}
          /></label>
        </div>
      </div>
      <label className="auth-field">Email address<input
        ref={recovering || mode === "login" ? firstFieldRef : undefined}
        className="auth-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        autoComplete="email"
        inputMode="email"
        aria-label="Email address"
      /></label>
      {!recovering && (
        <label className="auth-field">Password<input
          className="auth-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-label="Password"
        /></label>
      )}
      <div className="auth-email__feedback" role="status" aria-live="polite">
        {error && <span className="auth-email__error">{error}</span>}
        {!error && notice && <span className="auth-email__notice">{notice}</span>}
      </div>
      <button className="auth-submit" type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {(recovering || mode === "login") && (
        <button
          type="button"
          className="auth-link"
          onClick={() => {
            setRecovering(!recovering);
            onRecoveryChange?.(!recovering);
            setLocalError(null);
            setNotice(null);
            onResetError();
          }}
        >
          {recovering ? "Back to log in" : "Forgot password?"}
        </button>
      )}
    </form>
  );
}
