import React from "react";
import { formatCount, formatDay } from "./format.js";

const PLOT = { left: 28, right: 574, top: 18, bottom: 170 };

function pointsFor(rows, key, max) {
  return rows.map((row, index) => {
    const x = PLOT.left + ((PLOT.right - PLOT.left) * index) / Math.max(1, rows.length - 1);
    const y = PLOT.bottom - ((PLOT.bottom - PLOT.top) * Number(row[key] || 0)) / max;
    return [x, y];
  });
}

function line(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

export default function OwnerTrend({ rows = [], primary, secondary, title, color = "blue", compact = false }) {
  const keys = [primary?.key, secondary?.key].filter(Boolean);
  const max = Math.max(1, ...rows.flatMap((row) => keys.map((key) => Number(row[key] || 0))));
  const main = pointsFor(rows, primary.key, max);
  const other = secondary ? pointsFor(rows, secondary.key, max) : [];
  const labelEvery = Math.max(1, Math.ceil(rows.length / (compact ? 3 : 6)));

  return <section className={`owner-trend owner-trend--${color} ${compact ? "owner-trend--compact" : ""}`} aria-label={title}>
    <div className="owner-trend__top">
      <div><p className="owner-kicker">Daily activity</p><h3>{title}</h3></div>
      <div className="owner-trend__legend">
        <span><i className="owner-trend__dot" />{primary.label}</span>
        {secondary && <span><i className="owner-trend__dot owner-trend__dot--secondary" />{secondary.label}</span>}
      </div>
    </div>
    {rows.length ? <svg viewBox="0 0 600 205" role="img" aria-label={`${title}: ${rows.length} days of activity`} preserveAspectRatio="none">
      {[0, .5, 1].map((fraction) => <g key={fraction}>
        <line className="owner-trend__grid" x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom - fraction * (PLOT.bottom - PLOT.top)} y2={PLOT.bottom - fraction * (PLOT.bottom - PLOT.top)} />
        {!compact && <text className="owner-trend__axis" x="0" y={PLOT.bottom - fraction * (PLOT.bottom - PLOT.top) + 4}>{formatCount(Math.round(max * fraction))}</text>}
      </g>)}
      {main.length > 1 && <path className="owner-trend__area" d={`${line(main)} L${PLOT.right} ${PLOT.bottom} L${PLOT.left} ${PLOT.bottom} Z`} />}
      <path className="owner-trend__line" d={line(main)} />
      {other.length > 0 && <path className="owner-trend__line owner-trend__line--secondary" d={line(other)} />}
      {rows.map((row, index) => (index === 0 || index === rows.length - 1 || index % labelEvery === 0) &&
        <text className="owner-trend__axis owner-trend__axis--date" key={`${row.date}-${index}`} x={main[index]?.[0] ?? 0} y="198" textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}>{formatDay(row.date)}</text>)}
    </svg> : <p className="owner-empty">Trends will appear once activity is recorded.</p>}
  </section>;
}
