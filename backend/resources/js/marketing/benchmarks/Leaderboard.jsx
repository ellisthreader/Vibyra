import React, { useState } from "react";
import { METRICS, METRIC_ORDER, display } from "./metrics.js";
import { CONSENSUS_SOURCES } from "./data.js";
import SourcePicker from "./SourcePicker.jsx";
import { sourceMetric, rankRows, barWidth } from "./ranking.js";
import { ModelName } from "./ModelMark.jsx";
import { useTooltip, Tooltip, TipBody } from "./Tooltip.jsx";

export default function Leaderboard({ models, focus, onFocus }) {
    const [metricId, setMetricId] = useState("intelligence");
    const [sourceId, setSource] = useState("consensus");
    const source = CONSENSUS_SOURCES?.find((s) => s.id === sourceId);
    const metric = sourceMetric(source, metricId);
    const rows = rankRows(models, metric);
    const values = rows.map(metric.get);
    // Leave room for the 95% whisker when the source publishes one.
    const max = Math.max(...rows.map((m) => (metricId === "intelligence" && m.ci ? Math.max(metric.get(m), m.ci.high) : metric.get(m))));
    const missing = models.length - rows.length;
    const { frame, tip, show, hide } = useTooltip();
    // Tied models (overlapping 95% ranges) share a rank range, e.g. "2–4".
    const rankLabel = (m, index) => (!source && metricId === "intelligence" && m.rank && m.rank.best !== m.rank.worst
        ? `${m.rank.best}–${m.rank.worst}` : source ? 1 + rows.filter((o) => metric.better === "low" ? metric.get(o) < metric.get(m) : metric.get(o) > metric.get(m)).length : index + 1);
    const details = (m) => METRIC_ORDER.filter((id) => METRICS[id].get(m) != null)
        .map((id) => [METRICS[id].title, display(id, m)])
        .concat(source ? [[source.name, metric.fmt(metric.get(m))], ["Published variant", m.boards[source.id].variant], ["Fallback", m.boards[source.id].fallback === true ? "Enabled" : m.boards[source.id].fallback === false ? "Excluded / counted as failures" : "Unreported"]] : [])
        .concat(m.codingAgent ? [["Coding agent tested", m.codingAgent.split(" + ")[0]]] : [])
        .concat(m.sourceCount ? [["Capability coverage", `${m.sourceCount} boards · ${m.evaluatorCount ?? "?"} evaluators · ${m.categoryCount ?? "?"}/${m.categoryTotal ?? 6} categories`]] : [])
        .concat(m.sensitivity ? [["Evaluator sensitivity", `${m.sensitivity.low}–${m.sensitivity.high} · not a confidence interval`]] : [])
        .concat(source?.consensus === false ? [["Reference only", source.consensusReason ?? "Does not affect Vibyra Score"]] : []);
    return (
        <section className="page-width bm-section" id="leaderboard" aria-labelledby="bm-board-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-board-title">Leaderboard</h2>
                    <p>{metric.note}{source && <> <a href={source.url} target="_blank" rel="noreferrer">Open leaderboard ↗</a></>}</p>
                </div>
                <div className="bm-ranking-controls">
                <SourcePicker value={sourceId} onChange={setSource} />
                {!source && <div className="bm-segment" role="radiogroup" aria-label="Rank by">
                    {METRIC_ORDER.map((id) => (
                        <button key={id} role="radio" aria-checked={metricId === id} onClick={() => setMetricId(id)}>
                            {METRICS[id].label}
                        </button>
                    ))}
                </div>}
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
                                    <span className="bm-bar" style={{ width: `${barWidth(metric.get(m), values, metric.better)}%` }} />
                                    {!source && metricId === "intelligence" && m.ci && (
                                        <span className="bm-ci" title="95% range" style={{ left: `${(m.ci.low / max) * 100}%`, width: `${((m.ci.high - m.ci.low) / max) * 100}%` }} />
                                    )}
                                </span>
                                <span className="bm-value">{metric.fmt(metric.get(m))}
                                    {!source && metricId === "intelligence" && m.sensitivity && <small className="bm-score-sensitivity" title="Score range after omitting one evaluator. Not a confidence interval.">{m.sensitivity.low}–{m.sensitivity.high}</small>}
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
                {missing > 0 && (
                    <p className="bm-footnote">
                        {missing} {missing === 1 ? "model has" : "models have"} no {source ? "published result" : "qualifying score"} for this effort yet.
                    </p>
                )}
                {!source && metricId === "intelligence" && <p className="bm-footnote">Ranked by the point score. Ranges show evaluator sensitivity; close positions can change with evaluator choice.</p>}
                {rows.some((m) => metric.approx?.(m)) && (
                    <p className="bm-footnote">~ Approximate: measured at a lower reasoning effort than the model’s other scores.</p>
                )}
                <Tooltip tip={tip} />
            </div>
        </section>
    );
}
