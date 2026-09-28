import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import { apiRequest, portalApi } from "../api.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function BillingStatusPage({ status }) {
  const success = status === "success";
  const { user, loading } = useWebsiteSession();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState(success ? "Waiting for verified payment confirmation…" : "Checkout was closed. Your balance changes only after a verified payment.");
  const order = new URLSearchParams(window.location.search).get('order');
  useEffect(() => {
    if (!success || loading || !user) return;
    let active = true; let timer; let attempts = 0;
    const check = async () => {
      try {
        if (!order || !/^[0-9a-f-]{36}$/i.test(order)) {
          await portalApi.wallet();
          if (active) setMessage("Check your account for the latest verified balance and membership.");
          return;
        }
        const result = await apiRequest(`/web-api/billing/orders/${order}`);
        if (!active) return;
        if (result.paid) { setConfirmed(true); setMessage("Your purchase is confirmed. Your tokens are available across Vibyra."); return; }
        if (++attempts < 12) timer = setTimeout(check, 1500);
        else setMessage("Confirmation is still arriving. You can safely return to the app or check again here.");
      } catch (e) { if (active) setMessage(e.message); }
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [success, loading, user?.id, order]);
  if (!success) return <PortalShell layout="checkout" eyebrow="" title="You haven’t been charged" intro="You closed the payment page before paying. Your plan and balance are unchanged.">
    <div className="status-panel checkout-panel">
      <div className="status-actions"><a className="portal-button portal-button--primary" href="/checkout">Back to checkout</a><a className="portal-button portal-button--secondary" href="/#pricing">Compare plans</a></div>
      <p className="checkout-fine">Questions before you buy? Email support@vibyra.app.</p>
    </div>
  </PortalShell>;
  return <PortalShell layout="checkout" eyebrow="" title={confirmed ? "Welcome to Vibyra Pro" : "Confirming your payment"} intro={confirmed ? "Your membership is active and your tokens are in your account." : "This usually takes a few seconds. You can keep this page open."}>
    <div className="status-panel checkout-panel"><Notice tone={confirmed ? "success" : "neutral"}>{message}</Notice>
      {!user && !loading && <a className="portal-button portal-button--primary" href="/login?next=/billing">Log in to check your account</a>}
      {confirmed ? <>
        <h2>What’s next</h2>
        <ol className="checkout-next">
          <li><strong>Open Vibyra on your computer</strong> and sign in with this account. Pro is already on it.</li>
          <li><strong>Link your Claude, ChatGPT and Gemini accounts</strong> and meet your Agents.</li>
          <li><strong>Reach your computer from your iPhone</strong> anywhere through Vibyra Cloud, while it’s on and online.</li>
        </ol>
        <div className="status-actions"><a className="portal-button portal-button--primary" href="/downloads">Download Vibyra</a><a className="portal-button portal-button--secondary" href="/billing">Your membership and tokens</a></div>
      </> : <div className="status-actions"><button className="portal-button portal-button--primary" onClick={() => window.location.reload()}>Check again</button><a className="portal-button portal-button--secondary" href="/billing">Your membership and tokens</a></div>}
    </div>
  </PortalShell>;
}
