import React from "react";
import { Metric, Breakdown, Panel, Details } from "./OwnerPrimitives.jsx";
import { planCount } from "./ownerData.js";

export default function OwnerMemberships({ data, navigate }) {
  const rows = data.breakdowns?.memberships;
  return <div className="od-flow">
    <div className="od-metrics od-metrics-three">
      <Metric label="Pro accounts" value={planCount(rows, "pro")} scope="Current total" note="Paid, granted or other Pro access" />
      <Metric label="Free accounts" value={planCount(rows, "free")} scope="Current total" note="Registered accounts on Free" />
      <Metric label="Website checkouts" value={data.overview?.website?.verified_purchases} scope="Selected period" note="Recorded website purchase events" />
    </div>
    <div className="od-grid-two">
      <Breakdown title="Current membership mix" rows={rows} labelKey="plan" empty="No membership breakdown available." />
      <Panel title="Give someone Pro" subtitle="Manage access you grant directly">
        <p className="od-body-copy">Create a license with a token allowance and an end date. Review existing licenses and see whether they have been claimed.</p>
        <button className="od-button od-primary" onClick={() => navigate("memberships", "licenses")}>Manage licenses →</button>
        <p className="od-note">Licenses grant access without a recurring payment.</p>
      </Panel>
    </div>
    <Details title="About memberships and purchases"><p>Plan counts describe current registered accounts. A Pro account does not by itself prove a payment or an active paid subscription.</p><p>Website checkouts count recorded website purchase events in the selected period. This report does not return individual payments, revenue, refunds, MRR or payment provenance.</p></Details>
  </div>;
}
