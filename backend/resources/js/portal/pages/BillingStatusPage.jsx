import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import { ApiError, portalApi } from "../api.js";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function BillingStatusPage({ status }) {
  const success = status === "success";
  const { user, loading, refresh } = useWebsiteSession();
  const [message, setMessage] = useState(success ? "Confirming your membership…" : "Checkout was cancelled. Nothing was charged.");

  useEffect(() => {
    if (!success || loading) return undefined;
    let active = true;
    const confirm = async () => {
      if (!user) {
        go("/login?next=/downloads");
        return;
      }
      for (let attempt = 0; attempt < 12 && active; attempt += 1) {
        try {
          await refresh();
          await portalApi.releases();
          go("/downloads");
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            go("/login?next=/downloads");
            return;
          }
          if (!(error instanceof ApiError) || error.status !== 403) {
            setMessage(error.message);
            return;
          }
        }
        await wait(1500);
      }
      if (active) setMessage("Payment succeeded, but membership confirmation is still arriving. Try again in a moment.");
    };
    confirm();
    return () => { active = false; };
  }, [success, loading, user?.id, refresh]);

  return (
    <PortalShell eyebrow="Billing" title={success ? "Payment received" : "Checkout cancelled"} intro={success ? "Stripe is securely confirming your Vibyra membership." : "You can return to memberships whenever you are ready."}>
      <div className="status-panel">
        <Notice tone={success ? "success" : "neutral"}>{message}</Notice>
        <div className="status-actions">
          {success && <button className="portal-button portal-button--primary" onClick={() => window.location.reload()}>Check again</button>}
          <a className="portal-button portal-button--secondary" href="/billing">View memberships</a>
        </div>
      </div>
    </PortalShell>
  );
}
