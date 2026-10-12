import React from "react";
import { Metric, Panel, Breakdown, Details, Empty } from "./OwnerPrimitives.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { formatCount } from "./format.js";

const percent = (part, whole) => part == null || !Number(whole) ? "—" : Math.round(Number(part) / Number(whole) * 100) + "%";
const PERFORMANCE = {
  ttfb: ["Server response", "under 800 ms"],
  lcp: ["Main content appears", "under 2.5 s"],
  inp: ["Interaction response", "under 200 ms"],
  cls: ["Layout stability", "under 0.1"],
};
export function WebsiteJourneys({ data }) {
  const website = data.overview?.website || {};
  const funnels = data.breakdowns?.website_funnels;
  return <div className="od-flow">
    <div className="od-metrics od-metrics-three">
      <Metric label="Website signups" value={website.signups} scope="Selected period" note="Website records only" />
      <Metric label="Phone waitlist" value={website.waitlist_signups} scope="Selected period" note="New recorded addresses" />
      <Metric label="Download clicks" value={website.download_clicks} scope="Selected period" note="Consented button clicks" />
    </div>
    <Panel title="From visit to completed action" subtitle="Only ordered steps in the same consented browser session">
      {!funnels?.length ? <Empty title="No journey data available" /> : <div className="od-funnels">{funnels.map(row =>
        <section key={row.name}><h3>{row.name}</h3><p className="od-note">{formatCount(row.visited)} eligible browser sessions</p>
          <ol>{[["Visited", row.visited], ["Started", row.started], ["Completed", row.completed]].map(([name, value]) =>
            <li key={name}><span>{name}</span><strong>{formatCount(value)}</strong></li>)}</ol>
          <p className="od-note"><strong>{percent(row.completed, row.visited)}</strong> visit to completion</p>
        </section>)}</div>}
    </Panel>
    <Breakdown title="Download clicks by platform" rows={data.breakdowns?.website_download_clicks} labelKey="platform" />
    <Details><p>Website signup records are different from registrations across Vibyra. Signups and waitlist totals can include people who declined analytics. Funnels require consent and ordered events in one browser session.</p><p>Download clicks, consented journey completions and all download responses measure different steps and populations.</p></Details>
  </div>;
}
export function WebsiteExperience({ data }) {
  const rows = data.breakdowns || {};
  return <div className="od-flow">
    <Panel title="Page experience" subtitle="Share of recorded samples within the target">
      {!rows.website_performance?.length ? <Empty title="No performance samples yet">Missing samples do not establish slow pages.</Empty>
        : <div className="od-table-scroll" role="region" aria-label="Page experience" tabIndex="0"><table><thead><tr><th>Measure</th><th>Within target</th><th>Samples</th></tr></thead>
          <tbody>{rows.website_performance.map(row => <tr key={row.metric}><th scope="row">{PERFORMANCE[row.metric]?.[0] || row.metric}<small>{PERFORMANCE[row.metric]?.[1]}</small></th>
            <td>{percent(row.good, row.samples)}</td><td>{formatCount(row.samples)}</td></tr>)}</tbody></table></div>}
    </Panel>
    <div className="od-grid-two">
      <Breakdown title="Captured browser errors" rows={rows.website_errors} labelKey="category" empty="No browser errors captured in this period." />
      <Breakdown title="Devices" rows={rows.website_devices} />
      <Breakdown title="Browsers" rows={rows.website_browsers} />
      <Breakdown title="Countries" rows={rows.website_countries} labelKey="country" empty="No country with five sessions yet." />
      <Breakdown title="Regions" rows={rows.website_regions} labelKey="region" empty="No region with five sessions yet." />
    </div>
    <OwnerTrend title="Recorded website issues" rows={data.series?.website} primary={{ key: "errors", label: "Errors" }} secondary={{ key: "slow_loads", label: "Slow content loads" }} />
    <Details><p>Browser estimates cover supported browsers with analytics enabled. Countries and regions are approximate. Small location groups are omitted; no captured errors does not prove every visit was error-free.</p></Details>
  </div>;
}
