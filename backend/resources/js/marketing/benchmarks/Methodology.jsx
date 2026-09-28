import React from "react";
import { CONSENSUS_SOURCES, LABELS, SOURCES } from "./data.js";

export default function Methodology() {
    return (
        <section className="page-width bm-section bm-method" id="method" aria-labelledby="bm-method-title">
            <div className="bm-method-summary">
                <h2 id="bm-method-title">About these scores</h2>
                <p>{CONSENSUS_SOURCES
                    ? `Scores combine ${CONSENSUS_SOURCES.length} public leaderboards; 50 is the model average. Coding uses coding and agent tests only.`
                    : LABELS.method.lead}</p>
                <ul className="bm-source-links" aria-label="Data sources">
                    {SOURCES.map((source) => (
                        <li key={source.url}>
                            <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
