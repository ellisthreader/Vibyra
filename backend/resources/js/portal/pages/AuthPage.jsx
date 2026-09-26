import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import ProviderIcon from "../components/ProviderIcon.jsx";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import { authPath, go, purchaseIntent, safeNext, withIntent } from "../navigation.js";
import { completeProviderLogin } from "../providerAuth.js";
import { apiRequest } from "../api.js";

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
  const intent = purchaseIntent();
  const ownerLogin = window.location.pathname === "/owner/login";
  const localOwnerAvailable = ownerLogin && document.querySelector('meta[name="local-owner-access"]')?.content === "1";
  const next = ownerLogin ? "/owner" : safeNext(window.location.search, "/account");

  useEffect(() => {
    if (!loading && user) go(withIntent(next, intent));
  }, [loading, user]);

  const update = (event) => setFields((value) => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = creating ? fields : { email: fields.email, password: fields.password };
      if (creating) await signup(payload);
      else {
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
      await completeProviderLogin(provider, setProviderStatus);
      await refresh();
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

  if (challenge) return <PortalShell layout="auth" eyebrow="VERIFY YOUR ACCOUNT"
    title={<>One more<br /><span>step.</span></>} intro="Enter the code from your authenticator app or a recovery code.">
    <div className="auth-panel"><div className="auth-panel-heading"><h2>Two-factor verification</h2></div>
      {error && <Notice tone="error">{error}</Notice>}
      <form className="portal-form" onSubmit={submitCode}>
        <label>Authentication or recovery code<input name="code" inputMode="text" autoComplete="one-time-code"
          maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} autoFocus required /></label>
        <button className="portal-button portal-button--primary" disabled={busy || !code.trim()} type="submit">
          {busy ? "Checking…" : "Verify and log in"}</button>
      </form>
      <p className="auth-switch"><button type="button" onClick={() => { setChallenge(null); setCode(""); }}>Use another account</button></p>
    </div>
  </PortalShell>;

  return (
    <PortalShell layout="auth" eyebrow={ownerLogin ? "PRIVATE WORKSPACE" : "YOUR SPACE TO BUILD"}
      title={creating ? <>Make room for<br /><span>your next idea.</span></> : ownerLogin ? <>See the<br /><span>whole picture.</span></> : <>Good to<br /><span>have you back.</span></>}
      intro={ownerLogin ? "Your Vibyra website, desktop and mobile activity in one place." : "Your projects, your agents, your next big idea. All connected with one Vibyra account."}>
      <div className="auth-panel">
        <div className="auth-panel-heading">
          <h2>{creating ? "Create your account" : ownerLogin ? "Owner access" : "Log in to Vibyra"}</h2>
          <p>{creating ? "A little less between you and what’s next." : ownerLogin ? "Open your private analytics workspace." : "Pick up where you left off."}</p>
        </div>
        {localOwnerAvailable && <div className="owner-local-entry">
          <span>LOCAL TEST ACCESS</span>
          <strong>Open owner dashboard</strong>
          <p>One click signs in with a local test account. The dashboard shows recorded data, with unavailable metrics clearly marked.</p>
          <button type="button" className="portal-button portal-button--primary" disabled={busy} onClick={localOwnerLogin}>
            {busy ? "Opening…" : "Log in as owner"}
          </button>
          <small>owner.local@vibyra.test</small>
        </div>}
        <div className="provider-actions">
          {["google", "apple"].map((provider) => (
            <button key={provider} className="provider-button" disabled={busy} onClick={() => providerLogin(provider)}>
              <ProviderIcon provider={provider} /> Continue with {provider === "apple" ? "Apple" : "Google"}
            </button>
          ))}
          {providerStatus && <p className="provider-status" role="status">{providerStatus}</p>}
        </div>
        <div className="auth-divider"><span>or continue with email</span></div>
        {error && <Notice tone="error">{error}</Notice>}
        <form className="portal-form" onSubmit={submit}>
          {creating && <label>Name<input name="name" value={fields.name} onChange={update} autoComplete="name" required /></label>}
          <label>Email address<input name="email" type="email" placeholder="you@example.com" value={fields.email} onChange={update} autoComplete="email" required /></label>
          <div className="auth-password">
            <label htmlFor="auth-password">Password</label>
            <div>
              <input id="auth-password" name="password" type={showPassword ? "text" : "password"} value={fields.password} onChange={update} autoComplete={creating ? "new-password" : "current-password"} minLength={8} required />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {creating && <small>At least 8 characters.</small>}
          </div>
          <button className="portal-button portal-button--primary" data-analytics-cta={creating ? "signup_submit" : undefined} disabled={busy || loading} type="submit">
            {busy ? "Please wait…" : creating ? "Create account" : "Log in"}
          </button>
        </form>
        {!ownerLogin && <p className="auth-switch">
          {creating ? "Already have an account? " : "New to Vibyra? "}
          <a href={authPath(creating ? "login" : "signup", next, intent)}>{creating ? "Log in" : "Create an account"}</a>
        </p>}
      </div>
    </PortalShell>
  );
}
