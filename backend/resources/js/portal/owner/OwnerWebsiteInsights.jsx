import React from "react";
import { OwnerBars } from "./OwnerMetric.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { formatCount, readableDimension } from "./format.js";

const labelled = (rows, key = "label") => (rows ?? []).map((row) => ({
  ...row, label: readableDimension(row[key]),
}));
const percent = (part, whole) => whole ? `${Math.round(part / whole * 100)}%` : "—";
const METRICS = {
  ttfb: ["Server response", "under 800 ms"],
  lcp: ["Main content", "under 2.5 s"],
  inp: ["Interaction delay", "under 200 ms"],
  cls: ["Layout stability", "under 0.1"],
};

function Funnels({ rows }) {
  return <section className="owner-panel owner-website-funnels">
    <div className="owner-panel__heading"><p className="owner-kicker">Conversion</p><h3>Visits to completed actions</h3></div>
    {rows?.length ? <div className="owner-website-funnels__list">{rows.map((row) => <div key={row.name}>
      <h4>{row.name}</h4><div className="owner-fact-list">
        <div><span>Visited</span><strong>{formatCount(row.visited)}</strong></div>
        <div><span>Started</span><strong>{formatCount(row.started)}</strong></div>
        <div><span>Completed after start</span><strong>{formatCount(row.completed)}</strong></div>
        <div><span>Visit to completion</span><strong>{percent(row.completed, row.visited)}</strong></div>
      </div>
    </div>)}</div> : <p className="owner-empty">No consented journeys in this period.</p>}
    <p className="owner-footnote">Ordered page views, server requests and completions in the same consented browser session. Browser clicks and form interactions are counted separately.</p>
  </section>;
}

function Performance({ rows }) {
  return <section className="owner-panel owner-website-performance">
    <div className="owner-panel__heading"><p className="owner-kicker">Experience</p><h3>Page performance</h3></div>
    {(rows ?? []).map((row) => <div className="owner-fact-list" key={row.metric}>
      <div><span>{METRICS[row.metric]?.[0] ?? row.metric} · {METRICS[row.metric]?.[1]}</span>
        <strong>{percent(row.good, row.samples)}</strong></div>
      <small>{formatCount(row.samples)} consented samples</small>
    </div>)}
    <p className="owner-footnote">Browser-supported estimates; a missing sample is unavailable, not slow.</p>
  </section>;
}

export default function OwnerWebsiteInsights({ data }) {
  const breakdowns = data.breakdowns ?? {};
  return <>
    <div className="owner-section-heading"><div><p className="owner-kicker">Discovery</p><h2>How visitors found Vibyra</h2></div></div>
    <div className="owner-duo">
      <OwnerBars title="Channels" rows={labelled(breakdowns.website_channels)} labelKey="label" empty="No source data yet." />
      <OwnerBars title="Sources" rows={labelled(breakdowns.website_sources)} labelKey="label" empty="No named sources yet." />
    </div>
    <div className="owner-duo">
      <OwnerBars title="Campaigns" rows={labelled(breakdowns.website_campaigns)} labelKey="label" empty="No campaign with five sessions yet." />
      <OwnerBars title="Referring sites" rows={labelled(breakdowns.website_referrers)} labelKey="label" empty="No referrer with five sessions yet." />
    </div>
    <div className="owner-duo">
      <OwnerBars title="Landing pages" rows={labelled(breakdowns.website_landing_pages)} labelKey="label" empty="No consented visits yet." />
      <OwnerBars title="Last viewed pages" rows={labelled(breakdowns.website_exit_pages)} labelKey="label" empty="No consented visits yet." />
    </div>
    <Funnels rows={breakdowns.website_funnels} />
    <section className="owner-panel owner-explainer"><p className="owner-kicker">Billing</p><h3>Verified website purchases</h3>
      <p>{formatCount(data.overview?.website?.verified_purchases)} completed Stripe checkouts in this period. This is a server-wide total; it is not joined to consented visitor sessions or a revenue figure.</p>
    </section>
    <div className="owner-section-heading"><div><p className="owner-kicker">Audience</p><h2>Where and how visitors browse</h2></div></div>
    <div className="owner-duo">
      <OwnerBars title="Devices" rows={labelled(breakdowns.website_devices)} labelKey="label" empty="No device data yet." />
      <OwnerBars title="Browsers" rows={labelled(breakdowns.website_browsers)} labelKey="label" empty="No browser data yet." />
    </div>
    <div className="owner-duo">
      <OwnerBars title="Countries" rows={labelled(breakdowns.website_countries, "country")} labelKey="label" empty="No country with five sessions yet." />
      <OwnerBars title="Regions" rows={labelled(breakdowns.website_regions, "region")} labelKey="label" empty="No region with five sessions yet." />
    </div>
    <div className="owner-section-heading"><div><p className="owner-kicker">Quality</p><h2>What visitors experienced</h2></div></div>
    <div className="owner-duo">
      <Performance rows={breakdowns.website_performance} />
      <OwnerBars title="Browser error categories" rows={labelled(breakdowns.website_errors, "category")}
        labelKey="label" empty="No captured browser errors in this period." />
    </div>
    <OwnerTrend rows={data.series?.website ?? []} primary={{ key: "errors", label: "Error events" }}
      secondary={{ key: "slow_loads", label: "Slow main-content loads" }} title="Website quality" />
  </>;
}
