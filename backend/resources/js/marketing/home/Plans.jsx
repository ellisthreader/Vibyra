import React, { useEffect, useState } from "react";
import { Icon } from "./shared.jsx";

/* Pricing follows the iPhone app's paywall (mobile/src/vibes/UpgradePage.tsx):
 * one membership, Vibyra Pro, in two sizes — "10×" (the builder product) and
 * "20×" (the pro product) — opening on the top one. Free is a single line under
 * it. Every figure comes from /api/billing/plans; nothing is invented if it fails. */
const sizes = [
    { key: "builder", label: "10×" },
    { key: "pro", label: "20×" },
];
const validPlan = (plan) =>
    typeof plan?.key === "string" &&
    [plan.monthlyPricePence, plan.annualPricePence, plan.monthlyCredits, plan.maxActiveProjects, plan.maxConcurrentAgents]
        .every((value) => Number.isFinite(value) && value >= 0);

const money = (pence) =>
    new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(pence / 100);
const count = (value) => value.toLocaleString("en-GB");

function usePlans(attempt) {
    const [plans, setPlans] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setError(false);
        const timeout = setTimeout(() => controller.abort(), 12000);
        fetch("/api/billing/plans", { signal: controller.signal, headers: { Accept: "application/json" } })
            .then((response) => {
                if (!response.ok) throw new Error("Plans unavailable");
                return response.json();
            })
            .then((data) => {
                const byKey = Object.fromEntries((data.plans ?? []).filter(validPlan).map((plan) => [plan.key, plan]));
                if (!data.ok || data.currency !== "gbp" || !["free", "builder", "pro"].every((key) => byKey[key]))
                    throw new Error("Invalid catalogue");
                if (active) setPlans(byKey);
            })
            .catch(() => {
                if (active) setError(true);
            })
            .finally(() => clearTimeout(timeout));
        return () => {
            active = false;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [attempt]);
    return { plans, error };
}

export default function Plans() {
    const [size, setSize] = useState("pro");
    const [attempt, setAttempt] = useState(0);
    const { plans, error } = usePlans(attempt);
    const plan = plans?.[size];
    const label = sizes.find((entry) => entry.key === size).label;
    return (
        <section className="pricing-section section-space" id="pricing" aria-labelledby="pricing-title">
            <div className="page-width">
                <div className="pricing-heading home-section-heading">
                    <h2 id="pricing-title">One plan. <span>Pick your size.</span></h2>
                </div>
                {!plans && !error && (
                    <div className="pricing-loading" role="status"><i aria-hidden="true" />Loading current plans…</div>
                )}
                {error && (
                    <div className="pricing-error" role="alert">
                        <p>We couldn’t load the current plans. Please try again.</p>
                        <button className="action action-secondary" onClick={() => setAttempt(attempt + 1)}>
                            Retry
                        </button>
                    </div>
                )}
                {plan && (
                    <article className="plan-card plan-pro" aria-label="Vibyra Pro">
                        <img className="pro-gem" src="/media/marketing/vibyra-pro.png" alt="" width="649" height="768" loading="lazy" />
                        <h3>Vibyra Pro</h3>
                        <div className="pro-sizes" role="group" aria-label="Size of Pro" data-size={size}>
                            <i aria-hidden="true" />
                            {sizes.map(({ key, label: name }) => (
                                <button key={key} type="button" aria-pressed={size === key} onClick={() => setSize(key)}>{name}</button>
                            ))}
                        </div>
                        <p className="plan-price">
                            <strong key={size}>{money(plan.monthlyPricePence)}</strong>
                            <span>/ month</span>
                        </p>
                        <ul>
                            <li><Icon name="check" size={16} /><span><strong>{count(plan.monthlyCredits)}</strong> Vibes every month</span></li>
                            {plan.dailyCreditCap > 0 && <li><Icon name="check" size={16} /><span>Up to <strong>{count(plan.dailyCreditCap)}</strong> Vibes a day</span></li>}
                            <li><Icon name="check" size={16} /><span><strong>{plan.maxActiveProjects}</strong> projects at a time</span></li>
                            <li><Icon name="check" size={16} /><span><strong>{plan.maxConcurrentAgents}</strong> cloud agents at once</span></li>
                            <li><Icon name="check" size={16} /><span>Every model, premium included</span></li>
                            <li><Icon name="check" size={16} /><span>Project-aware AI chat</span></li>
                            <li><Icon name="check" size={16} /><span>Unused paid Vibes roll over</span></li>
                            <li><Icon name="check" size={16} /><span>All Pro features included</span></li>
                        </ul>
                        <a className="pro-buy" href={`/billing?plan=${size}&cycle=monthly`} data-analytics-cta="plans_buy">
                            Get Pro {label}
                        </a>
                        <p className="pro-free">
                            Or <a href="/signup?next=/account" data-analytics-cta="plans_signup">start free</a> with {count(plans.free.monthlyCredits)} Vibes a month.
                        </p>
                    </article>
                )}
            </div>
        </section>
    );
}
