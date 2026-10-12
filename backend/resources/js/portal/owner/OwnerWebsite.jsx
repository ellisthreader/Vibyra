import React from "react";
import { Metric, Breakdown, Details } from "./OwnerPrimitives.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { minutes } from "./ownerData.js";
import { WebsiteJourneys, WebsiteExperience } from "./OwnerWebsiteReports.jsx";

export default function OwnerWebsite({ data, tab }) {
  const website = data.overview?.website || {};
  const rows = data.breakdowns || {};
  if (tab === "journeys") return <WebsiteJourneys data={data} />;
  if (tab === "experience") return <WebsiteExperience data={data} />;
  if (tab === "sources") return <div className="od-flow">
    <p className="od-note">Sources describe browser sessions with analytics enabled. Small campaign and location groups are hidden.</p>
    <div className="od-grid-two">
      <Breakdown title="Channels" rows={rows.website_channels} />
      <Breakdown title="Referring sites" rows={rows.website_referrers} empty="No referring site with five sessions yet." />
      <Breakdown title="Named sources" rows={rows.website_sources} empty="No named source recorded." />
      <Breakdown title="Campaigns" rows={rows.website_campaigns} empty="No campaign with five sessions yet." />
      <Breakdown title="Landing pages" rows={rows.website_landing_pages} />
      <Breakdown title="Last viewed pages" rows={rows.website_exit_pages} />
    </div>
  </div>;
  return <div className="od-flow">
    <div className="od-metrics">
      <Metric label="Tracked visits" value={website.unique_visitors} scope="Selected period" note="Consented browser sessions" />
      <Metric label="Page views" value={website.page_views} scope="Selected period" note="Recorded page opens" />
      <Metric label="Recently engaged" value={website.recent_engaged_sessions_5m} scope="Last 5 minutes" note="Estimate, not online people" />
      <Metric label="Engaged minutes" value={minutes(website.engaged_seconds)} scope="Selected period" note="Focused, non-idle estimate" />
    </div>
    <OwnerTrend title="Website traffic" rows={data.series?.website} primary={{ key: "page_views", label: "Page views" }} secondary={{ key: "unique_visitors", label: "Sessions" }} />
    <div className="od-grid-two">
      <Breakdown title="Most viewed pages" rows={rows.website_pages} labelKey="path" />
      <Breakdown title="Tracked link clicks" rows={rows.website_ctas} labelKey="action" />
    </div>
    <Details><p>Visits count distinct browser sessions that allowed analytics, not unique people. Visitors who decline are outside these traffic figures. Known crawlers are excluded, but traffic remains approximate.</p></Details>
  </div>;
}
