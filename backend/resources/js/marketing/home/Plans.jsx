import React, { useEffect, useState } from "react";
import { Icon } from "./shared.jsx";
import ProDiamond from "./ProDiamond.jsx";

// Owner's plan split (2026-09-28). Keep in step with CheckoutPage.jsx,
// BillingPage.jsx and resources/knowledge/website-faq.md.
const FREE_PERKS = topUpFrom => [
    ["The full desktop app", " with Preview and Review"],
    ["Unlimited terminals", ", side by side"],
    ["Unlimited projects", " on your computer"],
    ["Every OpenRouter model", " with Vibyra tokens"],
    ["Top up", topUpFrom ? ` from ${topUpFrom}, whenever you like` : " whenever you like"],
];
const FREE_MISSING = ["Your own Claude, ChatGPT or Gemini accounts", "Vibyra Cloud on your iPhone"];
const PRO_PERKS = [
    ["The full Vibyra ecosystem", " on Mac and iPhone"],
    ["Your own AI accounts", ": Claude, ChatGPT and Gemini"],
    ["Vibyra Cloud", ": reach your computer from anywhere"],
    ["Agents", " that keep working while you’re away"],
    ["Vibyra AI", " built into every project"],
    ["Tokens that never expire", ", even if you cancel"],
];

export default function Plans() {
    const [catalogue, setCatalogue] = useState(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setError(false); setCatalogue(null);
        const timeout = setTimeout(() => controller.abort(), 12000);
        fetch("/api/billing/catalogue?version=2", { signal: controller.signal, headers: { Accept: "application/json" } })
            .then(r => { if (!r.ok) throw new Error("Prices unavailable"); return r.json(); })
            .then(data => {
                const pro = data.offers?.find(o => o.offerKey === "pro_monthly");
                if (data.version !== 2 || !pro || !Number.isSafeInteger(pro.pence) || pro.pence <= 0 || !Number.isSafeInteger(pro.credits) || pro.credits <= 0)
                    throw new Error("Invalid catalogue");
                if (active) setCatalogue(data);
            }).catch(() => { if (active) setError(true); }).finally(() => clearTimeout(timeout));
        return () => { active = false; controller.abort(); clearTimeout(timeout); };
    }, [attempt]);
    const monthly = catalogue?.offers.find(o => o.offerKey === "pro_monthly");
    const annual = catalogue?.offers.find(o => o.offerKey === "pro_annual" && o.interval === "year" && Number.isSafeInteger(o.pence) && o.pence > 0);
    const [cycle, setCycle] = useState("annual");
    const plan = cycle === "annual" && annual ? annual : monthly;
    const money = p => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
    const saving = annual && monthly ? monthly.pence * 12 - annual.pence : 0;
    const savePercent = saving > 0 ? Math.round(saving / (monthly.pence * 12) * 100) : 0;
    const topUp = catalogue?.offers.filter(o => o.kind === "topup" && Number.isSafeInteger(o.pence)).sort((x, y) => x.pence - y.pence)[0];
    const freePerks = FREE_PERKS(topUp && money(topUp.pence));
    const Ticks = ({ items, lead, missing = [] }) => <div className="plan-list">
        {lead && <p className="plan-list-lead">{lead}</p>}
        <ul className="plan-ticks">{items.map(([bold, rest]) => <li key={bold}><Icon name="check" size={14} /><span><strong>{bold}</strong>{rest}</span></li>)}</ul>
        {missing.length > 0 && <ul className="plan-ticks plan-missing" aria-label="Not included">{missing.map(text => <li key={text}><Icon name="close" size={14} /><span>{text}</span></li>)}</ul>}
    </div>;
    const yearly = plan === annual;
    return <section className="pricing-section section-space" id="pricing" aria-labelledby="pricing-title">
        <div className="page-width pricing-layout">
            <header className="home-section-heading">
                <h2 id="pricing-title">More room for your ideas.</h2>
                <p>Start building for free. Go Pro for the whole Vibyra ecosystem.</p>
            </header>
            {!catalogue && !error && <div className="pricing-loading" role="status">Loading current plans…</div>}
            {error && <div className="pricing-error" role="alert"><p>We couldn’t load the current plans. Please try again.</p><button className="action action-secondary" onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
            {plan && annual && <div className="plan-cycle" role="group" aria-label="Billing period">
                <button type="button" aria-pressed={!yearly} onClick={() => setCycle("monthly")}>Monthly</button>
                <button type="button" aria-pressed={yearly} onClick={() => setCycle("annual")}>Annual{savePercent > 0 && <span>Save {savePercent}%</span>}</button>
            </div>}
            {plan && <div className="plan-grid">
                <article className="plan-card plan-free" aria-label="Free">
                    <div className="plan-top"><div><h3>Free</h3><p className="plan-for">Everything you need to start building.</p></div></div>
                    <p className="plan-price"><strong>£0</strong><span>/ month</span></p>
                    <p className="plan-billing">Free for as long as you like</p>
                    <p className="plan-tokens"><strong>{catalogue.free.tokens} tokens</strong> a month on eligible pilot accounts</p>
                    <Ticks items={freePerks} missing={FREE_MISSING} />
                    <a className="plan-cta plan-cta-free" href="/signup?next=/account" data-analytics-cta="plans_signup">Start free</a>
                </article>
                <article className="plan-card plan-pro" aria-label="Vibyra Pro">
                    <div className="plan-top"><div><h3>Vibyra Pro</h3><p className="plan-for">The whole Vibyra ecosystem.</p></div><ProDiamond /></div>
                    <p className="plan-price"><strong>{money(yearly ? Math.round(plan.pence / 12) : plan.pence)}</strong><span>/ month</span></p>
                    <p className="plan-billing">{yearly ? <>{money(plan.pence)} billed once a year{saving > 0 && <> · <b>save {money(saving)}</b></>}</> : "Billed monthly"}</p>
                    <p className="plan-tokens">{yearly
                        ? <><strong>{plan.credits.toLocaleString("en-GB")} tokens</strong> up front each year</>
                        : <><strong>{plan.credits} tokens</strong> every month</>}</p>
                    <Ticks items={PRO_PERKS} lead="Everything in Free, plus" />
                    <a className="plan-cta pro-buy" href={`/checkout?offer=${plan.offerKey}&version=${plan.offerVersion}`} data-analytics-cta="plans_buy">Continue with Pro</a>
                </article>
            </div>}
            {plan && <p className="pro-guarantee"><Icon name="shield" size={16} /><span><strong>14-day money-back guarantee on Pro.</strong> Not for you? We’ll refund your first payment.</span></p>}
            {plan && <p className="pro-terms">GBP, taxes included. Pro renews {annual ? "monthly or yearly" : "monthly"} until cancelled. Remote access needs your computer on and online; the iPhone app is in development. <a href="/legal/terms">Terms</a></p>}
        </div>
    </section>;
}
