import React from "react";
import { AS_OF_SHORT, CONSENSUS_SOURCES } from "./data.js";

export default function BenchHero({ count }) {
    return (
        <section className="bm-hero page-width" id="top" aria-labelledby="bm-title">
            <p className="bm-eyebrow">AI MODEL BENCHMARKS</p>
            <h1 id="bm-title">Which AI is best<span>?</span></h1>
            <p className="bm-hero-meta">
                {count} models{CONSENSUS_SOURCES && ` · ${CONSENSUS_SOURCES.length} leaderboards averaged`} · Updated {AS_OF_SHORT}
            </p>
        </section>
    );
}
