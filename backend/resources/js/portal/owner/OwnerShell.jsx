import React, { useEffect, useRef, useState } from "react";
import { PAGES, TABS } from "./ownerNavigation.js";
import { Tabs } from "./OwnerPrimitives.jsx";
import OwnerIcon from "./OwnerIcon.jsx";
import useOwnerTheme from "./useOwnerTheme.js";

export default function OwnerShell({ navigation, user, report, children }) {
  const [theme, setTheme] = useOwnerTheme();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef(null);
  const heading = useRef(null);
  const { view, tab, days, navigate, setDays } = navigation;
  const page = PAGES.find(([key]) => key === view);
  const reports = view !== "users" && !(view === "memberships" && tab === "licenses");
  const choose = (key, sub) => {
    navigate(key, sub);
    if (menu) requestAnimationFrame(() => heading.current?.focus());
    setMenu(false);
  };
  useEffect(() => { document.title = page[1] + " · Vibyra owner"; }, [page]);
  useEffect(() => {
    const escape = event => { if (event.key === "Escape" && menu) { setMenu(false); menuButton.current?.focus(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menu]);
  const range = report.data?.range;
  const snapshot = report.data?.data_quality?.captured_at;
  const stale = snapshot && Date.now() - Date.parse(snapshot) > 30 * 60000;
  return <div className="owner-dashboard" data-theme={theme}>
    <a className="od-skip" href="#owner-content">Skip to dashboard content</a>
    <aside className={"od-sidebar" + (menu ? " is-open" : "")} id="owner-navigation">
      <a href="/owner" className="od-brand"><span className="od-brand-mark"><img src="/vibyra-cobalt.png" alt="" /></span><span>vibyra<small>Owner workspace</small></span></a>
      <nav aria-label="Owner navigation">{PAGES.slice(0, 6).map(([key, label]) =>
        <button key={key} onClick={() => choose(key)} aria-current={view === key ? "page" : undefined}><OwnerIcon name={key} />{label}</button>)}</nav>
      <div className="od-sidebar-bottom"><nav aria-label="Supporting navigation"><button onClick={() => choose("tracking")} aria-current={view === "tracking" ? "page" : undefined}><OwnerIcon name="tracking" />Tracking status</button></nav>
        <a href="/account" className="od-return">Back to Vibyra <OwnerIcon name="arrow" /></a>
        <div className="od-profile"><span>{user?.name?.[0] || "O"}</span><div><strong>{user?.name || "Owner"}</strong><small>Private workspace</small></div></div>
      </div>
    </aside>
    <div className="od-main">
      <header className="od-topbar">
        <button ref={menuButton} className="od-icon-button od-menu-button" aria-label={menu ? "Close navigation" : "Open navigation"} aria-expanded={menu} aria-controls="owner-navigation" onClick={() => setMenu(!menu)}><OwnerIcon name={menu ? "close" : "menu"} /></button>
        <span className="od-breadcrumb">Workspace <span>/</span> <strong>{page[1]}</strong></span>
        <label className="od-theme"><OwnerIcon name="sun" /><span className="od-sr-only">Appearance</span><select value={theme} onChange={event => setTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="auto">System</option></select></label>
      </header>
      <main id="owner-content" className="od-content" tabIndex="-1" ref={heading}>
        <div className="od-page-heading"><div><h1>{page[1]}</h1><p>{page[2]}</p></div>
          {reports && <div className="od-report-controls"><label><span className="od-sr-only">Reporting period</span><select value={days} onChange={event => setDays(Number(event.target.value))}>{[7, 30, 90].map(value => <option key={value} value={value}>Last {value} days</option>)}</select></label>
            <button className="od-icon-button" aria-label="Refresh report" disabled={report.pending} onClick={report.refresh}><OwnerIcon name="refresh" /></button></div>}
        </div>
        {TABS[view] && <Tabs items={TABS[view]} value={tab} onChange={value => choose(view, value)} />}
        {reports && <div className="od-report-meta"><span>{range ? range.from.slice(0, 10) + " – " + range.to.slice(0, 10) + " · UTC" : "Reporting dates use UTC"}</span>
          <span role="status">{report.pending ? "Updating…" : report.updatedAt ? "Updated " + report.updatedAt.toLocaleTimeString("en-GB") + " · every minute" : "Waiting for report"}</span></div>}
        {reports && snapshot && <p className={"od-source-note" + (stale ? " is-stale" : "")}>Production snapshot{stale ? " · more than 30 minutes old" : ""}. Captured {new Date(snapshot).toLocaleString("en-GB", { timeZone: "UTC" })} UTC.</p>}
        {children}
        <footer className="od-footer"><span>Vibyra owner workspace</span><span>Private · {new Date().getFullYear()}</span></footer>
      </main>
    </div>
  </div>;
}
