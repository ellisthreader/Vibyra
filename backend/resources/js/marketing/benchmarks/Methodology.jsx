import React from "react";
import { AS_OF, BENCHMARKS, CONSENSUS_SOURCES, LABELS, SOURCES } from "./data.js";

// Plain words for every test, and where each number came from.
export default function Methodology() {
    return (
        <section className="page-width bm-section bm-method" id="method" aria-labelledby="bm-method-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-method-title">What the tests measure</h2>
                    <p>{LABELS.method.lead} Figures as of {AS_OF}.</p>
                </div>
            </header>
            <dl className="bm-glossary">
                <div>
                    <dt>{LABELS.intelligence.title}</dt>
                    <dd>{LABELS.method.intelligence}</dd>
                </div>
                <div>
                    <dt>{LABELS.coding.title}</dt>
                    <dd>{LABELS.method.coding}</dd>
                </div>
                {CONSENSUS_SOURCES?.map((b) => (
                    <div key={b.id}>
                        <dt><a href={b.url} target="_blank" rel="noreferrer">{b.name}</a></dt>
                        <dd>{b.categoryName} · {b.metric} · {b.models} models · {b.org}</dd>
                    </div>
                ))}
                {!CONSENSUS_SOURCES && BENCHMARKS.map((b) => (
                    <div key={b.id}>
                        <dt>{b.url ? <a href={b.url} target="_blank" rel="noreferrer">{b.name}</a> : b.name}</dt>
                        <dd>{b.description}</dd>
                    </div>
                ))}
            </dl>
            <div className="bm-sources">
                <p>{CONSENSUS_SOURCES ? "Price and speed" : "Sources"}</p>
                <ul>
                    {SOURCES.map((s) => (
                        <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>
                    ))}
                </ul>
                <p className="bm-disclaimer">{LABELS.method.disclaimer}</p>
            </div>
        </section>
    );
}
