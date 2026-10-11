import React, { useEffect, useState } from "react";
import Notice from "./Notice.jsx";
import { teamApi } from "../teamApi.js";

const MESSAGES = {
  sso_unavailable: "Single sign-on is not available for that team right now.",
  sso_state: "That sign-in expired or was started elsewhere. Please try again.",
  sso_provider: "Your identity provider could not complete the sign-in.",
  sso_token: "Your identity provider's answer could not be verified.",
  sso_claims: "Your identity provider's answer was not valid for Vibyra.",
  sso_domain: "That email address is not on the team's verified domain.",
  account_required: "Create your Vibyra account with this email address first, then sign in with SSO.",
  two_factor: "Single sign-on is not available for accounts with Vibyra two-factor sign-in. Contact your team owner for help.",
  other_team: "This account already belongs to another team.",
  no_seats: "Your team has no free seat. Ask a manager or owner.",
  sso_identity: "This account is linked to a different identity.",
  cancelled: "Sign-in was cancelled.",
  membership_removed: "Your team access was removed. Ask a team owner for a new invitation.",
};

/** "Use single sign-on": drawn on the log-in page only when the server has Teams on. One email field, then off to the provider. */
export default function SsoSignIn() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(() => MESSAGES[new URLSearchParams(window.location.search).get("sso_error")] ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; teamApi.ssoAvailable().then((r) => live && setOn(!!r.enabled)).catch(() => {}); return () => { live = false; }; }, []);
  if (!on) return error ? <Notice tone="error">{error}</Notice> : null;
  const go = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { window.location.assign((await teamApi.ssoStart(email.trim())).authUrl); }
    catch (caught) { setError(caught.message); setBusy(false); }
  };
  return <>
    {error && <Notice tone="error">{error}</Notice>}
    {!open ? <p className="auth-help"><button type="button" className="portal-link-button" onClick={() => setOpen(true)}>Use single sign-on</button></p>
      : <form className="team-form" onSubmit={go} aria-busy={busy}>
        <label>Work email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" maxLength={254} required /></label>
        <button className="portal-button portal-button--secondary" disabled={busy || !email.trim()}>Continue with SSO</button>
      </form>}
  </>;
}
