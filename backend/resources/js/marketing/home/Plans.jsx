import React, { useEffect, useState } from "react";
import { Icon } from "./shared.jsx";
import ProDiamond from "./ProDiamond.jsx";

// Released desktop entitlements. Keep in step with CheckoutPage.jsx,
// BillingPage.jsx, config/vibes.php and resources/knowledge/website-faq.md.
const FREE_PERKS = freeTokens => ["One project", "two terminals", ...(freeTokens > 0 ? [`${freeTokens} AI tokens a month`] : []), "your own AI accounts"];
const PRO_TOOLS = [["eye", "Live Preview"], ["review", "Code review"], ["mic", "Voice"], ["capture", "Screenshots"], ["branch", "Worktrees"], ["link", "Accounts"]];
const PRO_EXTRAS = [["Unlimited", "projects and terminals"], ["Every model", "including Opus 5.5 and GPT-6"], ["Never expire", "paid tokens, even if you cancel"]];

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
    const yearly = plan === annual;
    const period = yearly ? "year" : "month";
    const freeTokens = Number.isSafeInteger(catalogue?.free?.tokens) ? catalogue.free.tokens : 0;
    return <section className="pricing-section section-space" id="pricing" aria-labelledby="pricing-title">
        <div className="page-width pricing-layout">
            <header className="home-section-heading">
                <h2 id="pricing-title">More room for your ideas.</h2>
                <p>Start building for free. Go Pro for remote access, every AI model and the full Vibyra ecosystem.</p>
            </header>
            {!catalogue && !error && <div className="pricing-loading" role="status">Loading current plans…</div>}
            {error && <div className="pricing-error" role="alert"><p>We couldn’t load the current plans. Please try again.</p><button className="action action-secondary" onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
            {plan && annual && <div className="plan-cycle" role="group" aria-label="Billing period">
                <button type="button" aria-pressed={!yearly} onClick={() => setCycle("monthly")}>Monthly</button>
                <button type="button" aria-pressed={yearly} onClick={() => setCycle("annual")}>Annual{savePercent > 0 && <span>Save {savePercent}%</span>}</button>
            </div>}
            {plan && <div className="plan-stack">
                <article className="plan-split" aria-label="Vibyra Pro">
                    <div className="plan-offer">
                        <ProDiamond />
                        <h3>Vibyra Pro</h3>
                        <p className="plan-for">Build from anywhere, with the best AI.</p>
                        <p className="plan-price"><strong>{money(yearly ? Math.round(plan.pence / 12) : plan.pence)}</strong><span>/ month</span></p>
                        <p className="plan-billing">{yearly ? <>{money(plan.pence)} billed once a year{saving > 0 && <> · <b>save {money(saving)}</b></>}</> : "Billed monthly"}</p>
                        {plan.stripeEnabled === true
                            ? <a className="plan-buy" href={`/checkout?offer=${plan.offerKey}&version=${plan.offerVersion}`} data-analytics-cta="plans_buy">Continue with Pro</a>
                            : <><button type="button" className="plan-buy" disabled>Pro purchases opening soon</button><p className="plan-billing">Paid plans are not available yet.</p></>}
                        <p className="plan-assure"><Icon name="shield" size={16} />14-day money-back guarantee</p>
                    </div>
                    <div className="plan-included">
                        <div className="plan-band">
                            <p className="plan-band-label">Included with Pro</p>
                            <div className="plan-facts">
                                <div className="plan-fact">
                                    <img src="/media/marketing/pro-cloud.png" alt="" width="384" height="384" loading="lazy" />
                                    <div><b>Unlimited</b><strong>Remote access</strong><span>Reach your Mac from your iPhone, through the cloud.</span></div>
                                </div>
                                <div className="plan-fact">
                                    <img src="/media/marketing/pro-tokens.png" alt="" width="384" height="384" loading="lazy" />
                                    <div><b>{plan.credits.toLocaleString("en-GB")}</b><strong>AI tokens a {period}</strong><span>Spend them on any OpenRouter model you like, with no markup.</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="plan-band">
                            <div className="plan-eco-head">
                                <img src="/media/marketing/pro-ecosystem.png" alt="" width="384" height="384" loading="lazy" />
                                <div><b>The Vibyra ecosystem</b><span>Every tool, built into your workspace.</span></div>
                            </div>
                            <ul className="plan-tools">{PRO_TOOLS.map(([icon, label]) => <li key={label}><span><Icon name={icon} size={18} /></span>{label}</li>)}</ul>
                        </div>
                        <div className="plan-band">
                            <ul className="plan-extras">{PRO_EXTRAS.map(([bold, rest]) => <li key={bold}><b><Icon name="check" size={16} />{bold}</b>{rest}</li>)}</ul>
                        </div>
                    </div>
                </article>
                <aside className="plan-free" aria-label="Vibyra Free">
                    <h3>Not ready for Pro? <span>Start free.</span></h3>
                    <p>{FREE_PERKS(freeTokens).slice(0, -1).join(", ")} and {FREE_PERKS(freeTokens).at(-1)}. No card needed.</p>
                    <a className="plan-free-cta" href="/signup?next=/account" data-analytics-cta="plans_signup">Start free<Icon name="arrow" size={15} /></a>
                </aside>
            </div>}
            {plan && <p className="pro-terms">GBP, taxes included. Pro renews {annual ? "monthly or yearly" : "monthly"} until cancelled. Free AI tokens are for eligible pilot accounts and the included models. Remote access needs your Mac awake and running Vibyra; Live Preview streaming slows after 40 GB a month. <a href="/legal/terms">Terms</a></p>}
        </div>
    </section>;
}
