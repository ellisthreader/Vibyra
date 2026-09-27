import React, { useState } from "react";
import { METRICS, display, frontier } from "./metrics.js";
import { linear, log, pad, padLog } from "./scales.js";
import { useTooltip, Tooltip, TipBody } from "./Tooltip.jsx";
import useWidth from "./useWidth.js";
import MapLegend from "./MapLegend.jsx";
import placeLabels from "./labels.js";

const X_OPTIONS = [["price", "Price"], ["speed", "Speed"]];
const Y_OPTIONS = [["intelligence", "Intelligence"], ["coding", "Coding"]];
const M = { top: 24, right: 28, bottom: 52, left: 56 };

export default function ValueMap({ models, focus, onFocus }) {
    const [xId, setX] = useState("price");
    const [yId, setY] = useState("intelligence");
    const [ref, width] = useWidth();
    const { frame, tip, show, hide } = useTooltip();
    const x = METRICS[xId];
    const y = METRICS[yId];
    const points = models.filter((m) => x.get(m) != null && y.get(m) != null);
    const best = new Set(frontier(points, xId, yId).map((m) => m.id));
    const height = width < 640 ? 380 : 480;
    const xs = points.map(x.get);
    const ys = points.map(y.get);
    const sx = (xId === "price" ? log : linear)(
        xId === "price" ? padLog([Math.min(...xs), Math.max(...xs)]) : pad([Math.min(...xs), Math.max(...xs)]),
        [M.left, width - M.right],
    );
    const sy = linear(pad([Math.min(...ys), Math.max(...ys)]), [height - M.bottom, M.top]);
    const line = frontier(points, xId, yId).map((m) => `${sx(x.get(m))},${sy(y.get(m))}`).join(" ");
    const tipFor = (m) => <TipBody model={m} rows={[[y.title, display(yId, m)], [x.title, display(xId, m)]]} />;
    // Name the models people look for first: the focused one, the frontier, then the top scorers.
    const priority = [...points].sort((a, b) => rank(b) - rank(a));
    function rank(m) { return (m.id === focus ? 1e4 : 0) + (best.has(m.id) ? 1e3 : 0) + y.get(m); }
    const spots = priority.map((m) => ({ id: m.id, text: m.name, cx: sx(x.get(m)), cy: sy(y.get(m)) }));
    const labels = placeLabels(spots.slice(0, 10), width, spots);
    const goodCorner = x.better === "low" ? "top-left" : "top-right";
    return (
        <section className="page-width bm-section" id="value" aria-labelledby="bm-map-title">
            <header className="bm-section-head">
                <div>
                    <h2 id="bm-map-title">{y.label} vs. {x.label.toLowerCase()}</h2>
                    <p>The best models sit {goodCorner === "top-left" ? "up and to the left" : "up and to the right"}. The line joins models nothing else beats on both.</p>
                </div>
                <div className="bm-axis-pickers">
                    {[[Y_OPTIONS, yId, setY, "Score"], [X_OPTIONS, xId, setX, "Against"]].map(([options, value, set, label]) => (
                        <div key={label} className="bm-segment" role="radiogroup" aria-label={label}>
                            {options.map(([id, text]) => (
                                <button key={id} role="radio" aria-checked={value === id} onClick={() => set(id)}>{text}</button>
                            ))}
                        </div>
                    ))}
                </div>
            </header>
            <div className="bm-card bm-map" ref={frame}>
                <div ref={ref} onPointerLeave={hide}>
                    <svg width={width} height={height} role="img" aria-label={`${y.title} against ${x.title} for ${points.length} models`}>
                        <rect className={`bm-sweet bm-sweet-${goodCorner}`} x={goodCorner === "top-left" ? M.left : width / 2} y={M.top}
                            width={width / 2 - (goodCorner === "top-left" ? M.left : M.right)} height={(height - M.top - M.bottom) / 2} rx="8" />
                        <text className="bm-sweet-label" x={goodCorner === "top-left" ? M.left + 14 : width - M.right - 14} y={M.top + 22}
                            textAnchor={goodCorner === "top-left" ? "start" : "end"}>{x.better === "low" ? "Smart and cheap" : "Smart and fast"}</text>
                        {sy.ticks(5).map((t) => (
                            <g key={`y${t}`} className="bm-grid">
                                <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} />
                                <text x={M.left - 12} y={sy(t)} dy="0.32em" textAnchor="end">{t}</text>
                            </g>
                        ))}
                        {sx.ticks(6).map((t) => (
                            <text key={`x${t}`} className="bm-tick" x={sx(t)} y={height - M.bottom + 22} textAnchor="middle">{x.fmt(t)}</text>
                        ))}
                        <text className="bm-axis-title" x={width - M.right} y={height - 8} textAnchor="end">{x.title} {x.better === "low" ? "→ pricier" : "→ faster"}</text>
                        <text className="bm-axis-title" x={M.left - 44} y={M.top - 8}>{y.title} ↑</text>
                        <polyline className="bm-frontier" points={line} />
                        {points.map((m) => {
                            const cx = sx(x.get(m));
                            const cy = sy(y.get(m));
                            const cls = `bm-dot${best.has(m.id) ? " is-best" : ""}${m.openWeights ? " is-open" : ""}${focus === m.id ? " is-focused" : ""}`;
                            const label = labels.get(m.id);
                            return (
                                <g key={m.id} className={cls} tabIndex={0} role="button" aria-label={`${m.name}: ${y.fmt(y.get(m))}, ${x.fmt(x.get(m))}`}
                                    aria-pressed={focus === m.id}
                                    onClick={() => onFocus(m.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onFocus(m.id))}
                                    onPointerMove={(e) => show(e, tipFor(m))} onFocus={(e) => show(e, tipFor(m))} onBlur={hide}>
                                    <circle className="bm-hit" cx={cx} cy={cy} r="14" />
                                    <circle className="bm-point" cx={cx} cy={cy} r="6" />
                                    {label && <text x={label.x} y={cy} dy="0.32em" textAnchor={label.anchor}>{m.name}</text>}
                                </g>
                            );
                        })}
                    </svg>
                </div>
                <MapLegend />
                <Tooltip tip={tip} />
            </div>
        </section>
    );
}
