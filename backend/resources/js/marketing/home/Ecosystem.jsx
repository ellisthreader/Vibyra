import React, { useEffect, useRef, useState } from "react";
import { TILES } from "./features/featureTiles.js";
import { SCENES, CYCLES } from "./EcosystemScenes.jsx";

/* Section 03: the Vibyra ecosystem. The six tools as big soft cards, two
 * per row: the title and one line up top, then a panel of the cobalt stage
 * (a different crop per card) running off the card’s bottom edge, with the
 * tool’s short live story on it (EcosystemScenes.jsx), drawn on a fixed
 * 300×180 stage scaled to the panel (`--k`). A story replays by re-mounting its
 * stage each cycle, only while the card is on screen and the tab is visible;
 * reduced motion shows the finished frame once. */

const STAGE = { w: 300, h: 180 };
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Cell({ tile }) {
    const ref = useRef(null);
    const [live, setLive] = useState(false);
    const [run, setRun] = useState(0);
    const Scene = SCENES[tile.id];

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const art = el.querySelector(".es-art");
        const fit = () => {
            const k = Math.min(1.25, (art.clientWidth - 24) / STAGE.w, (art.clientHeight - 16) / STAGE.h);
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
            { threshold: 0.4 },
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
        const timer = setInterval(() => setRun((n) => n + 1), (CYCLES[tile.id] || 8) * 1000);
        return () => clearInterval(timer);
    }, [live, tile.id]);

    return (
        <li ref={ref} className={`eco-cell eco-cell-${tile.id}${live ? " is-live" : ""}`}>
            <div className="eco-copy">
                <h3>{tile.title}</h3>
                <p>{tile.copy}</p>
            </div>
            <div className="es-art" aria-hidden="true">
                <div className="es-stage" key={live ? run : "rest"} style={{ width: STAGE.w, height: STAGE.h }}>
                    {Scene && <Scene />}
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
                    <div>
                        <h2 id="eco-title">The Vibyra ecosystem.</h2>
                    </div>
                    <p>Six tools around your agents, all in one window.</p>
                </div>
                <ul className="eco-grid">
                    {TILES.map((tile) => (
                        <Cell key={tile.id} tile={tile} />
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
