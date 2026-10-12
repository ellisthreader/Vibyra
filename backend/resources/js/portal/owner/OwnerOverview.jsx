import React from "react";
import { Metric, Panel, Facts } from "./OwnerPrimitives.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import OwnerIcon from "./OwnerIcon.jsx";
import { formatCount } from "./format.js";
import { planCount, downloadCoverage, recent } from "./ownerData.js";

export default function OwnerOverview({ data, navigate }) {
  const { accounts = {}, operations = {}, website = {}, ai = {} } = data.overview || {};
  const plans = data.breakdowns?.memberships;
  return <div className="od-flow">
    <div className="od-metrics">
      <Metric label="New registrations" value={operations.new_registered} scope="In this period" note="Across Vibyra" onClick={() => navigate("users")} />
      <Metric label="Downloads" value={website.downloads} scope="In this period" note="Download responses" onClick={() => navigate("downloads")} />
      <Metric label="Website checkouts" value={website.verified_purchases} scope="In this period" note="Recorded completions" onClick={() => navigate("memberships")} />
      <Metric label="Pro accounts" value={planCount(plans, "pro")} scope="Current total" note="All Pro account types" onClick={() => navigate("memberships")} />
    </div>
    <div className="od-overview-grid">
      <OwnerTrend title="Download activity" rows={data.series?.website} primary={{ key: "downloads", label: "Downloads" }} note={downloadCoverage(data)} />
      <Panel title="Your accounts" subtitle="Current account records" action={<button className="od-link" onClick={() => navigate("users")}>View users <OwnerIcon name="arrow" /></button>}>
        <div className="od-account-total"><strong>{formatCount(accounts.registered)}</strong><span>registered accounts</span></div>
        <Facts rows={[["Free accounts", formatCount(planCount(plans, "free"))], ["Pro accounts", formatCount(planCount(plans, "pro"))], ["Guest accounts", formatCount(accounts.guests)]]} />
        <p className="od-note">Pro is an account status. It does not establish a paid subscription.</p>
      </Panel>
    </div>
    <div className="od-grid-two">
      <Panel title="App activity" subtitle="Recorded sessions and cloud use">
        <div className="od-activity-list">{[["desktop", "Desktop"], ["mobile", "Mobile"], ["cloud", "Cloud AI"]].map(([key, label]) =>
          <button key={key} onClick={() => navigate("usage", key)}><span className="od-app-icon"><OwnerIcon name="usage" /></span>
            <span><strong>{label}</strong><small>{key === "cloud" ? "Distinct accounts in this period" : "Consented accounts or sessions"}</small></span>
            <b>{formatCount(key === "cloud" ? operations.cloud_users : data.overview?.[key]?.active_users)}</b><OwnerIcon name="arrow" /></button>)}</div>
      </Panel>
      <Panel title="Worth knowing" action={<button className="od-link" onClick={() => navigate("tracking")}>Tracking details <OwnerIcon name="arrow" /></button>}>
        <ul className="od-notes">
          {["website", "desktop", "mobile"].map(surface => <li key={surface}><span>{surface[0].toUpperCase() + surface.slice(1)}</span><strong>{recent(data.data_quality?.last_event_by_surface?.[surface])}</strong></li>)}
          {Number(ai.failed_turns) > 0 && <li><span>Cloud AI</span><strong>{formatCount(ai.failed_turns)} failed requests in this period</strong></li>}
        </ul>
        <p className="od-note">Last received activity is separate from the report refresh time.</p>
      </Panel>
    </div>
  </div>;
}
