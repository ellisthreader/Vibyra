import React from "react";
import { AS_OF_SHORT, CONSENSUS_SOURCES } from "./data.js";

export default function BenchHero({ count }) {
    return (
        <section className="bm-hero page-width" id="top" aria-labelledby="bm-title">
            <p className="bm-eyebrow">Vibyra benchmarks</p>
            <h1 id="bm-title">AI model benchmarks.</h1>
            <p className="bm-hero-description">Compare intelligence, coding, price and speed.</p>
            <p className="bm-hero-meta">
                <span>{count} models{CONSENSUS_SOURCES && ` · ${CONSENSUS_SOURCES.length} leaderboards`}</span>
                <span>Updated {AS_OF_SHORT}</span>
            </p>
        </section>
    );
}
