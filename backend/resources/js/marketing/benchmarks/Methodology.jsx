import React from "react";
import { CONSENSUS_SOURCES, LABELS, SOURCES } from "./data.js";

export default function Methodology() {
    return (
        <section className="page-width bm-section bm-method" id="method" aria-labelledby="bm-method-title">
            <div className="bm-method-summary">
                <h2 id="bm-method-title">About these scores</h2>
                <p>{CONSENSUS_SOURCES
                    ? `${CONSENSUS_SOURCES.length} public boards are available. Vibyra Score is a capability summary with equal evaluator weight within each category; it needs 3 evaluators across 3 categories at the exact effort. Preference and reference-only boards stay separate. Coverage varies, and the evaluator sensitivity range is not a confidence interval.`
                    : LABELS.method.lead}</p>
                <p>Cost &amp; performance compares paired results within each workload. Value tiers use performance and published USD per task; Vibyra Score measures capability only. Token price and output speed are separate.</p>
                <ul className="bm-source-links" aria-label="Data sources">
                    {SOURCES.map((source) => (
                        <li key={source.url}>
                            <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                        </li>
                    ))}
                </ul>
                <p className="bm-footnote">These are dated comparisons, not guarantees of model availability or future performance. Prices and speeds can change; check the provider’s current terms before relying on them. Vibyra is independent of the model makers.</p>
            </div>
        </section>
    );
}
