import React from "react";
import { Panel, Facts, Details } from "./OwnerPrimitives.jsx";
import { formatCount, readableDimension } from "./format.js";
import { utc } from "./ownerData.js";

export default function OwnerTracking({ data }) {
  const quality = data.data_quality || {};
  const available = value => value == null ? "Not reported" : value ? "Available" : "Unavailable";
  const intake = quality.website_ingest_counts;
  return <div className="od-flow">
    <Panel title="Activity received" subtitle="Event receipt time is separate from the report refresh time. A quiet source does not by itself mean tracking has failed.">
      <div className="od-table-scroll" role="region" aria-label="Tracking sources" tabIndex="0"><table>
        <thead><tr><th>Source</th><th>Records</th><th>Latest activity (UTC)</th><th>Coverage</th></tr></thead>
        <tbody>{["website", "desktop", "mobile"].map(surface => <tr key={surface}>
          <th scope="row">{readableDimension(surface)}</th><td>{quality.tracking_by_surface == null ? "Not reported" : quality.tracking_by_surface[surface] ? "History available" : "No events yet"}</td>
          <td>{utc(quality.last_event_by_surface?.[surface])}</td><td>Analytics consent required</td>
        </tr>)}<tr><th scope="row">Cloud AI</th><td>{available(quality.cloud_turns_available)}</td><td>{utc(data.overview?.operations?.cloud_last_turn_at)}</td><td>Recorded Vibes requests</td></tr></tbody>
      </table></div>
    </Panel>
    <div className="od-grid-two">
      <Panel title="Report source"><Facts rows={[
        ["Source", quality.source === "production" ? "Production snapshot" : "Live service report"],
        ["Snapshot captured", quality.captured_at ? utc(quality.captured_at) : "Direct report"],
        ["Oldest retained event", utc(quality.tracking_started_at)],
        ["Raw event retention", quality.retention_days == null ? "Not reported" : quality.retention_days + " days"],
      ]} /></Panel>
      <Panel title="Website collection"><Facts rows={[
        ["Detailed reporting", available(quality.website_details_available)],
        ["Collection enabled", quality.website_ingestion_enabled == null ? "Not reported" : quality.website_ingestion_enabled ? "Yes" : "No"],
        ["Location database", available(quality.website_geo_available)],
        ["Latest browser error", utc(quality.website_last_error_at)],
      ]} /></Panel>
    </div>
    <Details title="Collection and privacy details">
      <Facts rows={[["Accepted requests · selected period", formatCount(intake?.accepted)], ["Rejected requests · selected period", formatCount(intake?.rejected)], ["Blocked requests · selected period", formatCount(intake?.blocked)]]} />
      <h3>Current consent choices</h3>
      {quality.current_consent_choices == null ? <p>Consent records are unavailable in this report.</p> : !quality.current_consent_choices.length ? <p>No consent choices recorded yet.</p>
        : <Facts rows={quality.current_consent_choices.map(row => [readableDimension(row.surface) + " · " + readableDimension(row.choice), formatCount(row.count)])} />}
      <p>These are consent records and collection requests, not unique people.</p>
      <h3>First activity received</h3><Facts rows={["website", "desktop", "mobile"].map(surface => [readableDimension(surface), utc(quality.tracking_by_surface?.[surface])])} />
    </Details>
    <Details title="Metric definitions and limitations">{(quality.notes || []).map(note => <p key={note}>{note}</p>)}</Details>
  </div>;
}
