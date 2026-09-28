import React, { useEffect, useState } from "react";
import TokenWallet from "./TokenWallet.jsx";
import Notice from "./Notice.jsx";
import { portalApi } from "../api.js";

const money = (pence) => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP",
}).format(pence / 100);
const date = (value) => value ? new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric",
}).format(new Date(value)) : "";

export default function AccountMembership({ user }) {
  const [offer, setOffer] = useState(null);
  const [priceError, setPriceError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setPriceError(false);
    portalApi.catalogue().then((data) => {
      const current = data.version === 2 ? data.offers?.find((item) => item.offerKey === "pro_monthly") : null;
      if (!current || !Number.isSafeInteger(current.pence) || current.pence <= 0) throw new Error("Current pricing unavailable");
      if (live) setOffer(current);
    }).catch(() => { if (live) setPriceError(true); });
    return () => { live = false; };
  }, [attempt]);

  const free = !user.membershipActive || user.plan === "free";
  const currentPro = user.membershipActive && user.plan === "pro_v2";
  const planName = free ? "Free" : currentPro ? "Pro" : user.plan?.replace(/^./, (letter) => letter.toUpperCase()) || "Membership";
  const period = user.membershipEndsAt && user.membershipActive
    ? `${user.membershipCancelAtPeriodEnd ? "Access until" : "Current period ends"} ${date(user.membershipEndsAt)}`
    : null;
  const manage = async () => {
    setBusy(true); setError("");
    try {
      const payload = await portalApi.billingPortal();
      if (!payload.url) throw new Error("The billing portal did not return a secure link.");
      window.location.assign(payload.url);
    } catch (caught) { setError(caught.message); setBusy(false); }
  };

  return <section className="account-membership" id="membership" aria-labelledby="membership-title">
    <div className="account-section-head"><div><span>01 / YOUR MEMBERSHIP</span><h2 id="membership-title">A clear view of your plan.</h2></div><a href="/billing">Compare plans <span aria-hidden="true">↗</span></a></div>
    <div className="account-membership-grid">
      <div className="account-membership-main">
        <div className="account-membership-top"><span className="account-status"><i /> {free ? "Free account" : user.membershipCancelAtPeriodEnd ? "Cancels at period end" : "Active membership"}</span><span>VIBYRA / ACCOUNT</span></div>
        <div className="account-membership-plan"><h3>{planName}<span>.</span></h3><p>{free ? "£0 / month" : currentPro ? offer ? `Current Pro price ${money(offer.pence)} / month` : "Current price unavailable" : "Your existing terms"}</p></div>
        <p className="account-membership-description">{free ? "Desktop is free to download. Upgrade when you want more Vibyra tokens and project capacity." : currentPro ? "More room for projects, Vibyra-funded tasks and monthly tokens." : "Your existing membership and billing terms remain in place."}</p>
        {period && <p className="account-period">{period}</p>}
        {priceError && currentPro && <p className="account-price-note" role="status">Current public pricing could not load. Your membership is unaffected. <button onClick={() => setAttempt((value) => value + 1)}>Retry</button></p>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="account-membership-actions">
          {free && <a className="portal-button portal-button--primary" href="/billing">Explore Pro <span aria-hidden="true">↗</span></a>}
          {user.canManageStripeBilling && <button className="portal-button portal-button--secondary" disabled={busy} onClick={manage}>Manage billing</button>}
          {user.billingProvider === "iap-apple" && <a className="portal-button portal-button--secondary" href="https://apps.apple.com/account/subscriptions">Manage in App Store</a>}
        </div>
      </div>
      <TokenWallet accountId={user.id} />
    </div>
  </section>;
}
