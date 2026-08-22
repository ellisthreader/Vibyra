import React from "react";

function pounds(pence) {
  const value = Number(pence ?? 0) / 100;
  return `£${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export default function PlanCard({ plan, cycle, current, selected, busy, onChoose }) {
  const annual = cycle === "annual";
  const total = annual ? plan.annualPricePence : plan.monthlyPricePence;
  const display = annual ? Math.round(total / 12) : total;
  const credits = annual ? (plan.annualCredits ?? plan.monthlyCredits) : plan.monthlyCredits;
  return (
    <article className={`plan-card ${plan.key === "builder" ? "plan-card--featured" : ""} ${selected ? "plan-card--selected" : ""}`}>
      <div className="plan-card__topline">
        <h2>{plan.label}</h2>
        {plan.key === "builder" && <span>Most popular</span>}
      </div>
      <p className="plan-card__price">{pounds(display)}<span>/month</span></p>
      {annual && total > 0 && <p className="plan-card__annual">{pounds(total)} billed yearly</p>}
      <ul>
        <li>{Number(credits ?? 0).toLocaleString()} credits each month</li>
        <li>{plan.maxActiveProjects} active {plan.maxActiveProjects === 1 ? "project" : "projects"}</li>
        <li>{plan.maxConcurrentAgents > 0 ? `${plan.maxConcurrentAgents} concurrent agents` : "Explore the Vibyra workflow"}</li>
      </ul>
      <button className={`portal-button ${plan.key === "builder" ? "portal-button--primary" : "portal-button--secondary"}`} disabled={busy || current} onClick={() => onChoose(plan)}>
        {current ? "Current membership" : plan.key === "free" ? "Create free account" : `Choose ${plan.label}`}
      </button>
    </article>
  );
}
