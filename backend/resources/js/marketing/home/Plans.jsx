import React, { useEffect, useState } from "react";
import { Action, Icon, SectionLabel } from "./shared.jsx";

const descriptions = {
    free: "A little room to get started.",
    starter: "For the first of many ideas.",
    builder: "For a few ideas in motion.",
    pro: "For your most ambitious work.",
};
const order = ["free", "starter", "builder", "pro"];
const validPlan = (plan) =>
    order.includes(plan.key) &&
    typeof plan.label === "string" &&
    [
        plan.monthlyPricePence,
        plan.annualPricePence,
        plan.monthlyCredits,
        plan.maxActiveProjects,
        plan.maxConcurrentAgents,
    ].every((value) => Number.isFinite(value) && value >= 0);

export default function Plans() {
    const [annual, setAnnual] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
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
                if (
                    !data.ok ||
                    data.currency !== "gbp" ||
                    !Array.isArray(data.plans) ||
                    data.plans.length !== 4 ||
                    !data.plans.every(validPlan) ||
                    new Set(data.plans.map((plan) => plan.key)).size !== 4
                )
                    throw new Error("Invalid catalogue");
                if (active)
                    setCatalog({
                        ...data,
                        plans: [...data.plans].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)),
                    });
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
    const money = (pence, decimals = false) =>
        new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            minimumFractionDigits: decimals ? 2 : 0,
            maximumFractionDigits: 2,
        }).format(pence / 100);
    return (
        <section className="pricing-section section-space" id="pricing" aria-labelledby="pricing-title">
            <div className="page-width">
                <SectionLabel number="04">ROOM FOR YOUR NEXT IDEA</SectionLabel>
                <div className="pricing-heading">
                    <h2 id="pricing-title">
                        Start curious.
                        <br />
                        <span>Build from there.</span>
                    </h2>
                    <div>
                        <p>
                            The desktop download is free.
                            <br />
                            Choose a plan for Vibyra’s cloud AI credits.
                        </p>
                        <div className="billing-switch" aria-label="Billing period">
                            <button aria-pressed={!annual} onClick={() => setAnnual(false)}>
                                Monthly
                            </button>
                            <button aria-pressed={annual} onClick={() => setAnnual(true)}>
                                Yearly
                                <Icon name="arrow" size={13} />
                            </button>
                        </div>
                    </div>
                </div>
                {!catalog && !error && (
                    <div className="pricing-loading" role="status">
                        Loading current plans…
                    </div>
                )}
                {error && (
                    <div className="pricing-error" role="alert">
                        <p>We couldn’t load the current plans. Please try again.</p>
                        <button className="action action-secondary" onClick={() => setAttempt(attempt + 1)}>
                            Retry
                            <Icon name="arrow" size={17} />
                        </button>
                    </div>
                )}
                {catalog && (
                    <div className="plan-grid" aria-live="polite">
                        {catalog.plans.map((plan) => {
                            const featured = plan.key === "builder";
                            const amount = annual ? plan.annualPricePence / 12 : plan.monthlyPricePence;
                            return (
                                <article
                                    className={`plan-card ${featured ? "plan-featured" : ""}`}
                                    key={plan.key}
                                >
                                    <div className="plan-name">
                                        <h3>{plan.label}</h3>
                                        {featured && <span>ROOM TO GROW</span>}
                                    </div>
                                    <p className="plan-description">{descriptions[plan.key]}</p>
                                    <p className="plan-price">
                                        {money(amount)}
                                        <span>/ month</span>
                                    </p>
                                    <p className="plan-period">
                                        {plan.key === "free"
                                            ? "No payment needed"
                                            : annual
                                              ? `${money(plan.annualPricePence)} billed yearly`
                                              : "Billed monthly"}
                                    </p>
                                    <Action
                                        href={
                                            plan.key === "free"
                                                ? "/signup?next=/account"
                                                : `/billing?plan=${plan.key}&cycle=${annual ? "annual" : "monthly"}`
                                        }
                                        secondary={!featured}
                                    >
                                        {plan.key === "free" ? "Start free" : `Choose ${plan.label}`}
                                    </Action>
                                    <ul>
                                        <li>
                                            <Icon name="check" size={16} />
                                            <span>
                                                <strong>{plan.monthlyCredits.toLocaleString("en-GB")}</strong>{" "}
                                                credits per month
                                            </span>
                                        </li>
                                        <li>
                                            <Icon name="check" size={16} />
                                            <span>
                                                <strong>{plan.maxActiveProjects}</strong> active{" "}
                                                {plan.maxActiveProjects === 1 ? "project" : "projects"}
                                            </span>
                                        </li>
                                        <li>
                                            <Icon name="check" size={16} />
                                            <span>
                                                {plan.maxConcurrentAgents > 0
                                                    ? `${plan.maxConcurrentAgents} concurrent cloud ${plan.maxConcurrentAgents === 1 ? "agent" : "agents"}`
                                                    : "Free & budget model access"}
                                            </span>
                                        </li>
                                        <li>
                                            <Icon name="check" size={16} />
                                            <span>Project-aware AI chat</span>
                                        </li>
                                    </ul>
                                </article>
                            );
                        })}
                    </div>
                )}
                <div className="pricing-notes">
                    <p>
                        {catalog
                            ? `Prices in GBP${catalog.vatInclusive ? ", VAT included" : ""}. Yearly plans show the monthly equivalent.`
                            : "Prices load directly from the current Vibyra catalogue."}
                    </p>
                    <p>
                        Connected CLI providers have their own accounts, plans, and usage limits.
                        <br />
                        Vibyra credits don’t include third-party subscriptions.
                    </p>
                </div>
            </div>
        </section>
    );
}
