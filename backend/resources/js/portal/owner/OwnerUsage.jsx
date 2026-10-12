import React from "react";
import { Metric, Breakdown, Details } from "./OwnerPrimitives.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { minutes } from "./ownerData.js";
import { readableEvent, formatMoney } from "./format.js";

function CloudUsage({ data }) {
  const ai = data.overview?.ai || {};
  return <div className="od-flow">
    <div className="od-metrics">
      <Metric label="Cloud requests" value={ai.vibes_turns} scope="Selected period" note="Recorded Vibes requests" />
      <Metric label="Completed" value={ai.completed_turns} scope="Selected period" note="Successful requests" />
      <Metric label="Failed" value={ai.failed_turns} scope="Selected period" note="Recorded failures" />
      <Metric label="Provider cost" value={formatMoney(ai.spend_micro_usd)} text scope="Selected period · USD" note="Recorded cloud model cost" />
    </div>
    <OwnerTrend title="Cloud AI activity" rows={data.series?.cloud} primary={{ key: "turns", label: "Requests" }} secondary={{ key: "users", label: "Accounts" }} />
    <div className="od-grid-two">
      <Breakdown title="Models used" rows={data.breakdowns?.prompt_models} labelKey="model" />
      <Metric label="Accounts using Cloud AI" value={data.overview?.operations?.cloud_users} scope="Selected period" note="Distinct accounts with a Vibes request" />
    </div>
    <Details><p>These are Vibes cloud records. Prompts sent directly to desktop providers are outside these totals. Cost is recorded provider spend in USD, not revenue, profit or all company costs.</p></Details>
  </div>;
}
export default function OwnerUsage({ data, tab }) {
  if (tab === "cloud") return <CloudUsage data={data} />;
  const surface = tab === "mobile" ? "mobile" : "desktop";
  const title = surface === "mobile" ? "Mobile" : "Desktop";
  const usage = data.overview?.[surface] || {};
  const breaks = data.breakdowns || {};
  const events = breaks[surface + "_events"];
  const activity = events?.filter(row => !row.event.endsWith("_engagement_interval")).map(row => ({ ...row, label: readableEvent(row.event) }));
  const heartbeat = events?.filter(row => row.event.endsWith("_engagement_interval")).map(row => ({ ...row, label: "Engagement samples" }));
  return <div className="od-flow">
    <div className="od-metrics">
      <Metric label="Recorded sessions" value={usage.active_users} scope="Selected period" note="Consented accounts or sessions" />
      <Metric label="App opens" value={usage.app_opens} scope="Selected period" note={surface === "mobile" ? "Foreground sessions" : "Signed-in launches"} />
      <Metric label="Engaged minutes" value={minutes(usage.engaged_seconds)} scope="Selected period" note="Focused-use estimate" />
      <Metric label="Recently engaged" value={usage.recent_engaged_sessions_5m} scope="Last 5 minutes" note="Not a live connection count" />
    </div>
    <OwnerTrend title={title + " activity"} rows={data.series?.[surface]}
      primary={{ key: surface === "mobile" ? "chat_prompts" : "app_opens", label: surface === "mobile" ? "Chat prompts" : "App opens" }}
      secondary={{ key: surface === "mobile" ? "project_prompts" : "prompts_submitted", label: surface === "mobile" ? "Project prompts" : "Observed prompts" }} />
    <div className="od-grid-two">
      <Breakdown title="Feature activity" rows={activity} />
      <Breakdown title={surface === "mobile" ? "Popular screens" : "Operating systems"} rows={breaks[surface === "mobile" ? "mobile_screens" : "desktop_platforms"]} labelKey={surface === "mobile" ? "screen" : "platform"} />
    </div>
    <Details title="Providers, models and additional usage">
      <div className="od-grid-two">
        <Breakdown title="Models" rows={breaks.models?.filter(row => row.surface === surface)} labelKey="model" />
        {surface === "desktop" ? <>
          <Breakdown title="Prompt providers" rows={breaks.desktop_prompt_providers} labelKey="provider" />
          <Breakdown title="Terminal providers" rows={breaks.desktop_providers} labelKey="provider" />
          <Breakdown title="Project types" rows={breaks.desktop_project_kinds} labelKey="project_kind" />
          <Metric label="Projects created" value={usage.projects_created} scope="Selected period" note="Recorded project creations" />
          <Metric label="Observed prompts" value={usage.prompts_submitted} scope="Selected period" note="Supported send flows" />
        </> : <>
          <Breakdown title="Chat effort" rows={breaks.mobile_chat_efforts} labelKey="effort" />
          <Breakdown title="Platforms" rows={breaks.mobile_platforms} labelKey="platform" />
          <Breakdown title="Project providers" rows={breaks.mobile_project_providers} labelKey="provider" />
          <Metric label="Chat prompts" value={usage.chat_prompts} scope="Selected period" note="Recorded phone chat sends" />
          <Metric label="Project prompts" value={usage.project_prompts} scope="Selected period" note="Host conversation sends" />
        </>}
        <Breakdown title="Collection samples" rows={heartbeat} />
      </div>
    </Details>
    <p className="od-note">Activity combines consented linked accounts and unlinked app sessions. Older and offline clients may leave gaps. Direct terminal input is outside observed prompt counts.</p>
  </div>;
}
