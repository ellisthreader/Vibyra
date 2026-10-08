import React, { useEffect, useState } from "react";
import { BENCHMARKS } from "./data.js";
import { METRICS, blended, ranked, scoreFmt } from "./metrics.js";
import { modelLabel } from "./effortSelection.js";
import ModelMark from "./ModelMark.jsx";
import { WORKLOADS, taskMoney } from "./costPerformance.js";

const rowsFor = () => [
    { label: METRICS.intelligence.label, get: METRICS.intelligence.get, fmt: METRICS.intelligence.fmt },
    { label: METRICS.coding.title, get: METRICS.coding.get, fmt: METRICS.coding.fmt },
    ...BENCHMARKS.map((b) => ({ label: b.name, get: (m) => m.scores?.[b.id] ?? null, fmt: scoreFmt(b) })),
    ...WORKLOADS.flatMap((w) => [
        { label: `${w.name} (${w.unit})`, get: (m) => m.boards?.[w.id]?.value ?? null, fmt: (v) => v.toFixed(2) },
        { label: `${w.name} $ / task`, get: (m) => m.boards?.[w.id]?.costEligible === false ? null : m.boards?.[w.id]?.costPerTask ?? null, fmt: taskMoney, low: true },
    ]),
    { label: "Price per 1M tokens", get: blended, fmt: METRICS.price.fmt, low: true },
    { label: "Output speed", get: METRICS.speed.get, fmt: METRICS.speed.fmt },
];

function Picker({ value, models, onChange, label }) {
    const model = models.find((m) => m.id === value);
    return (
        <label className="bm-picker">
            {model && <ModelMark model={model} size={30} />}
            <span className="sr-only">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {models.map((m) => <option key={m.id} value={m.id}>{modelLabel(m)}</option>)}
            </select>
        </label>
    );
}

// Two models, mirrored bars: the longer side of each row wins it.
export default function HeadToHead({ models, focus }) {
    const top = ranked(models, "intelligence");
    const [a, setA] = useState(top[0]?.id);
    const [b, setB] = useState(top[1]?.id);
    useEffect(() => { if (focus && focus !== b) setA(focus); }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
    const ma = models.find((m) => m.id === a) ?? top[0] ?? models[0];
    const mb = models.find((m) => m.id === b) ?? top[1] ?? models[1];
    if (!ma || !mb) return null;
    const rows = rowsFor().filter((r) => r.get(ma) != null && r.get(mb) != null);
    const wins = rows.map((r) => (r.get(ma) === r.get(mb) ? 0 : (r.get(ma) > r.get(mb)) !== Boolean(r.low) ? -1 : 1));
    const aWins = wins.filter((w) => w < 0).length;
    const bWins = wins.filter((w) => w > 0).length;
    return (
        <section className="page-width bm-section" id="compare" aria-labelledby="bm-vs-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-vs-title">Head to head</h2>
                    <p>Pick any two. The longer bar wins each row; the win count gives each row equal weight.</p>
                </div>
            </header>
            <div className="bm-card bm-vs">
                <div className="bm-vs-head">
                    <Picker value={ma.id} models={models} onChange={setA} label="First model" />
                    <p className="bm-vs-score"><strong>{aWins}</strong><span>wins</span><strong>{bWins}</strong></p>
                    <Picker value={mb.id} models={models} onChange={setB} label="Second model" />
                </div>
                <ul className="bm-vs-rows">
                    {rows.map((r, i) => {
                        const va = r.get(ma);
                        const vb = r.get(mb);
                        const scale = r.low ? (v) => Math.min(va, vb) / v : (v) => v / Math.max(va, vb);
                        return (
                            <li key={r.label}>
                                <span className={`bm-vs-val${wins[i] < 0 ? " is-win" : ""}`}>{r.fmt(va)}</span>
                                <span className="bm-vs-bar is-a"><i style={{ width: `${scale(va) * 100}%` }} className={wins[i] < 0 ? "is-win" : ""} /></span>
                                <span className="bm-vs-label">{r.label}</span>
                                <span className="bm-vs-bar is-b"><i style={{ width: `${scale(vb) * 100}%` }} className={wins[i] > 0 ? "is-win" : ""} /></span>
                                <span className={`bm-vs-val${wins[i] > 0 ? " is-win" : ""}`}>{r.fmt(vb)}</span>
                            </li>
                        );
                    })}
                </ul>
                {rows.some((r) => r.low) && <p className="bm-footnote">For cost, the cheaper model gets the longer bar. USD per task compares the same workload; it includes any original fallback spend. The row count is not an overall model ranking.</p>}
            </div>
        </section>
    );
}
