import React, { useState } from "react";
import { BENCHMARKS, MODELS, CONSENSUS_SOURCES } from "./data.js";

const MODELS_HAVE_BOARDS = MODELS.some((m) => m.sourceCount);
import { METRICS, blended, scoreFmt, tidyNumber } from "./metrics.js";
import PublishedRuns from "./PublishedRuns.jsx";
import { ModelName } from "./ModelMark.jsx";

// One cobalt scale: a brighter cell is a better score within its column.
const RAMP = ["#20252f", "#26324a", "#2b4166", "#324d78", "#395a88", "#436aa3"];

const baseColumns = [
    { id: "intelligence", label: METRICS.intelligence.label, get: METRICS.intelligence.get, fmt: METRICS.intelligence.fmt, heat: true },
    { id: "coding", label: "Coding", get: METRICS.coding.get, fmt: METRICS.coding.fmt, heat: true },
    ...BENCHMARKS.map((b) => ({ id: b.id, label: b.short ?? b.name, get: (m) => m.scores?.[b.id] ?? null, heat: true, fmt: scoreFmt(b) })),
    ...(MODELS_HAVE_BOARDS ? [{ id: "boards", label: "Leaderboards", get: (m) => m.sourceCount, fmt: (v) => v }] : []),
    ...(MODELS_HAVE_BOARDS ? [{ id: "evaluators", label: "Evaluators", get: (m) => m.evaluatorCount },
        { id: "coverage", label: "Categories", get: (m) => m.categoryCount }] : []),
    { id: "price", label: "$ / 1M", get: blended, fmt: METRICS.price.fmt, low: true },
    { id: "taskCost", label: "AA coding $ / task", get: METRICS.taskCost.get, fmt: METRICS.taskCost.fmt, low: true },
    { id: "speed", label: "Tokens/s", get: METRICS.speed.get, fmt: (v) => Math.round(v) },
    { id: "context", label: "Context", get: (m) => m.context, fmt: tidyNumber },
];

const show = (col, v) => (v == null ? "–" : col.fmt ? col.fmt(v) : `${+v.toFixed(1)}`);

export default function ScoreTable({ models, focus, onFocus }) {
    const [showBoards, setShowBoards] = useState(false);
    const sourceColumns = (CONSENSUS_SOURCES ?? []).map((source) => ({
        id: source.id, label: source.name, get: (m) => m.boards?.[source.id]?.value ?? null,
        fmt: (v) => Number(v.toFixed(2)), source, low: source.higherIsBetter === false,
    }));
    const scoreColumns = [...baseColumns, ...(showBoards ? sourceColumns : [])];
    const [sort, setSort] = useState({ id: "intelligence", dir: -1 });
    const col = scoreColumns.find((c) => c.id === sort.id) ?? baseColumns[0];
    const rows = [...models].sort((a, b) => {
        const av = col.get(a);
        const bv = col.get(b);
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * sort.dir;
    });
    const ranges = Object.fromEntries(scoreColumns.filter((c) => c.heat).map((c) => {
        const values = models.map(c.get).filter((v) => v != null);
        return [c.id, [Math.min(...values), Math.max(...values)]];
    }));
    const shade = (c, v) => {
        const [lo, hi] = ranges[c.id];
        const step = hi === lo ? RAMP.length - 1 : Math.round(((v - lo) / (hi - lo)) * (RAMP.length - 1));
        return { background: RAMP[step], color: "#f5f7fa" };
    };
    const sortBy = (c) => setSort((s) => ({ id: c.id, dir: s.id === c.id ? -s.dir : c.low ? 1 : -1 }));
    return (
        <section className="page-width bm-section" id="scores" aria-labelledby="bm-table-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-table-title">Every score</h2>
                    <p>Brighter means better within each test. Click a heading to sort.</p>
                </div>
                {CONSENSUS_SOURCES && <label className="bm-score-options"><input type="checkbox" checked={showBoards}
                    onChange={(e) => { setShowBoards(e.target.checked); setSort({ id: "intelligence", dir: -1 }); }} />Show published leaderboard scores</label>}
            </header>
            <div className="bm-card bm-table-wrap" tabIndex={0} aria-label="Scores table, scrolls sideways">
                <table className="bm-table">
                    <thead>
                        <tr>
                            <th scope="col" className="bm-sticky">Model</th>
                            {scoreColumns.map((c) => (
                                <th key={c.id} scope="col" aria-sort={sort.id === c.id ? (sort.dir < 0 ? "descending" : "ascending") : "none"}>
                                    <button onClick={() => sortBy(c)}>
                                        {c.label}
                                        <span aria-hidden="true">{sort.id === c.id ? (sort.dir < 0 ? "↓" : "↑") : ""}</span>
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((m) => (
                            <tr key={m.id} className={focus === m.id ? "is-focused" : undefined} onClick={() => onFocus(m.id)}>
                                <th scope="row" className="bm-sticky"><button className="bm-table-model" aria-pressed={focus === m.id} onClick={(e) => { e.stopPropagation(); onFocus(m.id); }}><ModelName model={m} /></button></th>
                                {scoreColumns.map((c) => {
                                    const v = c.get(m);
                                    return (
                                        <td key={c.id} title={c.source ? `${m.boards?.[c.id]?.variant ?? "No published run"} · ${c.source.metric}` : undefined} className={c.heat ? "is-heat" : c.source ? "bm-raw-score" : undefined}>
                                            <span style={c.heat && v != null ? shade(c, v) : undefined}>{show(c, v)}</span>
                                            {c.id === "intelligence" && m.sensitivity && <small className="bm-score-sensitivity" title="Score range when one evaluator is omitted, using the same scale. Not a confidence interval.">{m.sensitivity.low}–{m.sensitivity.high}</small>}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <PublishedRuns model={models.find((m) => m.id === focus)} />
        </section>
    );
}
