import React, { useEffect, useRef, useState } from "react";
import { Action, Brand, Icon, DOWNLOAD_URL } from "./shared.jsx";

const links = [
    ["#desktop", "Desktop"],
    ["#mobile", "Mobile"],
    ["#workflow", "Why Vibyra"],
    ["#pricing", "Pricing"],
];

export function HomeNav({ homePath = "" }) {
    const [open, setOpen] = useState(false);
    const menuButton = useRef(null);
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
                        <a key={href} href={`${homePath}${href}`}>
                            {text}
                        </a>
                    ))}
                </nav>
                <div className="nav-actions">
                    <a className="login-link" href="/login">
                        Log in
                    </a>
                    <Action>Get Vibyra</Action>
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
                    {[...links, ["#faq", "Questions"], ["/login", "Log in"]].map(([href, text]) => (
                        <a
                            href={href.startsWith("#") ? `${homePath}${href}` : href}
                            key={href}
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
                <div>
                    <p className="section-label section-label-light">
                        <span>YOUR NEXT IDEA</span>STARTS HERE
                    </p>
                    <h2>
                        Less friction.
                        <br />
                        More <span>“I made this.”</span>
                    </h2>
                </div>
                <div className="footer-cta-actions">
                    <Action icon="download">Get Vibyra Desktop</Action>
                    <p>Free to download. Yours to build with.</p>
                </div>
            </div>
            <div className="page-width footer-grid">
                <div className="footer-brand">
                    <a href={`${homePath}#top`} aria-label="Vibyra home">
                        <Brand />
                    </a>
                    <p>
                        A little less between you
                        <br />
                        and your next big idea.
                    </p>
                </div>
                <div>
                    <h3>Product</h3>
                    <a href={`${homePath}#desktop`}>Vibyra Desktop</a>
                    <a href={`${homePath}#mobile`}>Vibyra Mobile</a>
                    <a href={DOWNLOAD_URL}>Downloads</a>
                    <a href={`${homePath}#pricing`}>Plans & pricing</a>
                </div>
                <div>
                    <h3>Explore</h3>
                    <a href={`${homePath}#walkthrough`}>Product walkthrough</a>
                    <a href={`${homePath}#workflow`}>Your workflow</a>
                    <a href={`${homePath}#faq`}>Common questions</a>
                    <a href="/account">Your account</a>
                </div>
                <div>
                    <h3>Vibyra</h3>
                    <a href="/signup">Create an account</a>
                    <a href="/login">Log in</a>
                    <a href="/legal/privacy">Privacy policy</a>
                    <a href="/legal/terms">Terms of service</a>
                </div>
            </div>
            <div className="page-width footer-bottom">
                <span>© {new Date().getFullYear()} Vibyra</span>
                <span>Made for the things you haven’t made yet.</span>
                <a href="#top">Back to top ↑</a>
            </div>
        </footer>
    );
}
