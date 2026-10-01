import React, { useEffect, useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Notice from "../components/Notice.jsx";
import ProviderIcon from "../components/ProviderIcon.jsx";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import { authPath, go, purchaseIntent, safeNext, withIntent } from "../navigation.js";
import { completeProviderLogin } from "../providerAuth.js";
import { apiRequest, portalApi } from "../api.js";
import SignupWelcome from "../components/SignupWelcome.jsx";

export default function AuthPage({ mode }) {
  const creating = mode === "signup";
  const { user, loading, login, loginTwoFactor, signup, refresh } = useWebsiteSession();
  const [fields, setFields] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providerStatus, setProviderStatus] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [welcome, setWelcome] = useState(null);
  const [providers, setProviders] = useState(null);
  const intent = purchaseIntent();
  const ownerLogin = window.location.pathname === "/owner/login";
  const localOwnerAvailable = ownerLogin && document.querySelector('meta[name="local-owner-access"]')?.content === "1";
  const next = ownerLogin ? "/owner" : safeNext(window.location.search, "/account");

  useEffect(() => {
    if (!loading && user && !busy && !welcome) go(withIntent(next, intent));
  }, [loading, user, busy, welcome]);
  useEffect(() => {
    let live = true;
    portalApi.providers().then((result) => { if (live) setProviders(result.providers ?? {}); })
      .catch(() => { if (live) setProviders({}); });
    return () => { live = false; };
  }, []);

  const update = (event) => setFields((value) => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = creating ? fields : { email: fields.email, password: fields.password };
      if (creating) {
        const created = await signup(payload);
        if (next === "/account") { setWelcome({ name: created?.name || fields.name, path: withIntent(next, intent) }); return; }
      } else {
        const result = await login(payload);
        if (result?.twoFactor) {
          setChallenge(result.twoFactor);
          setBusy(false);
          return;
        }
      }
      go(withIntent(next, intent));
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };
  const submitCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await loginTwoFactor(challenge.challengeId, code);
      go(withIntent(next, intent));
    } catch (caught) {
      setError(caught.message);
      setCode("");
      setBusy(false);
    }
  };
  const providerLogin = async (provider) => {
    setBusy(true);
    setError("");
    try {
      const result = await completeProviderLogin(provider, setProviderStatus);
      await refresh();
      if (result?.isNewUser && next === "/account") {
        setWelcome({ name: result.user?.name, path: withIntent(next, intent) });
        return;
      }
      go(withIntent(next, intent));
    } catch (caught) {
      setError(caught.message);
      setProviderStatus("");
      setBusy(false);
    }
  };
  const localOwnerLogin = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/web-api/owner/local-login", { body: {} });
      go("/owner");
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  if (welcome) return <SignupWelcome name={welcome.name} onDone={() => go(welcome.path)} />;

  const switchTo = ownerLogin ? null : creating
    ? { label: "Log in", href: authPath("login", next, intent) }
    : { label: "Create account", href: authPath("signup", next, intent) };

  if (challenge) return <AuthShell>
    <div className="auth-heading">
      <h1>Two-factor verification</h1>
      <p>Enter the code from your authenticator app, or one of your recovery codes.</p>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    <form className="auth-form" onSubmit={submitCode}>
      <label className="auth-field"><span>Authentication or recovery code</span>
        <input name="code" inputMode="text" autoComplete="one-time-code" maxLength={20} value={code}
          onChange={(event) => setCode(event.target.value)} autoFocus required /></label>
      <button className="auth-pill auth-pill--light auth-submit" disabled={busy || !code.trim()} type="submit">
        {busy ? "Checking…" : "Verify and log in"}</button>
    </form>
    <p className="auth-foot"><button type="button" onClick={() => { setChallenge(null); setCode(""); }}>Use another account</button></p>
  </AuthShell>;

  return (
    <AuthShell switchTo={switchTo}>
      <div className="auth-heading">
        <h1>{creating ? "Create your account" : ownerLogin ? "Owner access" : "Welcome back"}</h1>
        <p>{creating ? "A little less between you and what’s next." : ownerLogin ? "Open your private analytics workspace." : "Log in to pick up where you left off."}</p>
      </div>
      {localOwnerAvailable && <div className="owner-local-entry">
        <span>LOCAL TEST ACCESS</span>
        <strong>Open owner dashboard</strong>
        <p>One click signs in with a local test account. The dashboard shows recorded data, with unavailable metrics clearly marked.</p>
        <button type="button" className="auth-pill auth-pill--light" disabled={busy} onClick={localOwnerLogin}>
          {busy ? "Opening…" : "Log in as owner"}
        </button>
        <small>owner.local@vibyra.test</small>
      </div>}
      <div className="auth-providers">
        {["google", "apple"].map((provider) => (
          <button key={provider} type="button" className="auth-provider" aria-label={`Continue with ${provider[0].toUpperCase() + provider.slice(1)}`}
            disabled={busy || !providers?.[provider]} onClick={() => providerLogin(provider)}>
            <ProviderIcon provider={provider} /> {provider[0].toUpperCase() + provider.slice(1)}
          </button>
        ))}
      </div>
      {providers && ![providers.google, providers.apple].some(Boolean) && <p className="auth-provider-status" role="status">Social sign-in is not configured on this server yet. You can continue with email.</p>}
      {providerStatus && <p className="auth-provider-status" role="status">{providerStatus}</p>}
      <div className="auth-divider"><span>or with email</span></div>
      {error && <Notice tone="error">{error}</Notice>}
      <form className="auth-form" data-analytics-form={creating ? "signup" : undefined} onSubmit={submit}>
        {creating && <label className="auth-field"><span>Name</span>
          <input name="name" value={fields.name} onChange={update} autoComplete="name" placeholder="Your name" required /></label>}
        <label className="auth-field"><span>Email</span>
          <input name="email" type="email" placeholder="you@example.com" value={fields.email} onChange={update} autoComplete="email" required /></label>
        <div className="auth-field">
          <label htmlFor="auth-password">Password</label>
          <div className="auth-password">
            <input id="auth-password" name="password" type={showPassword ? "text" : "password"} value={fields.password} onChange={update}
              placeholder={creating ? "At least 8 characters" : "Your password"} autoComplete={creating ? "new-password" : "current-password"} minLength={8} required />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
        </div>
        <button className="auth-pill auth-pill--light auth-submit" data-analytics-cta={creating ? "signup_submit" : undefined} disabled={busy || loading} type="submit">
          {busy ? "Please wait…" : creating ? "Create account" : "Log in"}
        </button>
      </form>
      {!creating && <p className="auth-foot"><a href="/forgot-password">Forgot your password?</a></p>}
      {!ownerLogin && <p className="auth-foot">
        {creating ? "Already have an account? " : "New to Vibyra? "}
        <a href={switchTo.href}>{creating ? "Log in" : "Create an account"}</a>
      </p>}
    </AuthShell>
  );
}
