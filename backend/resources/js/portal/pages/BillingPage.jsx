import React, { useEffect, useMemo, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import PlanCard from "../components/PlanCard.jsx";
import { portalApi } from "../api.js";
import { authPath, go, purchaseIntent } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function BillingPage() {
  const intent = purchaseIntent();
  const { user, loading } = useWebsiteSession();
  const [cycle, setCycle] = useState(intent.cycle);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [busyPlan, setBusyPlan] = useState("");

  useEffect(() => {
    portalApi.plans().then((data) => setPlans(data.plans ?? [])).catch((caught) => setError(caught.message));
  }, []);

  const orderedPlans = useMemo(() => {
    const order = ["free", "starter", "builder", "pro"];
    return [...plans].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [plans]);

  const choose = async (plan) => {
    const chosenIntent = { plan: plan.key === "free" ? "" : plan.key, cycle };
    if (!user) {
      go(authPath("signup", "/billing", chosenIntent));
      return;
    }
    if (plan.key === "free") return;
    setBusyPlan(plan.key);
    setError("");
    try {
      const payload = await portalApi.checkout(plan.key, cycle);
      if (!payload.url) throw new Error("Stripe Checkout did not return a secure payment link.");
      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught.message);
      setBusyPlan("");
    }
  };

  return (
    <PortalShell eyebrow="Membership" title="Choose how you build" intro="Vibyra Desktop is free to download. Membership adds more credits, projects, and concurrent AI agents.">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="billing-toolbar" role="group" aria-label="Billing period">
        {["monthly", "annual"].map((value) => <button key={value} aria-pressed={cycle === value} onClick={() => setCycle(value)}>{value}</button>)}
      </div>
      <div className="plan-grid" aria-busy={!plans.length && !error}>
        {orderedPlans.filter((plan) => plan.key !== "free" || !user || user.plan === "free").map((plan) => <PlanCard key={plan.key} plan={plan} cycle={cycle} current={!loading && user?.plan === plan.key} selected={intent.plan === plan.key} busy={Boolean(busyPlan)} onChoose={choose} />)}
      </div>
      <p className="billing-footnote">Prices are in GBP and include VAT. Annual memberships are billed yearly. Cancelled memberships retain access until their paid-through date.</p>
    </PortalShell>
  );
}
