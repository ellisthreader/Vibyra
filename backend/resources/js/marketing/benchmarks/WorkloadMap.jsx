import React from "react";
import { linear, log, pad, padLog } from "./scales.js";
import { modelLabel } from "./effortSelection.js";
import { taskMoney, performanceText } from "./costPerformance.js";
import { useTooltip, Tooltip, TipBody } from "./Tooltip.jsx";
import useWidth from "./useWidth.js";
import placeLabels from "./labels.js";

const M = { top: 28, right: 28, bottom: 52, left: 56 };
export default function WorkloadMap({ rows, workload, focus, onFocus }) {
    const [ref, width] = useWidth();
    const { frame, tip, show, hide } = useTooltip();
    const height = width < 640 ? 360 : 420;
    const costs = rows.map((r) => r.cost);
    const values = rows.map((r) => r.performance);
    const xd = costs.length ? [Math.min(...costs), Math.max(...costs)] : [1, 10];
    const yd = values.length ? [Math.min(...values), Math.max(...values)] : [0, 100];
    if (yd[0] === yd[1]) { yd[0] -= 5; yd[1] += 5; }
    const sx = log(padLog(xd), [M.left, width - M.right]);
    const sy = linear(pad(yd), [height - M.bottom, M.top]);
    const front = rows.filter((r) => r.tier === 1).sort((a, b) => a.cost - b.cost);
    const line = front.map((r) => `${sx(r.cost)},${sy(r.performance)}`).join(" ");
    const priority = [...rows].sort((a, b) => rank(b) - rank(a));
    function rank(r) { return (r.model.id === focus ? 1e4 : 0) + (r.tier === 1 ? 1e3 : 0) + r.performance; }
    const spots = priority.map((r) => ({ id: r.model.id, text: modelLabel(r.model), cx: sx(r.cost), cy: sy(r.performance) }));
    const labels = placeLabels(spots.slice(0, 10), width, spots);
    const tipFor = (r) => <TipBody model={r.model} rows={[["Performance", performanceText(r, workload)], ["USD / task", taskMoney(r.cost)], ["Cost & performance tier", r.tier]]} />;
    return <div className="bm-card bm-map" ref={frame}>
        <div ref={ref} onPointerLeave={hide}>
            <svg width={width} height={height} role="img" aria-label={`${workload.name}: performance against USD per task for ${rows.length} profiles`}>
                {sy.ticks(5).map((t) => <g key={t} className="bm-grid">
                    <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} />
                    <text x={M.left - 12} y={sy(t)} dy=".32em" textAnchor="end">{t}</text>
                </g>)}
                {sx.ticks().map((t) => <text key={t} className="bm-tick" x={sx(t)} y={height - M.bottom + 22} textAnchor="middle">{taskMoney(t)}</text>)}
                <text className="bm-axis-title" x={M.left - 44} y={M.top - 10}>{workload.unit === "%" ? "Score % ↑" : "Index ↑"}</text>
                <text className="bm-axis-title" x={width - M.right} y={height - 8} textAnchor="end">USD / task → pricier</text>
                <polyline className="bm-frontier" points={line} />
                {rows.map((r) => {
                    const id = r.model.id, cx = sx(r.cost), cy = sy(r.performance), label = labels.get(id);
                    return <g key={id} className={`bm-dot${r.tier === 1 ? " is-best" : ""}${focus === id ? " is-focused" : ""}`}
                        tabIndex={0} role="button" aria-pressed={focus === id} aria-label={`${modelLabel(r.model)}: ${performanceText(r, workload)}, ${taskMoney(r.cost)} per task`}
                        onClick={() => onFocus(id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onFocus(id))}
                        onPointerMove={(e) => show(e, tipFor(r))} onFocus={(e) => show(e, tipFor(r))} onBlur={hide}>
                        <circle className="bm-hit" cx={cx} cy={cy} r="14" /><circle className="bm-point" cx={cx} cy={cy} r="6" />
                        {label && <text x={label.x} y={cy} dy=".32em" textAnchor={label.anchor}>{modelLabel(r.model)}</text>}
                    </g>;
                })}
            </svg>
        </div>
        <p className="bm-footnote">Higher and further left is better. The line joins tier 1 choices; their performance–cost tradeoffs differ.</p>
        <Tooltip tip={tip} />
    </div>;
}
