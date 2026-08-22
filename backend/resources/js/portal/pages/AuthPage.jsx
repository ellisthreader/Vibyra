import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import ProviderIcon from "../components/ProviderIcon.jsx";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import { authPath, go, purchaseIntent, safeNext, withIntent } from "../navigation.js";
import { completeProviderLogin } from "../providerAuth.js";

export default function AuthPage({ mode }) {
  const creating = mode === "signup";
  const { user, loading, login, signup, refresh } = useWebsiteSession();
  const [fields, setFields] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providerStatus, setProviderStatus] = useState("");
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
      await (creating ? signup(payload) : login(payload));
      go(withIntent(next, intent));
    } catch (caught) {
      setError(caught.message);
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
