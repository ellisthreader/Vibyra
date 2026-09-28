import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button, Container, Eyebrow, Section, SectionTitle } from "./ui.jsx";
import { FadeUp } from "./motion.jsx";

const FALLBACK_PLANS = [
  { key: "free", label: "Free", monthlyPricePence: 0, annualPricePence: 0, monthlyCredits: 50, maxActiveProjects: 1 },
  { key: "starter", label: "Starter", monthlyPricePence: 2000, annualPricePence: 22500, monthlyCredits: 350, maxActiveProjects: 1 },
  { key: "builder", label: "Builder", monthlyPricePence: 4900, annualPricePence: 58500, monthlyCredits: 1000, maxActiveProjects: 3 },
  { key: "pro", label: "Pro", monthlyPricePence: 9900, annualPricePence: 117000, monthlyCredits: 2000, maxActiveProjects: 10 },
];

function formatPounds(pence) {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

function planPrice(plan, period) {
  return period === "annual"
    ? formatPounds(Math.round(plan.annualPricePence / 12))
    : formatPounds(plan.monthlyPricePence);
}

export default function Pricing() {
  const [period, setPeriod] = useState("monthly");
  const [apiPlans, setApiPlans] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/plans")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok && Array.isArray(data.plans) && data.plans.length) {
          setApiPlans(data.plans);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const plans = useMemo(() => {
    const order = ["free", "starter", "builder", "pro"];
    return [...(apiPlans ?? FALLBACK_PLANS)].sort(
      (first, second) => order.indexOf(first.key) - order.indexOf(second.key)
    );
  }, [apiPlans]);

  return (
    <Section id="pricing">
      <Container narrow>
        <FadeUp>
          <Eyebrow>Pricing</Eyebrow>
          <SectionTitle>Start free. Upgrade when needed.</SectionTitle>
        </FadeUp>
        <div className="inline-flex rounded-lg border border-line bg-surface p-1" aria-label="Billing period">
          {["monthly", "annual"].map((option) => (
            <button
              key={option}
              onClick={() => setPeriod(option)}
              aria-pressed={period === option}
              className={`rounded-md px-4 py-2 text-sm font-semibold capitalize ${
                period === option ? "bg-[#4667e8] text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Container>

      <Container className="mt-10 md:mt-12">
        <div className="overflow-hidden rounded-xl border border-line">
          {plans.map((plan) => {
            const featured = plan.key === "builder";
            return (
              <div
                key={plan.key}
                className={`grid gap-5 border-b border-line px-5 py-6 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center md:grid-cols-[1.1fr_1.5fr_auto_auto] md:px-7 ${
                  featured ? "bg-violet-soft" : "bg-surface"
                }`}
              >
                <div>
                  <h3 className="text-[17px] font-bold">{plan.label}</h3>
                  {featured && <p className="mt-1 text-xs font-semibold text-violet">Recommended</p>}
                </div>
                <p className="text-sm text-ink-muted">
                  {plan.monthlyCredits.toLocaleString()} credits · {plan.maxActiveProjects} {plan.maxActiveProjects === 1 ? "project" : "projects"}
                </p>
                <p className="whitespace-nowrap">
                  <motion.span
                    key={period}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="inline-block text-2xl font-bold tracking-tight"
                  >
                    {planPrice(plan, period)}
                  </motion.span>
                  <span className="ml-1 text-sm text-ink-muted">/month</span>
                </p>
                <Button
                  href={plan.key === "free" ? "/signup?next=/account" : `/billing?plan=${plan.key}&cycle=${period}`}
                  variant={featured ? "primary" : "ghost"}
                  small
                  className="w-full sm:w-auto"
                >
                  {plan.key === "free" ? "Start free" : "Choose"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-[13.5px] text-ink-muted">
          GBP, VAT included. Annual prices are shown per month and billed yearly.
        </p>
      </Container>
    </Section>
  );
}
