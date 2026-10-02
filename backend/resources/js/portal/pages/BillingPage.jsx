import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import TokenWallet from "../components/TokenWallet.jsx";
import { portalApi } from "../api.js";
import { authPath, go, purchaseIntent } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

const money = p => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
export default function BillingPage() {
  const { user, loading } = useWebsiteSession();
  const [offers, setOffers] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [requests] = useState(() => new Map());
  const intent = purchaseIntent();
  useEffect(() => {
    let active = true;
    portalApi.catalogue().then(data => { if (active) { setOffers(data.offers); setError(""); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  const legacy = Boolean(user && wallet && wallet.version !== 2);
  const mismatch = Boolean(intent.scope && wallet && wallet.accountToken !== intent.scope);
  const choose = async offer => {
    if (!user) { go(authPath("signup", "/billing", { ...intent, offer: offer.offerKey, version: offer.offerVersion })); return; }
    if (mismatch) { setError("Sign in with the same Vibyra account you opened this purchase from."); return; }
    setBusy(true); setError("");
    const key = `${user.id}:${offer.offerKey}:${offer.offerVersion}`;
    if (!requests.has(key)) requests.set(key, crypto.randomUUID());
    try {
      const result = await portalApi.buyOffer(offer, requests.get(key), intent.scope);
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Checkout returned an invalid link.");
      window.location.assign(url.href);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return <PortalShell eyebrow="Membership" title="Free to start. Pro when you need more." intro="Use your own AI accounts, or use Vibyra tokens for managed AI. Pro includes a monthly token allowance.">
    {error && <Notice tone="error">{error} <button onClick={() => setAttempt(n => n + 1)}>Retry prices</button></Notice>}
    {legacy && <Notice>Your account keeps its existing billing terms and balance. Contact support to move to the new offers.</Notice>}
    {mismatch && <Notice tone="error">This browser is signed into a different account from the app. Switch accounts before purchasing.</Notice>}
    {user && <TokenWallet accountId={user.id} onWallet={setWallet} />}
    <div className="plan-grid" aria-busy={loading || (!offers.length && !error)}>
      <section className="account-panel"><p className="panel-label">Free</p><h2>£0</h2>
        <p>One project and two running terminals, with your own compatible coding CLI accounts. Built-in AI uses Vibyra tokens. Preview, Review and Safe mode worktrees are included with Pro.</p>
        <p>10 monthly free tokens for eligible accounts in our limited pilot. Check eligibility after sign-in.</p>
        {!user && <a className="portal-button portal-button--secondary" data-analytics-cta="billing_start_free" href={authPath("signup", "/billing")}>Start free</a>}
      </section>
      {(() => {
        const subs = offers.filter(o => o.kind === "subscription");
        const monthly = subs.find(o => o.interval === "month"); const annual = subs.find(o => o.interval === "year");
        if (!monthly && !annual) return null;
        const pro = wallet?.plan === 'pro_v2';
        const checkout = o => `/checkout?${new URLSearchParams({ offer: o.offerKey, version: o.offerVersion, ...(intent.scope ? { scope: intent.scope } : {}) })}`;
        return <section className="account-panel">
          <p className="panel-label">Vibyra Pro</p><h2>{monthly ? `${money(monthly.pence)} / month` : `${money(annual.pence)} / year`}</h2>
          {annual && monthly && <p>Or {money(annual.pence)} a year, saving {money(monthly.pence * 12 - annual.pence)}.</p>}
          <p>{(monthly ?? annual).credits} Vibyra tokens each month{annual ? ` (${annual.credits.toLocaleString("en-GB")} up front on Annual)` : ""}. Paid tokens never expire, including after cancellation.</p>
          <p>Unlimited terminals and projects, Preview, Review and Safe mode worktrees. Your own coding CLI accounts are also available on Free; they use your provider subscription separately from Vibyra tokens.</p>
          <div className="account-actions">{pro
            ? <button className="portal-button portal-button--primary" disabled>Your current plan</button>
            : [annual, monthly].filter(Boolean).map((o, i) => <a key={o.offerKey} className={`portal-button ${i ? "portal-button--secondary" : "portal-button--primary"}`} data-analytics-cta="billing_buy" href={checkout(o)}>{o.interval === "year" ? "Continue with Annual" : "Continue with Monthly"}</a>)}</div>
        </section>;
      })()}
    </div>
    <section className="account-panel"><h2>Need more tokens?</h2><p>One-time purchases, available on Free or Pro.</p>
      <div className="account-actions">{offers.filter(o => o.kind === "topup").map(o => <button key={o.offerKey} className="portal-button portal-button--secondary" data-analytics-cta="billing_buy" disabled={busy || mismatch || legacy || !o.stripeEnabled} onClick={() => choose(o)}>{o.credits} tokens · {money(o.pence)}</button>)}</div>
    </section>
    <p className="billing-footnote">GBP prices include applicable taxes. Pro renews monthly or yearly until cancelled; features remain until the paid-through date. Tokens pay for Vibyra-funded AI; they are separate from provider text tokens. Your own API keys may incur provider charges.</p>
  </PortalShell>;
}
