import React from "react";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function PortalShell({ children, eyebrow = "Vibyra account", title, intro, minimal = false, layout = "default" }) {
  const { user } = useWebsiteSession();
  return (
    <div className={`portal-page portal-page--${layout} ${minimal ? "portal-page--minimal" : ""}`}>
      <header className="portal-header">
        <a className="portal-brand" href="/" aria-label="Vibyra home">
          <img src="/vibyra-cobalt.png" alt="" />
          <span>vibyra<span className="portal-brand-dot">.</span></span>
        </a>
        <nav aria-label="Account navigation">
          {minimal ? <a href="/">Home</a> : <>
            <a href="/downloads">Downloads</a>
            <a href="/billing">Membership</a>
            <a href={user ? "/account" : "/login"}>{user ? "Account" : "Log in"}</a>
          </>}
        </nav>
      </header>
      <main className="portal-main">
        <section className="portal-heading">
          {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </section>
        {children}
      </main>
      <footer className="portal-footer">
        <span>© {new Date().getFullYear()} Vibyra</span>
        <div className="portal-legal"><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a><a href="/?analytics=choices" data-analytics-choices>Analytics choices</a></div>
        {!minimal && <a href="/">Back to the website</a>}
      </footer>
    </div>
  );
}
