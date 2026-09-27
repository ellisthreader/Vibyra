import React, { useState } from "react";
import { METRICS, METRIC_ORDER, display, ranked } from "./metrics.js";
import { ModelName } from "./ModelMark.jsx";
import { useTooltip, Tooltip, TipBody } from "./Tooltip.jsx";

export default function Leaderboard({ models, focus, onFocus }) {
    const [metricId, setMetricId] = useState("intelligence");
    const metric = METRICS[metricId];
    const rows = ranked(models, metricId);
    // Leave room for the 95% whisker when the source publishes one.
    const max = Math.max(...rows.map((m) => (metricId === "intelligence" && m.ci ? Math.max(metric.get(m), m.ci.high) : metric.get(m))));
    const missing = models.length - rows.length;
    const { frame, tip, show, hide } = useTooltip();
    // Tied models (overlapping 95% ranges) share a rank range, e.g. "2–4".
    const rankLabel = (m, index) => (metricId === "intelligence" && m.rank && m.rank.best !== m.rank.worst
        ? `${m.rank.best}–${m.rank.worst}` : index + 1);
    const details = (m) => METRIC_ORDER.filter((id) => METRICS[id].get(m) != null)
        .map((id) => [METRICS[id].title, display(id, m)])
        .concat(m.codingAgent ? [["Coding agent tested", m.codingAgent.split(" + ")[0]]] : [])
        .concat(m.sourceCount ? [["Leaderboards", `${m.sourceCount}${m.agreement ? `, ${m.agreement} agreement` : ""}`]] : []);
    return (
        <section className="page-width bm-section" id="leaderboard" aria-labelledby="bm-board-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-board-title">Leaderboard</h2>
                    <p>{metric.note}</p>
                </div>
                <div className="bm-segment" role="radiogroup" aria-label="Rank by">
                    {METRIC_ORDER.map((id) => (
                        <button key={id} role="radio" aria-checked={metricId === id} onClick={() => setMetricId(id)}>
                            {METRICS[id].label}
                        </button>
                    ))}
                </div>
            </header>
            <div className="bm-card bm-board" ref={frame} onPointerLeave={hide}>
                <ol>
                    {rows.map((m, index) => (
                        <li key={m.id}>
                            <button
                                className={`bm-row${focus === m.id ? " is-focused" : ""}${index === 0 ? " is-leader" : ""}`}
                                aria-pressed={focus === m.id}
                                onClick={() => onFocus(m.id)}
                                onPointerMove={(e) => show(e, <TipBody model={m} rows={details(m)} />)}
                                onFocus={(e) => show(e, <TipBody model={m} rows={details(m)} />)}
                                onBlur={hide}
                            >
                                <span className="bm-rank">{rankLabel(m, index)}</span>
                                <ModelName model={m} />
                                <span className="bm-track">
                                    <span className="bm-bar" style={{ width: `${(metric.get(m) / max) * 100}%` }} />
                                    {metricId === "intelligence" && m.ci && (
                                        <span className="bm-ci" title="95% range" style={{ left: `${(m.ci.low / max) * 100}%`, width: `${((m.ci.high - m.ci.low) / max) * 100}%` }} />
                                    )}
                                </span>
                                <span className="bm-value">{display(metricId, m)}</span>
                            </button>
                        </li>
                    ))}
                </ol>
                {missing > 0 && (
                    <p className="bm-footnote">
                        {missing} {missing === 1 ? "model has" : "models have"} no published {metric.title.toLowerCase()} yet.
                    </p>
                )}
                {rows.some((m) => metric.approx?.(m)) && (
                    <p className="bm-footnote">~ Approximate: measured at a lower reasoning effort than the model’s other scores.</p>
                )}
                <Tooltip tip={tip} />
            </div>
        </section>
    );
}
