import React from "react";
import { display, topPicks } from "./metrics.js";
import ModelMark from "./ModelMark.jsx";

const UNIT = { intelligence: "/ 100", coding: "/ 100", price: "per 1M tokens", speed: "" };

// The answer first: four winners, named before any chart asks for attention.
export default function TopPicks({ models }) {
    const picks = topPicks(models).filter((pick) => pick.model);
    if (!picks.length) return null;
    return (
        <section className="page-width bm-picks" aria-label="Top picks">
            {picks.map(({ id, label, model, metric, line }) => (
                <article key={id} className="bm-pick" title={line}>
                    <ModelMark model={model} size={34} />
                    <p className="bm-pick-label">{label}</p>
                    <h2 className="bm-pick-name">{model.name}</h2>
                    <p className="bm-pick-value">
                        <strong>{display(metric, model)}</strong> {UNIT[metric]}
                    </p>
                </article>
            ))}
        </section>
    );
}
