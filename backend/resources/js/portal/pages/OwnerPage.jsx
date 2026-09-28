import React, { useEffect, useState } from "react";
import { ApiError, portalApi } from "../api.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import OwnerOverview from "../owner/OwnerOverview.jsx";
import { DesktopDetails, MobileDetails, WebsiteDetails } from "../owner/OwnerDetails.jsx";
import OwnerAccounts from "../owner/OwnerAccounts.jsx";
import { CommercialDetails, DataQualityDetails } from "../owner/OwnerOperations.jsx";

const SECTIONS = [
  { key: "overview", label: "Overview", title: "The whole picture", sub: "The signals that matter across Vibyra." },
  { key: "website", label: "Website", title: "Website", sub: "Traffic, signups, and real file downloads." },
  { key: "desktop", label: "Desktop", title: "Desktop software", sub: "Adoption, projects, terminals, and prompts." },
  { key: "mobile", label: "Mobile", title: "Mobile app", sub: "Phone sessions, AI chat, and project activity." },
  { key: "accounts", label: "Accounts", title: "Accounts & sessions", sub: "Verified account records and recent authenticated use." },
  { key: "commercial", label: "Commercial", title: "Commercial", sub: "Membership state and recorded cloud AI cost." },
  { key: "quality", label: "Data quality", title: "Data quality", sub: "Coverage, consent, and how fresh each source is." },
];
const PERIODS = [7, 30, 90];
export default function OwnerPage() {
  const { user, loading } = useWebsiteSession();
  const [section, setSection] = useState("overview");
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Owner overview | Vibyra"; }, []);
  useEffect(() => {
    if (!loading && !user) window.location.assign("/owner/login");
  }, [loading, user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = (initial = false) => {
      if (initial) { setPending(true); setError(""); }
      portalApi.ownerAnalytics(days).then((payload) => {
        if (!cancelled) { setData(payload); setError(""); }
      }).catch((caught) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 401) {
          window.location.assign("/owner/login");
          return;
        }
        setData(null);
        setError(caught.status === 403 ? "This account does not have access to the owner workspace." : caught.message);
      }).finally(() => { if (!cancelled && initial) setPending(false); });
    };
    load(true);
    const timer = user.email === "owner.local@vibyra.test" ? window.setInterval(() => load(), 60_000) : null;
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [days, user]);

  const current = SECTIONS.find((item) => item.key === section) ?? SECTIONS[0];
  const dateLabel = data?.range?.from && data?.range?.to
    ? `${data.range.from.slice(0, 10)} – ${data.range.to.slice(0, 10)}` : "UTC reporting";
  const capturedAt = data?.data_quality?.captured_at;
  const capturedDate = capturedAt ? new Date(capturedAt) : null;
  const snapshotLabel = data?.data_quality?.source === "production" && capturedDate && !Number.isNaN(capturedDate.valueOf())
    ? `Production snapshot${Date.now() - capturedDate.valueOf() > 30 * 60_000 ? " stale" : ""} · updated ${capturedDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`
    : null;

  return <div className="owner-page">
    <aside className="owner-rail" aria-label="Owner navigation">
      <a className="owner-brand" href="/owner"><span className="owner-brand__mark"><img src="/vibyra-mark.png" alt="" /></span><span>vibyra<small>OWNER SPACE</small></span></a>
      <div className="owner-rail__group"><p>Workspace</p>
        <nav>{SECTIONS.map((item, index) => <button type="button" key={item.key} className={section === item.key ? "is-active" : ""}
          aria-current={section === item.key ? "page" : undefined} onClick={() => setSection(item.key)}><span className="owner-rail__index">0{index + 1}</span>{item.label}<span className="owner-rail__arrow">↗</span></button>)}</nav>
      </div>
      <div className="owner-rail__bottom"><span className="owner-rail__live"><i /> Private workspace</span><a href="/account">Back to account <span aria-hidden="true">↗</span></a></div>
    </aside>
    <main className="owner-main">
      <header className="owner-topbar"><div><span className="owner-topbar__dot" /> VIBYRA / OWNER INSIGHTS</div><div className="owner-topbar__right"><span>{user?.email ?? ""}</span><a href="/account">Account ↗</a></div></header>
      <div className="owner-content">
        <div className="owner-heading"><div><p className="owner-kicker">{current.label} / Analytics</p><h1>{current.title}<span>.</span></h1><p>{current.sub}</p></div>
          <div className="owner-period" aria-label="Reporting period"><span>LAST</span>{PERIODS.map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value}D</button>)}</div>
        </div>
        <nav className="owner-mobile-nav" aria-label="Owner sections">{SECTIONS.map((item) => <button type="button" key={item.key} aria-current={section === item.key ? "page" : undefined} onClick={() => setSection(item.key)}>{item.label}</button>)}</nav>
        <div className="owner-date-line"><span><i /> {dateLabel}</span><span>{snapshotLabel ?? "All dates in UTC"}</span></div>
        {data && ["overview", "website", "desktop", "mobile"].includes(section) && !data.data_quality?.tracking_started_at && <section className="owner-state owner-state--notice" role="status"><strong>Product activity tracking has not started</strong><p>Historical website, Desktop, and Mobile usage was not recorded. A dash means data is unavailable. Existing account and Vibes cloud records are shown separately. New product activity appears after consented events reach production and {snapshotLabel ? "the aggregate snapshot is refreshed." : "this service."}</p></section>}
        {data && ["website", "desktop", "mobile"].includes(section) && data.data_quality?.tracking_started_at && !data.data_quality?.tracking_by_surface?.[section] && <section className="owner-state owner-state--notice" role="status"><strong>{current.label} tracking has not started</strong><p>There are no historical events for this surface. Counts appear once new activity reaches this server.</p></section>}
        {error ? <section className="owner-state owner-state--error"><strong>Analytics unavailable</strong><p>{error}</p><a href="/account">Return to account</a></section>
          : pending && !data ? <div className="owner-skeleton" role="status">Loading owner insights…</div>
          : data ? <div className={pending ? "owner-content--updating" : ""}>
            {section === "overview" && <OwnerOverview data={data} onSelect={setSection} />}
            {section === "website" && <WebsiteDetails data={data} />}
            {section === "desktop" && <DesktopDetails data={data} />}
            {section === "mobile" && <MobileDetails data={data} />}
            {section === "accounts" && <OwnerAccounts local={user?.email === "owner.local@vibyra.test"} />}
            {section === "commercial" && <CommercialDetails data={data} />}
            {section === "quality" && <DataQualityDetails data={data} />}
            <section className="owner-coverage"><div><span className="owner-coverage__icon">i</span><div><strong>About this data</strong><p>{snapshotLabel ?? `Oldest retained event: ${data.data_quality?.tracking_started_at?.slice(0, 10) || "none yet"}. Events pass a ${data.data_quality?.retention_days ?? 400}-day cleanup threshold and are pruned daily.`}</p></div></div>
              {(data.data_quality?.notes ?? []).map((note, index) => <p key={index}>{note}</p>)}
            </section>
          </div> : null}
        <footer className="owner-footer"><span>Vibyra owner insights</span><span>Private · {new Date().getFullYear()}</span></footer>
      </div>
    </main>
  </div>;
}
