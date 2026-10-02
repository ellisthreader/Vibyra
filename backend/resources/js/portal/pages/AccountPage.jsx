import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import RedeemLicense from "../components/RedeemLicense.jsx";
import AccountMembership from "../components/AccountMembership.jsx";
import AccountDownloads from "../components/AccountDownloads.jsx";
import AccountSetup from "../components/AccountSetup.jsx";
import Notice from "../components/Notice.jsx";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import { portalApi } from "../api.js";

export default function AccountPage() {
  const { user, loading, logout, refresh } = useWebsiteSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  useEffect(() => { if (!loading && !user) go("/login?next=/account"); }, [loading, user]);
  const signOut = async () => {
    setBusy(true); setError("");
    try { await logout(); go("/"); }
    catch (caught) { setError(caught.message); setBusy(false); }
  };
  const resendVerification = async () => {
    setVerificationStatus("Sending a verification link…");
    try {
      await portalApi.resendVerification(user.email);
      setVerificationStatus("If your email still needs verification, a new link is on its way.");
    } catch (caught) { setVerificationStatus(caught.message); }
  };
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  return <PortalShell eyebrow="YOUR VIBYRA SPACE" title={<>Welcome back,<br /><span>{firstName}.</span></>}
    intro="Everything you need to get started, stay connected and make the most of your membership." layout="account">
    {error && <Notice tone="error">{error}</Notice>}
    {loading && <div className="portal-loading" role="status">Opening your account…</div>}
    {user && <>
      <div className="account-identity"><span className="account-identity-avatar" aria-hidden="true">{firstName[0]?.toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="portal-link-button" disabled={busy} onClick={signOut}>Log out</button></div>
      {!user.emailVerified && <p className="account-email-note" role="status">Check your inbox to verify your email address. <button type="button" onClick={resendVerification}>Send link again</button>{verificationStatus && <span>{verificationStatus}</span>}</p>}
      <nav className="account-jump" aria-label="Account sections"><a href="#membership">Membership</a><a href="#downloads">Downloads</a><a href="#connect">Connect your phone</a></nav>
      <AccountMembership key={`${user.id}:${user.billingProvider}`} user={user} />
      <RedeemLicense key={user.id} user={user} onRedeemed={refresh} />
      <AccountDownloads />
      <AccountSetup email={user.email} />
    </>}
  </PortalShell>;
}
