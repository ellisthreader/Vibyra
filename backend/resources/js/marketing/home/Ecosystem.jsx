import React, { useEffect, useRef, useState } from "react";
import { CARDS } from "./ecosystem/cards.js";

/* Section 03: the Vibyra ecosystem. Four soft cards, two per row, in the
 * manner of Grok Bot's feature cards: the title and one short line, then a
 * painted blue-hour backdrop running off the card's bottom edge with the
 * tool's short live story on it (ecosystem/*Story.jsx), drawn on a fixed
 * 480×320 stage scaled to the panel (`--k`) and anchored to its bottom. A
 * story replays by re-mounting its stage each cycle, only while the card is
 * on screen and the tab is visible; reduced motion shows the finished frame. */

const STAGE = { w: 480, h: 320 };
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Card({ card }) {
    const ref = useRef(null);
    const [live, setLive] = useState(false);
    const [run, setRun] = useState(0);
    const { Story } = card;

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const art = el.querySelector(".eco-art");
        const fit = () => {
            const k = Math.min(1.15, (art.clientWidth - 32) / STAGE.w, (art.clientHeight - 20) / STAGE.h);
            art.style.setProperty("--k", k.toFixed(4));
        };
        const sizes = new ResizeObserver(fit);
        sizes.observe(art);
        fit();
        if (still() || !("IntersectionObserver" in window)) {
            el.classList.add("is-still");
            return () => sizes.disconnect();
        }
        let onScreen = false;
        const sync = () => setLive(onScreen && !document.hidden);
        const views = new IntersectionObserver(
            ([entry]) => {
                onScreen = entry.isIntersecting;
                sync();
            },
            { threshold: 0.35 },
        );
        views.observe(el);
        document.addEventListener("visibilitychange", sync);
        return () => {
            sizes.disconnect();
            views.disconnect();
            document.removeEventListener("visibilitychange", sync);
        };
    }, []);

    useEffect(() => {
        if (!live) return undefined;
        const timer = setInterval(() => setRun((n) => n + 1), card.cycle * 1000);
        return () => clearInterval(timer);
    }, [live, card.cycle]);

    return (
        <li ref={ref} className={`eco-cell eco-cell-${card.id}${live ? " is-live" : ""}`}>
            <div className="eco-copy">
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
            </div>
            <div className="eco-art" aria-hidden="true">
                <img
                    className="eco-paint"
                    src={`/media/marketing/ecosystem/${card.id}.webp`}
                    style={{ objectPosition: card.focus }}
                    alt=""
                    loading="lazy"
                    decoding="async"
                />
                <div className="eco-stage" key={live ? run : "rest"} style={{ width: STAGE.w, height: STAGE.h }}>
                    <Story />
                </div>
            </div>
        </li>
    );
}

export default function Ecosystem() {
    return (
        <section className="eco section-space" id="why" aria-labelledby="eco-title">
            <div className="page-width">
                <div className="eco-head home-section-heading">
                    <h2 id="eco-title">The Vibyra ecosystem.</h2>
                    <p>Everything around your agents, built into one window.</p>
                </div>
                <ul className="eco-grid">
                    {CARDS.map((card) => (
                        <Card key={card.id} card={card} />
                    ))}
                </ul>
                <p className="fx-foot">
                    Illustrated demos of Vibyra Desktop. Screenshot capture works on Windows and Linux. Voice input works
                    on Linux and uses your own OpenAI key. <a href="/legal/privacy">Privacy policy</a>
                </p>
            </div>
        </section>
    );
}
