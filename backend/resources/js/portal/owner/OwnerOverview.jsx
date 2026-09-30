import React from "react";
import OwnerMetric, { OwnerBars } from "./OwnerMetric.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { formatCount, formatMoney } from "./format.js";

export default function OwnerOverview({ data, onSelect }) {
  const overview = data.overview ?? {};
  const accounts = overview.accounts ?? {};
  const website = overview.website ?? {};
  const desktop = overview.desktop ?? {};
  const mobile = overview.mobile ?? {};
  const ai = overview.ai ?? {};
  const operations = overview.operations ?? {};
  const series = data.series ?? {};
  const memberships = (data.breakdowns?.memberships ?? []).map((row) => ({ ...row, plan: row.plan?.replace(/^./, (letter) => letter.toUpperCase()) }));
  const cloudModels = data.breakdowns?.prompt_models ?? [];

  return <div className="owner-flow">
    <div className="owner-metrics owner-metrics--hero">
      <OwnerMetric label="Total accounts" value={accounts.total} note="Registered and guest" accent />
      <OwnerMetric label="New registrations" value={operations.new_registered} note="Registered in this period" />
      <OwnerMetric label="Cloud AI users" value={operations.cloud_users} note="Distinct accounts this period" />
      <OwnerMetric label="Cloud AI turns" value={ai.vibes_turns} note="Recorded in this period" />
    </div>

    <div className="owner-section-heading"><div><p className="owner-kicker">Production records</p><h2>Activity we can verify now</h2></div><span>Cloud service · UTC</span></div>
    <div className="owner-duo">
      <section className="owner-panel"><div className="owner-panel__heading"><p className="owner-kicker">Authenticated use</p><h3>Accounts with recent token use</h3></div>
        <div className="owner-fact-list"><div><span>Last 24 hours</span><strong>{formatCount(operations.accounts_used_24h)}</strong></div>
          <div><span>Last 7 days</span><strong>{formatCount(operations.accounts_used_7d)}</strong></div></div>
        <p className="owner-footnote">A token was used in that window. This does not identify the device or prove the account is online.</p>
      </section>
      <OwnerTrend rows={series.cloud ?? []} primary={{ key: "turns", label: "Turns" }}
        secondary={{ key: "users", label: "Accounts" }} title="Vibes cloud activity" />
    </div>

    <div className="owner-section-heading"><div><p className="owner-kicker">Product pulse</p><h2>Where people are active</h2></div><span>Selected period · UTC</span></div>
    <div className="owner-pulse-grid">
      <div className="owner-pulse"><button type="button" onClick={() => onSelect("website")}><span>01 / Website</span><span aria-hidden="true">↗</span></button>
        <strong>{formatCount(website.page_views)}</strong><small>Page views</small>
        <OwnerTrend rows={series.website ?? []} primary={{ key: "page_views", label: "Page views" }} title="Website activity" compact />
      </div>
      <div className="owner-pulse"><button type="button" onClick={() => onSelect("desktop")}><span>02 / Desktop</span><span aria-hidden="true">↗</span></button>
        <strong>{formatCount(desktop.active_users)}</strong><small>Active app sessions</small>
        <OwnerTrend rows={series.desktop ?? []} primary={{ key: "prompts_submitted", label: "Prompts" }} title="Desktop activity" color="violet" compact />
      </div>
      <div className="owner-pulse"><button type="button" onClick={() => onSelect("mobile")}><span>03 / Mobile</span><span aria-hidden="true">↗</span></button>
        <strong>{formatCount(mobile.active_users)}</strong><small>Active app sessions</small>
        <OwnerTrend rows={series.mobile ?? []} primary={{ key: "chat_prompts", label: "Chat prompts" }} title="Mobile activity" color="green" compact />
      </div>
    </div>

    <div className="owner-section-heading"><div><p className="owner-kicker">Business and AI</p><h2>Account health</h2></div></div>
    <div className="owner-duo">
      <section className="owner-panel"><div className="owner-panel__heading"><p className="owner-kicker">Accounts</p><h3>Membership and reach</h3></div>
        <div className="owner-fact-list">
          <div><span>Accounts with token use · 30d</span><strong>{formatCount(accounts.active_30d)}</strong></div>
          <div><span>Registered</span><strong>{formatCount(accounts.registered)}</strong></div>
          {accounts.guests !== null && accounts.guests !== undefined && <div><span>Guest accounts</span><strong>{formatCount(accounts.guests)}</strong></div>}
        </div>
      </section>
      <section className="owner-panel"><div className="owner-panel__heading"><p className="owner-kicker">AI service</p><h3>Recorded turns</h3></div>
        <div className="owner-fact-list">
          <div><span>Submitted</span><strong>{formatCount(ai.vibes_turns)}</strong></div>
          <div><span>Completed</span><strong>{formatCount(ai.completed_turns)}</strong></div>
          <div><span>Failed</span><strong>{formatCount(ai.failed_turns)}</strong></div>
          <div><span>Recorded model spend</span><strong>{formatMoney(ai.spend_micro_usd)}</strong></div>
        </div>
      </section>
    </div>
    <div className="owner-duo">
      <OwnerBars title="Membership mix" rows={memberships} labelKey="plan" empty="Membership data is not available yet." />
      <OwnerBars title="Cloud chat models" rows={cloudModels} labelKey="model" empty={data.data_quality?.cloud_turns_available ? "No cloud chat prompts in this period." : "Cloud turn data is unavailable on this deployment."} />
    </div>
  </div>;
}
