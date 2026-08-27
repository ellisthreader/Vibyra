import { useEffect, useRef, useState } from "react";

import { type EmailAuthMode, validateEmailAuth } from "../../lib/accountPolicy";

interface AuthEmailFormProps {
  active: boolean;
  mode: EmailAuthMode;
  recovering: boolean;
  busy: boolean;
  serverError: string | null;
  onModeChange: (mode: EmailAuthMode) => void;
  onRecoveringChange: (recovering: boolean) => void;
  onLogin: (email: string, password: string) => void;
  onSignup: (name: string, email: string, password: string) => void;
  onForgot: (email: string) => Promise<string>;
  onResetError: () => void;
}

export function AuthEmailForm({
  active,
  mode,
  recovering,
  busy,
  serverError,
  onModeChange,
  onRecoveringChange,
  onLogin,
  onSignup,
  onForgot,
  onResetError,
}: AuthEmailFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) firstFieldRef.current?.focus();
  }, [active, mode, recovering]);

  const switchMode = (next: EmailAuthMode) => {
    onModeChange(next);
    setLocalError(null);
    setNotice(null);
    onResetError();
  };

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
      ? busy ? "Logging in…" : "Log in"
      : busy ? "Creating account…" : "Create account";

  return (
    <form className="auth-email" onSubmit={submit} noValidate>
      {!recovering && (
        <div className="auth-email__modes" data-mode={mode} role="tablist" aria-label="Email sign-in mode">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => switchMode("login")}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => switchMode("signup")}>
            Create account
          </button>
        </div>
      )}
      {recovering && <p className="auth-email__lead">Enter your email and we’ll send a password reset link.</p>}
      <div className={`auth-reveal ${!recovering && mode === "signup" ? "auth-reveal--open" : ""}`}>
        <div className="auth-reveal__inner">
          <input
            ref={mode === "signup" ? firstFieldRef : undefined}
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            aria-label="Your name"
            tabIndex={!recovering && mode === "signup" ? 0 : -1}
          />
        </div>
      </div>
      <input
        ref={recovering || mode === "login" ? firstFieldRef : undefined}
        className="auth-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        autoComplete="email"
        inputMode="email"
        aria-label="Email address"
      />
      {!recovering && (
        <input
          className="auth-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-label="Password"
        />
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
            onRecoveringChange(!recovering);
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
