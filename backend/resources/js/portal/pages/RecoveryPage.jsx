import React, { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import { apiRequest } from "../api.js";

export default function RecoveryPage({ reset = false }) {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const token = params.get("token") || "";
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiRequest(`/web-api/auth/password/${reset ? "reset" : "forgot"}`, {
        body: reset ? { email, token, password, passwordConfirmation: confirmation } : { email },
      });
      setPassword(""); setConfirmation(""); setMessage(result.message);
      if (reset) window.history.replaceState(null, "", "/reset-password");
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  return <AuthShell switchTo={{ label: "Log in", href: "/login" }}>
    <div className="auth-heading"><h1>{reset ? "Choose a new password" : "Reset your password"}</h1>
      <p>{reset ? "Your other signed-in sessions will end." : "We’ll email a secure link if this address has a password account."}</p></div>
    {message ? <p role="status">{message} <a href="/login">Return to log in</a></p> : reset && !token
      ? <p role="alert">This reset link is incomplete. <a href="/forgot-password">Request a new link</a>.</p>
      : <form className="auth-form" onSubmit={submit}>
        <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        {reset && <>
          <label className="auth-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="auth-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        </>}
        <button className="auth-pill auth-pill--light" disabled={busy}>{busy ? "Please wait…" : reset ? "Save new password" : "Email reset link"}</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </AuthShell>;
}
