import React, { useEffect, useRef, useState } from "react";
import { Action, Brand, Icon, DOWNLOAD_URL } from "./shared.jsx";
import useSectionNavigation from "./useSectionNavigation.js";

const links = [
    ["#desktop", "Desktop"],
    ["#mobile", "Mobile"],
    ["#why", "Ecosystem"],
    ["#pricing", "Pricing"],
    ["/benchmarks", "Benchmarks"],
];

// Section links are fragments of the homepage; page links stand on their own.
const linkHref = (href, homePath) => (href.startsWith("#") ? `${homePath}${href}` : href);
const onPage = (href) => typeof window !== "undefined" && window.location.pathname === href;

export function HomeNav({ homePath = "" }) {
    const active = useSectionNavigation(homePath);
    const [open, setOpen] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const menuButton = useRef(null);
    useEffect(() => {
        let live = true;
        fetch("/web-api/session", { credentials: "same-origin", headers: { Accept: "application/json" } })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => { if (live) setSignedIn(Boolean(data?.user)); })
            .catch(() => {});
        return () => { live = false; };
    }, []);
    useEffect(() => {
        const close = (event) => {
            if (event.key === "Escape" && open) {
                setOpen(false);
                menuButton.current?.focus();
            }
        };
        const resize = () => {
            if (window.innerWidth > 800) setOpen(false);
        };
        window.addEventListener("keydown", close);
        window.addEventListener("resize", resize);
        return () => {
            window.removeEventListener("keydown", close);
            window.removeEventListener("resize", resize);
        };
    }, [open]);
    return (
        <header className="home-header">
            <div className="page-width nav-inner">
                <a href={`${homePath}#top`} aria-label="Vibyra home">
                    <Brand />
                </a>
                <nav className="desktop-nav" aria-label="Main navigation">
                    {links.map(([href, text]) => (
                        <a
                            key={href}
                            href={linkHref(href, homePath)}
                            data-analytics-cta={href === "#pricing" ? "pricing_opened" : undefined}
                            aria-current={onPage(href) ? "page" : active === href ? "location" : undefined}
                        >
                            {text}
                        </a>
                    ))}
                </nav>
                <div className="nav-actions">
                    <a className="login-link" href={signedIn ? "/account" : "/login"} data-analytics-cta="nav_login">
                        {signedIn ? "Your account" : "Log in"}
                    </a>
                    <Action icon={null} data-analytics-cta="nav_downloads">Get Vibyra</Action>
                    <button
                        ref={menuButton}
                        className="menu-button"
                        aria-expanded={open}
                        aria-controls="home-mobile-menu"
                        aria-label={open ? "Close menu" : "Open menu"}
                        onClick={() => setOpen(!open)}
                    >
                        <Icon name={open ? "close" : "menu"} />
                    </button>
                </div>
            </div>
            {open && (
                <nav className="mobile-nav" id="home-mobile-menu" aria-label="Mobile navigation">
                    {[...links, ["#faq", "Questions"], [signedIn ? "/account" : "/login", signedIn ? "Your account" : "Log in"]].map(([href, text]) => (
                        <a
                            href={linkHref(href, homePath)}
                            key={href}
                            data-analytics-cta={href === "#pricing" ? "pricing_opened" : href === "#faq" ? "faq_opened" : undefined}
                            onClick={() => setOpen(false)}
                        >
                            {text}
                            <Icon />
                        </a>
                    ))}
                </nav>
            )}
        </header>
    );
}

export function HomeFooter({ homePath = "" }) {
    return (
        <footer className="home-footer">
            <div className="page-width footer-cta">
                <div className="footer-cta-copy">
                    <h2>Vibyra Desktop</h2>
                    <p>Free for macOS, Windows and Linux.</p>
                </div>
                <div className="footer-cta-actions">
                    <Action icon={null} data-analytics-cta="nav_mobile_download">Download Vibyra</Action>
                </div>
            </div>
            <div className="page-width footer-grid">
                <div className="footer-brand">
                    <a href={`${homePath}#top`} aria-label="Vibyra home">
                        <Brand />
                    </a>
                    <p>A little less between you and your next big idea.</p>
                </div>
                <nav aria-label="Product links">
                    <h3>Product</h3>
                    <a href={`${homePath}#desktop`}>Vibyra Desktop</a>
                    <a href={`${homePath}#mobile`}>Vibyra Mobile</a>
                    <a href={DOWNLOAD_URL}>Downloads</a>
                    <a href={`${homePath}#pricing`}>Plans & pricing</a>
                </nav>
                <nav aria-label="Explore links">
                    <h3>Explore</h3>
                    <a href="/benchmarks">AI benchmarks</a>
                    <a href={`${homePath}#walkthrough`}>Product walkthrough</a>
                    <a href={`${homePath}#why`}>Ecosystem</a>
                    <a href={`${homePath}#faq`}>Common questions</a>
                </nav>
                <nav aria-label="Account links">
                    <h3>Account</h3>
                    <a href="/account">Your account</a>
                    <a href="/signup">Create an account</a>
                    <a href="/login">Log in</a>
                </nav>
            </div>
            <div className="page-width footer-bottom">
                <span>© {new Date().getFullYear()} Vibyra</span>
                <nav aria-label="Legal links">
                    <a href="/legal/privacy">Privacy</a>
                    <a href="/legal/terms">Terms</a>
                    <a href="/?analytics=choices" data-analytics-choices>Analytics choices</a>
                </nav>
                <a className="footer-back-top" href={`${homePath}#top`}>Back to top <span aria-hidden="true">↑</span></a>
            </div>
        </footer>
    );
}
