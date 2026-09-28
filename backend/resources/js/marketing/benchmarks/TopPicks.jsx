import React from "react";
import { display, topPicks } from "./metrics.js";
import ModelMark from "./ModelMark.jsx";

const UNIT = { intelligence: "/ 100", coding: "/ 100", price: "/ 1M tokens", speed: "tokens / sec" };
const LABEL = { smartest: "Overall leader", coder: "Coding leader", value: "Best value", fastest: "Fastest output" };

export default function TopPicks({ models }) {
    const picks = topPicks(models).filter((pick) => pick.model);
    if (!picks.length) return null;
    return (
        <section className="page-width bm-picks" aria-label="Top picks from this snapshot">
            {picks.map(({ id, model, metric, line }) => (
                <article key={id} className="bm-pick" title={line}>
                    <div className="bm-pick-heading">
                        <h2 className="bm-pick-label">{LABEL[id]}</h2>
                        <ModelMark model={model} size={30} />
                    </div>
                    <p className="bm-pick-name">{model.name}</p>
                    <p className="bm-pick-value">
                        <strong>{metric === "speed" ? display(metric, model).replace(" t/s", "") : display(metric, model)}</strong><span>{UNIT[metric]}</span>
                    </p>
                </article>
            ))}
        </section>
    );
}
