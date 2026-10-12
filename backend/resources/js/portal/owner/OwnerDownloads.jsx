import React from "react";
import { Metric, Breakdown, Details } from "./OwnerPrimitives.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { downloadCoverage } from "./ownerData.js";

export default function OwnerDownloads({ data, navigate }) {
  return <div className="od-flow">
    <div className="od-download-intro"><Metric label="Recorded downloads" value={data.overview?.website?.downloads} scope="Selected period" note="Download responses; installations aren’t measured." />
      <p>See which platforms people choose.<br /><button className="od-link" onClick={() => navigate("website", "journeys")}>Explore the website download journey →</button></p></div>
    <OwnerTrend title="Downloads over time" rows={data.series?.website} primary={{ key: "downloads", label: "Download responses" }} note={downloadCoverage(data)} />
    <Breakdown title="Downloads by platform" rows={data.breakdowns?.downloads} labelKey="platform" empty="No platform downloads recorded in this period." />
    <Details><p>These figures count accepted file download responses, including repeated requests and some updater downloads. They do not confirm a completed transfer, installation or a unique person.</p><p>Website click and journey reports include only eligible sessions with analytics consent; their totals can differ from this page.</p></Details>
  </div>;
}
