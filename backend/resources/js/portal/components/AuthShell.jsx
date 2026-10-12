import React from "react";
import useOwnerTheme from "../owner/useOwnerTheme.js";

// Log in, sign up, two-factor and owner access: one frosted card floating on
// the painted blue-hour river from the homepage's ecosystem section.
export default function AuthShell({ switchTo, children }) {
  const owner = window.location.pathname === "/owner/login";
  const [theme] = useOwnerTheme(owner);
  return (
    <div className={owner ? "auth-page owner-auth" : "auth-page"} data-theme={owner ? theme : undefined}>
      <div className="auth-backdrop" aria-hidden="true">
        <img src="/media/marketing/ecosystem/safe.webp" alt="" />
      </div>
      <header className="auth-header">
        <a className="auth-brand" href="/" aria-label="Vibyra home">
          <img src="/vibyra-cobalt.png" alt="" width="30" height="23" />
          <span>vibyra<span className="auth-brand-dot">.</span></span>
        </a>
        {switchTo && <a className="auth-pill auth-pill--light" href={switchTo.href}>{switchTo.label}</a>}
      </header>
      <main className="auth-main">
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} Vibyra</span>
        <nav aria-label="Legal">
          <a href="/legal/privacy">Privacy</a>
          <a href="/legal/terms">Terms</a>
          <a href="/?analytics=choices" data-analytics-choices>Analytics choices</a>
        </nav>
      </footer>
    </div>
  );
}
