import React, { useEffect, useMemo, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import { portalApi } from "../api.js";
import { authPath, purchaseIntent } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

// Account → review → Stripe. Buying needs a signed-in, verified Vibyra account;
// the offer and version ride along through sign-up and log-in in the URL.
const PRO_OFFERS = ["pro_annual", "pro_monthly"];
const INCLUDED = [
    "The full Vibyra ecosystem on Mac and iPhone",
    "Your own Claude, ChatGPT and Gemini accounts",
    "Vibyra Cloud: reach your computer from anywhere on iPhone",
    "Agents that keep working while you’re away",
    "Vibyra AI built into every project",
    "Tokens that never expire, even if you cancel",
];
const money = p => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
const renewal = months => {
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

function Steps({ current }) {
    const steps = ["Account", "Review", "Payment"];
    return <ol className="checkout-steps" aria-label="Checkout progress">
        {steps.map((label, i) => <li key={label} className={i < current ? "is-done" : i === current ? "is-current" : ""} aria-current={i === current ? "step" : undefined}>
            <span>{i < current ? "✓" : i + 1}</span>{label}
        </li>)}
    </ol>;
}

function Summary({ offer, monthly }) {
    const yearly = offer.interval === "year";
    const saving = yearly && monthly ? monthly.pence * 12 - offer.pence : 0;
    return <aside className="checkout-summary" aria-label="Order summary">
        <div className="checkout-summary-head">
            <img src="/media/marketing/vibyra-pro.png" alt="" width="768" height="649" />
            <div><h2>Vibyra Pro</h2><p>{yearly ? "Annual" : "Monthly"} membership</p></div>
        </div>
        <dl className="checkout-lines">
            <div><dt>Vibyra Pro, {yearly ? "12 months" : "1 month"}</dt><dd>{money(yearly && monthly ? monthly.pence * 12 : offer.pence)}</dd></div>
            {saving > 0 && <div className="is-saving"><dt>Annual saving</dt><dd>−{money(saving)}</dd></div>}
            <div><dt>Vibyra tokens</dt><dd>{offer.credits.toLocaleString("en-GB")}{yearly ? " up front" : " a month"}</dd></div>
        </dl>
        <div className="checkout-total"><span>Due today</span><strong>{money(offer.pence)}</strong></div>
        <p className="checkout-renews">Then {money(offer.pence)} every {yearly ? "year" : "month"} from {renewal(yearly ? 12 : 1)}, until you cancel. GBP, taxes included.</p>
        <p className="checkout-guarantee"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z" /><path d="m8 11 3 3 5-5" /></svg>
            <span><strong>14-day money-back guarantee.</strong> Not for you? Email support@vibyra.app within 14 days for a full refund of this payment.</span></p>
    </aside>;
}

export default function CheckoutPage() {
    const { user, loading, refresh, logout } = useWebsiteSession();
    const intent = useMemo(() => purchaseIntent(), []);
    const [offers, setOffers] = useState(null);
    const [offerKey, setOfferKey] = useState(PRO_OFFERS.includes(intent.offer) ? intent.offer : "pro_annual");
    const [wallet, setWallet] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [resent, setResent] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [requests] = useState(() => new Map());

    useEffect(() => {
        let active = true;
        portalApi.catalogue().then(data => { if (active) { setOffers(data.offers ?? []); setError(""); } })
            .catch(e => { if (active) setError(e.message || "We couldn’t load the current prices."); });
        return () => { active = false; };
    }, [attempt]);
    useEffect(() => {
        if (!user) return;
        let active = true;
        portalApi.wallet().then(data => { if (active) setWallet(data.wallet); }).catch(() => {});
        return () => { active = false; };
    }, [user?.id]);

    const pro = (offers ?? []).filter(o => PRO_OFFERS.includes(o.offerKey) && o.kind === "subscription");
    const monthly = pro.find(o => o.offerKey === "pro_monthly");
    const offer = pro.find(o => o.offerKey === offerKey) ?? monthly;
    const choose = key => {
        setOfferKey(key);
        const chosen = pro.find(o => o.offerKey === key);
        const params = new URLSearchParams(window.location.search);
        params.set("offer", key); if (chosen) params.set("version", chosen.offerVersion);
        window.history.replaceState(null, "", `/checkout?${params}`);
    };
    const here = { ...intent, offer: offer?.offerKey ?? offerKey, version: offer?.offerVersion ?? intent.version };
    const verified = user && user.emailVerified !== false;
    const alreadyPro = wallet?.plan === "pro_v2";
    const legacy = Boolean(wallet && wallet.version !== 2);
    const mismatch = Boolean(intent.scope && wallet && wallet.accountToken !== intent.scope);
    const step = !user ? 0 : !verified ? 0 : 1;

    const pay = async () => {
        if (!offer || !user) return;
        setBusy(true); setError("");
        const key = `${user.id}:${offer.offerKey}:${offer.offerVersion}`;
        if (!requests.has(key)) requests.set(key, crypto.randomUUID());
        try {
            const result = await portalApi.buyOffer(offer, requests.get(key), intent.scope);
            const url = new URL(result.url);
            if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Checkout returned an invalid link.");
            window.location.assign(url.href);
        } catch (e) { setError(e.message || "We couldn’t open secure payment. Please try again."); setBusy(false); }
    };
    const resend = async () => {
        try { await portalApi.resendVerification(user.email); setResent(true); }
        catch (e) { setError(e.message); }
    };
    const switchAccount = async () => {
        await logout().catch(() => {});
        window.location.assign(authPath("login", "/checkout", here));
    };

    return <PortalShell layout="checkout" eyebrow="" title="Continue with Vibyra Pro" intro={null}>
        <Steps current={step} />
        {error && <Notice tone="error">{error} {!offers && <button className="portal-link-button" onClick={() => setAttempt(n => n + 1)}>Try again</button>}</Notice>}
        {!offers && !error && <div className="portal-loading" role="status">Loading current prices…</div>}
        {offer && <div className="checkout-layout">
            <div className="checkout-main">
                {loading && <div className="portal-loading" role="status">Checking your account…</div>}

                {!loading && !user && <section className="checkout-panel">
                    <h2>First, your Vibyra account</h2>
                    <p>Pro belongs to your account, so your tokens, projects and computers follow you to every device. It takes a minute.</p>
                    <div className="checkout-actions">
                        <a className="portal-button portal-button--primary" href={authPath("signup", "/checkout", here)} data-analytics-cta="checkout_signup">Create an account</a>
                        <a className="portal-button portal-button--secondary" href={authPath("login", "/checkout", here)} data-analytics-cta="checkout_login">I already have one</a>
                    </div>
                    <p className="checkout-fine">You’ll come straight back here with {offer.interval === "year" ? "Annual" : "Monthly"} still selected.</p>
                </section>}

                {!loading && user && !verified && <section className="checkout-panel">
                    <h2>Verify your email</h2>
                    <p>We sent a link to <strong>{user.email}</strong>. Open it, then come back to this page to continue.</p>
                    <div className="checkout-actions">
                        <button className="portal-button portal-button--primary" onClick={() => refresh().catch(() => {})}>I’ve verified it</button>
                        <button className="portal-button portal-button--secondary" disabled={resent} onClick={resend}>{resent ? "Link sent" : "Send the link again"}</button>
                    </div>
                    <button className="portal-link-button" onClick={switchAccount}>Use a different account</button>
                </section>}

                {!loading && verified && <section className="checkout-panel">
                    <div className="checkout-account">
                        <span className="checkout-avatar" aria-hidden="true">{(user.name || user.email || "?").trim().charAt(0).toUpperCase()}</span>
                        <div><p>Buying as</p><strong>{user.email}</strong></div>
                        <button className="portal-link-button" onClick={switchAccount}>Not you?</button>
                    </div>

                    <h2>Choose how you pay</h2>
                    <div className="checkout-cycles" role="radiogroup" aria-label="Billing period">
                        {pro.map(o => {
                            const yearly = o.interval === "year";
                            const saving = yearly && monthly ? monthly.pence * 12 - o.pence : 0;
                            return <label key={o.offerKey} className={`checkout-cycle ${o.offerKey === offer.offerKey ? "is-selected" : ""}`}>
                                <input type="radio" name="cycle" id={`cycle-${o.offerKey}`} checked={o.offerKey === offer.offerKey} onChange={() => choose(o.offerKey)} />
                                <span className="checkout-cycle-name">{yearly ? "Annual" : "Monthly"}{saving > 0 && <em>Save {money(saving)}</em>}</span>
                                <span className="checkout-cycle-price"><strong>{money(yearly ? Math.round(o.pence / 12) : o.pence)}</strong> / month</span>
                                <span className="checkout-cycle-note">{yearly ? `${money(o.pence)} billed yearly · ${o.credits.toLocaleString("en-GB")} tokens up front` : `Billed monthly · ${o.credits} tokens a month`}</span>
                            </label>;
                        })}
                    </div>

                    <h2 className="checkout-included-title">What you get</h2>
                    <ul className="checkout-included">{INCLUDED.map(text => <li key={text}>{text}</li>)}</ul>

                    {alreadyPro && <Notice>You already have Vibyra Pro on this account. <a href="/billing">Manage your membership</a></Notice>}
                    {legacy && <Notice>This account keeps its original billing terms. Contact support@vibyra.app to move to Pro.</Notice>}
                    {mismatch && <Notice tone="error">This browser is signed in to a different account from the app that opened this purchase. Switch accounts to continue.</Notice>}
                    {!offer.stripeEnabled && !alreadyPro && <Notice>Pro isn’t on sale on the website yet. You can review everything here; payment opens soon.</Notice>}

                    <button className="portal-button portal-button--primary checkout-pay" data-analytics-cta="checkout_pay"
                        disabled={busy || alreadyPro || legacy || mismatch || !offer.stripeEnabled} onClick={pay}>
                        {busy ? "Opening secure payment…" : `Continue to payment · ${money(offer.pence)}`}
                    </button>
                    <p className="checkout-fine">You’ll pay on Stripe’s secure page. By continuing you agree to the <a href="/legal/terms">Terms</a>. Pro renews every {offer.interval === "year" ? "year" : "month"} until you cancel, and you can cancel any time from your account.</p>
                </section>}
            </div>
            <Summary offer={offer} monthly={monthly} />
        </div>}
    </PortalShell>;
}
