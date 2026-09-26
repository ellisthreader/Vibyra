import React from "react";
import OwnerMetric, { OwnerBars } from "./OwnerMetric.jsx";
import OwnerTrend from "./OwnerTrend.jsx";
import { readableDimension, readableEvent } from "./format.js";

function labelled(rows, key) {
  return (rows ?? []).map((row) => ({ ...row, label: readableDimension(row[key]) }));
}

const minutes = (seconds) => seconds == null ? null : Math.round(Number(seconds) / 60);

function ModelBreakdown({ data, surface }) {
  const rows = (data.breakdowns?.models ?? []).filter((row) => row.surface === surface);
  return <OwnerBars title="Model usage" rows={rows} labelKey="model" empty="Model metadata will appear as new prompts arrive." />;
}

export function WebsiteDetails({ data }) {
  const website = data.overview?.website ?? {};
  const rows = labelled(data.breakdowns?.downloads, "platform");
  const clicks = labelled(data.breakdowns?.website_ctas, "action");
  const countries = labelled(data.breakdowns?.website_countries, "country");
  const pages = (data.breakdowns?.website_pages ?? []).map((row) => ({ ...row, label: row.path === "/" ? "Homepage" : row.path }));
  return <div className="owner-flow">
    <div className="owner-metrics owner-metrics--six">
      <OwnerMetric label="Page views" value={website.page_views} note="Pages opened" accent />
      <OwnerMetric label="Consented sessions" value={website.unique_visitors} note="Distinct website sessions" />
      <OwnerMetric label="Active · 5m" value={website.recent_engaged_sessions_5m} note="Recent engagement" />
      <OwnerMetric label="Signups" value={website.signups} note="Accounts created" />
      <OwnerMetric label="Downloads" value={website.downloads} note="Successful artifacts" />
      <OwnerMetric label="Engaged minutes" value={minutes(website.engaged_seconds)} note="Focused, non-idle estimate" />
    </div>
    <OwnerTrend rows={data.series?.website ?? []} primary={{ key: "page_views", label: "Page views" }} secondary={{ key: "unique_visitors", label: "Sessions" }} title="Website traffic" />
    <div className="owner-duo"><OwnerBars title="Downloads by platform" rows={rows} labelKey="label" empty="No successful downloads in this period." />
      <OwnerBars title="Most viewed pages" rows={pages} labelKey="label" empty="No page views in this period." /></div>
    <div className="owner-duo"><OwnerBars title="Named link clicks" rows={clicks} labelKey="label" empty="No consented link clicks in this period." />
      <OwnerBars title="Visitor countries" rows={countries} labelKey="label" empty="No country group with at least five consented sessions." /></div>
    <section className="owner-panel owner-explainer"><p className="owner-kicker">Reading the numbers</p><h3>From visit to download</h3>
        <p>Sessions, clicks and engaged time cover visitors who allowed analytics. Countries are approximate and groups smaller than five are hidden. Downloads count successful file responses, not installations. Signups and downloads may come from different sessions.</p>
    </section>
  </div>;
}

export function DesktopDetails({ data }) {
  const desktop = data.overview?.desktop ?? {};
  const events = (data.breakdowns?.desktop_events ?? []).map((row) => ({ ...row, label: readableEvent(row.event) }));
  const platforms = labelled(data.breakdowns?.desktop_platforms, "platform");
  const providers = labelled(data.breakdowns?.desktop_providers, "provider");
  const kinds = labelled(data.breakdowns?.desktop_project_kinds, "project_kind");
  const promptProviders = labelled(data.breakdowns?.desktop_prompt_providers, "provider");
  return <div className="owner-flow">
    <div className="owner-metrics owner-metrics--six">
      <OwnerMetric label="Active app sessions" value={desktop.active_users} note="Consented users or sessions" accent />
      <OwnerMetric label="Active · 5m" value={desktop.recent_engaged_sessions_5m} note="Recent engagement" />
      <OwnerMetric label="App opens" value={desktop.app_opens} note="Signed-in launches" />
      <OwnerMetric label="Projects created" value={desktop.projects_created} note="Recorded creations" />
      <OwnerMetric label="Prompts submitted" value={desktop.prompts_submitted} note="Supported send flows" />
      <OwnerMetric label="Engaged minutes" value={minutes(desktop.engaged_seconds)} note="Focused, non-idle estimate" />
    </div>
    <OwnerTrend rows={data.series?.desktop ?? []} primary={{ key: "prompts_submitted", label: "Prompts" }} secondary={{ key: "app_opens", label: "App opens" }} title="Desktop activity" color="violet" />
    <div className="owner-trio"><ModelBreakdown data={data} surface="desktop" /><OwnerBars title="Prompt providers" rows={promptProviders} labelKey="label" /><OwnerBars title="Recorded actions" rows={events} labelKey="label" /></div>
    <div className="owner-trio">
      <OwnerBars title="Operating systems" rows={platforms} labelKey="label" />
      <OwnerBars title="Terminal providers" rows={providers} labelKey="label" />
      <OwnerBars title="Project types" rows={kinds} labelKey="label" />
    </div>
    <p className="owner-footnote">Prompts are counted only when Vibyra observes a supported send. Commands typed directly into a terminal are outside this count.</p>
  </div>;
}

export function MobileDetails({ data }) {
  const mobile = data.overview?.mobile ?? {};
  const events = (data.breakdowns?.mobile_events ?? []).map((row) => ({ ...row, label: readableEvent(row.event) }));
  const platforms = labelled(data.breakdowns?.mobile_platforms, "platform");
  const screens = labelled(data.breakdowns?.mobile_screens, "screen");
  const providers = labelled(data.breakdowns?.mobile_project_providers, "provider");
  const efforts = labelled(data.breakdowns?.mobile_chat_efforts, "effort");
  return <div className="owner-flow">
    <div className="owner-metrics owner-metrics--six">
      <OwnerMetric label="Active app sessions" value={mobile.active_users} note="Consented users or sessions" accent />
      <OwnerMetric label="Active · 5m" value={mobile.recent_engaged_sessions_5m} note="Recent engagement" />
      <OwnerMetric label="App opens" value={mobile.app_opens} note="Foreground sessions" />
      <OwnerMetric label="Chat prompts" value={mobile.chat_prompts} note="Phone AI chat sends" />
      <OwnerMetric label="Project prompts" value={mobile.project_prompts} note="Host conversation sends" />
      <OwnerMetric label="Engaged minutes" value={minutes(mobile.engaged_seconds)} note="Foreground estimate" />
    </div>
    <OwnerTrend rows={data.series?.mobile ?? []} primary={{ key: "chat_prompts", label: "Chat prompts" }} secondary={{ key: "project_prompts", label: "Project prompts" }} title="Mobile activity" color="green" />
    <div className="owner-trio"><ModelBreakdown data={data} surface="mobile" /><OwnerBars title="Chat effort" rows={efforts} labelKey="label" /><OwnerBars title="Recorded actions" rows={events} labelKey="label" /></div>
    <div className="owner-trio">
      <OwnerBars title="Platforms" rows={platforms} labelKey="label" />
      <OwnerBars title="Popular screens" rows={screens} labelKey="label" />
      <OwnerBars title="Project providers" rows={providers} labelKey="label" />
    </div>
    <p className="owner-footnote">Guest activity may not map to a registered account. Offline or older app versions may leave gaps until new events reach the server.</p>
  </div>;
}
