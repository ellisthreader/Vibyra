import React from "react";
import OwnerMetric, { OwnerBars } from "./OwnerMetric.jsx";
import { formatCount, formatMoney, readableDimension } from "./format.js";

const SURFACES = ["website", "desktop", "mobile"];

function utc(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : `${date.toLocaleString("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  })} UTC`;
}

export function CommercialDetails({ data }) {
  const accounts = data.overview?.accounts ?? {};
  const ai = data.overview?.ai ?? {};
  const operations = data.overview?.operations ?? {};
  const memberships = (data.breakdowns?.memberships ?? []).map((row) => ({
    ...row, label: readableDimension(row.plan || "unknown"),
  }));
  const models = data.breakdowns?.prompt_models ?? [];

  return <div className="owner-flow">
    <div className="owner-metrics">
      <OwnerMetric label="Registered accounts" value={accounts.registered} note="Current accounts" accent />
      <OwnerMetric label="Guest accounts" value={accounts.guests} note="Current accounts" />
      <OwnerMetric label="Cloud AI users" value={operations.cloud_users} note="Distinct accounts this period" />
      <OwnerMetric label="Recorded AI spend" value={formatMoney(ai.spend_micro_usd)} note="Vibes provider cost · USD" money />
    </div>
    <div className="owner-duo">
      <OwnerBars title="Current membership mix" rows={memberships} labelKey="label"
        empty="Membership data is unavailable." />
      <OwnerBars title="Cloud models used" rows={models} labelKey="model"
        empty={data.data_quality?.cloud_turns_available ? "No cloud turns in this period." : "Cloud turn data is unavailable."} />
    </div>
    <section className="owner-panel owner-explainer"><p className="owner-kicker">Commercial definitions</p>
      <h3>What these figures cover</h3>
      <p>Memberships show account state now. Cloud AI users are accounts with a Vibes turn in the selected period; Desktop provider prompts are outside this count. AI spend is recorded provider cost. Revenue, refunds, profit, and completed installations require reconciled records and are unavailable here.</p>
    </section>
  </div>;
}

export function DataQualityDetails({ data }) {
  const quality = data.data_quality ?? {};
  const choices = quality.current_consent_choices;
  const lastCloudTurn = data.overview?.operations?.cloud_last_turn_at;
  return <div className="owner-flow">
    <div className="owner-metrics owner-metrics--quality">
      <OwnerMetric label="Source" value={quality.source === "production" ? "Production" : "Live service"} money accent />
      <OwnerMetric label="Snapshot captured" value={quality.captured_at ? utc(quality.captured_at) : "Live"} money note="UTC capture time" />
      <OwnerMetric label="Raw retention" value={quality.retention_days} note="Days before cleanup" />
      <OwnerMetric label="Cloud turns" value={quality.cloud_turns_available ? "Available" : "Unavailable"} money />
    </div>
    <section className="owner-panel owner-quality"><p className="owner-kicker">Operational source</p><h3>Vibes cloud</h3>
      <div className="owner-fact-list"><div><span>Last recorded turn</span><strong>{utc(lastCloudTurn)}</strong></div></div>
      <p className="owner-footnote">This server record is separate from optional website, Desktop, and Mobile product analytics.</p>
    </section>
    <div className="owner-section-heading"><div><p className="owner-kicker">Collection status</p>
      <h2>Freshness by surface</h2></div><span>Server receipt time · UTC</span></div>
    <div className="owner-trio">{SURFACES.map((surface) => {
      const first = quality.tracking_by_surface?.[surface];
      const last = quality.last_event_by_surface?.[surface];
      return <section className="owner-panel owner-quality" key={surface}>
        <p className="owner-kicker">{surface}</p><h3>{first ? "Collecting" : "No events yet"}</h3>
        <div className="owner-fact-list"><div><span>First recorded</span><strong>{utc(first)}</strong></div>
          <div><span>Last received</span><strong>{utc(last)}</strong></div></div>
      </section>;
    })}</div>
    <section className="owner-panel"><div className="owner-panel__heading"><p className="owner-kicker">Privacy coverage</p>
      <h3>Current consent choices</h3></div>
      {choices === null || choices === undefined ? <p className="owner-empty">Consent records are unavailable in this source.</p>
        : choices.length ? <div className="owner-quality-choices">{choices.map((row) =>
          <div key={`${row.surface}-${row.choice}`}><span>{readableDimension(row.surface)} · {readableDimension(row.choice)}</span>
            <strong>{formatCount(row.count)}</strong></div>)}</div>
          : <p className="owner-empty">No choices have been recorded yet.</p>}
      <p className="owner-footnote">These count consent records, not unique people. Usage charts cover only accepted choices; a declined choice does not generate product events.</p>
    </section>
  </div>;
}
