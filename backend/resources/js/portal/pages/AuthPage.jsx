import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import ProviderIcon from "../components/ProviderIcon.jsx";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import { authPath, go, purchaseIntent, safeNext, withIntent } from "../navigation.js";
import { completeProviderLogin } from "../providerAuth.js";

export default function AuthPage({ mode }) {
  const creating = mode === "signup";
  const { user, loading, login, loginTwoFactor, signup, refresh } = useWebsiteSession();
  const [fields, setFields] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providerStatus, setProviderStatus] = useState("");
  // Set once the password is accepted and the account asks its second question.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const intent = purchaseIntent();
  const next = safeNext(window.location.search, "/account");

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

  if (challenge) {
    return (
      <PortalShell title="Enter your code" intro="Your account asks for a code from your authenticator app as well as your password.">
        <div className="auth-panel">
          {error && <Notice tone="error">{error}</Notice>}
          <form className="portal-form" onSubmit={submitCode}>
            <label>Six-digit code
              {/* Not restricted to digits: a recovery code goes in the same box. */}
              <input name="code" inputMode="text" autoComplete="one-time-code" maxLength={20}
                value={code} onChange={(event) => setCode(event.target.value)} autoFocus required />
            </label>
            <button className="portal-button portal-button--primary" disabled={busy || !code.trim()} type="submit">
              {busy ? "Please wait…" : "Log in"}
            </button>
          </form>
          <p className="auth-switch">Lost your phone? Enter one of your recovery codes instead.</p>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell title={creating ? "Create your Vibyra account" : "Welcome back"} intro="One account connects the website, phone app, and Vibyra Desktop.">
      <div className="auth-panel">
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
          <label>Email address<input name="email" type="email" value={fields.email} onChange={update} autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={fields.password} onChange={update} autoComplete={creating ? "new-password" : "current-password"} minLength={8} required /></label>
          <button className="portal-button portal-button--primary" disabled={busy || loading} type="submit">
            {busy ? "Please wait…" : creating ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="auth-switch">
          {creating ? "Already have an account? " : "New to Vibyra? "}
          <a href={authPath(creating ? "login" : "signup", next, intent)}>{creating ? "Log in" : "Create an account"}</a>
        </p>
      </div>
    </PortalShell>
  );
}
