import React, { useState } from "react";
import { CONSENSUS_SOURCES } from "./data.js";
import { WORKLOADS, pairedRows, paretoRanks, taskMoney, performanceText } from "./costPerformance.js";
import { ModelName } from "./ModelMark.jsx";
import WorkloadMap from "./WorkloadMap.jsx";
import ValueMap from "./ValueMap.jsx";

export default function CostPerformance({ models, focus, onFocus }) {
    const [sourceId, setSource] = useState("aa-coding-agent");
    const [sort, setSort] = useState("tier");
    const workload = WORKLOADS.find((w) => w.id === sourceId);
    const source = CONSENSUS_SOURCES?.find((s) => s.id === sourceId);
    const rows = paretoRanks(pairedRows(models, sourceId));
    const hasTime = rows.some((r) => Number.isFinite(r.run.taskTimeSeconds));
    const sorted = [...rows].sort((a, b) => sort === "cost" ? a.cost - b.cost : sort === "performance" ? b.performance - a.performance : a.tier - b.tier || b.performance - a.performance);
    const selected = rows.find((r) => r.model.id === focus);
    return <section className="page-width bm-section" id="value" aria-labelledby="bm-cost-title">
        <header className="bm-section-head">
            <div><h2 id="bm-cost-title">Cost &amp; performance</h2>
                <p>Real workload cost beside the same run’s performance, at the selected effort.</p></div>
            <label className="bm-select-label">Workload<select value={sourceId} onChange={(e) => setSource(e.target.value)}>
                {WORKLOADS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></label>
        </header>
        <p className="bm-cost-note">{workload.note} {rows.length} paired profiles · one evaluator per workload. {source && <a href={source.url} target="_blank" rel="noreferrer">Source ↗</a>}</p>
        <WorkloadMap rows={rows} workload={workload} focus={focus} onFocus={onFocus} />
        <p className="bm-cost-note">Tier 1: no listed profile achieves at least this performance for at most this cost, with one strict improvement. Remove tier 1 to find tier 2, and repeat. Models within a tier are ordered by performance; tiers are tradeoffs, not an overall winner.</p>
        {rows.length ? <div className="bm-card bm-table-wrap" tabIndex={0} aria-label="Cost and performance table, scrolls sideways">
            <table className="bm-table bm-cost-table"><thead><tr>
                <th scope="col" className="bm-sticky">Model</th>
                {[["tier", "Value tier"], ["performance", `Performance (${workload.unit})`], ["cost", "USD / task"]].map(([id, label]) =>
                    <th scope="col" key={id} aria-sort={sort === id ? (id === "performance" ? "descending" : "ascending") : "none"}>
                        <button onClick={() => setSort(id)}>{label} {sort === id && (id === "performance" ? "↓" : "↑")}</button></th>)}
                {hasTime && <th scope="col">Mean task time</th>}
            </tr></thead><tbody>{sorted.map((r) => <tr key={r.model.id} className={focus === r.model.id ? "is-focused" : undefined}>
                <th scope="row" className="bm-sticky"><button className="bm-table-model" aria-pressed={focus === r.model.id} onClick={() => onFocus(r.model.id)}><ModelName model={r.model} /></button></th>
                <td>{r.tier === 1 ? "1 · Frontier" : r.tier}</td><td>{performanceText(r, workload)}</td><td>{taskMoney(r.cost)}</td>
                {hasTime && <td title={r.run.taskTimeBasis}>{r.run.taskTimeSeconds == null ? "–" : `${(r.run.taskTimeSeconds / 60).toFixed(1)} min`}</td>}
            </tr>)}</tbody></table>
        </div> : <p className="bm-footnote">No paired cost and performance results for this effort. Missing costs are not estimated from token prices.</p>}
        {selected && <p className="bm-cost-note"><strong>{selected.run.variant}</strong> · {selected.run.costBasis}
            {selected.run.costFallbackAttempts > 0 && ` · ${selected.run.costFallbackAttempts}/${selected.run.costAttemptCount} recovery attempts (${selected.run.costFallbackDefinition}).`}</p>}
        <p className="bm-footnote">Published API cost estimates, not subscription prices or invoices. Results compare each source’s harness and budget. Tiers recalculate for the displayed profiles; equal effort labels do not imply equal compute.</p>
        <details className="bm-token-details"><summary>Token prices &amp; output speed</summary><ValueMap models={models} focus={focus} onFocus={onFocus} /></details>
    </section>;
}
