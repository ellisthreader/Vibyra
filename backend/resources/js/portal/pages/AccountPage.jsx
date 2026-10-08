import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import { portalApi } from "../api.js";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function AccountPage() {
  const { user, loading, logout } = useWebsiteSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) go("/login?next=/account");
  }, [loading, user]);

  const manage = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = await portalApi.billingPortal();
      if (!payload.url) throw new Error("The billing portal did not return a secure link.");
      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      go("/");
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  return (
    <PortalShell title="Your account" intro="Manage your Vibyra membership, billing, and account details.">
      {error && <Notice tone="error">{error}</Notice>}
      {user && (
        <div className="account-grid">
          <section className="account-panel"><p className="panel-label">Account</p><h2>{user.name}</h2><p>{user.email}</p></section>
          <section className="account-panel">
            <p className="panel-label">Current membership</p><h2>{user.plan === "free" ? "Free" : user.plan?.replace(/^./, (letter) => letter.toUpperCase())}</h2>
            <p>{user.membershipActive ? "Your paid membership is active." : "Desktop downloads are free; upgrade for more credits and projects."}</p>
            <div className="account-actions">
              <a className="portal-button portal-button--primary" href="/downloads">Download Vibyra</a>
              {!user.membershipActive && <a className="portal-button portal-button--secondary" href="/billing">Choose membership</a>}
              {user.canManageStripeBilling && <button className="portal-button portal-button--secondary" disabled={busy} onClick={manage}>Manage billing</button>}
            </div>
          </section>
          <button className="portal-link-button" disabled={busy} onClick={signOut}>Log out</button>
        </div>
      )}
    </PortalShell>
  );
}
