import React from "react";
import { formatCount } from "./format.js";

export default function OwnerMetric({ label, value, note, accent = false, money = false }) {
  return <div className={`owner-metric ${accent ? "owner-metric--accent" : ""}`}>
    <p>{label}</p>
    <strong>{money ? value : formatCount(value)}</strong>
    {note && <small>{note}</small>}
  </div>;
}

export function OwnerBars({ title, rows = [], labelKey = "event", empty = "No activity recorded yet." }) {
  const largest = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
  return <section className="owner-panel owner-bars">
    <div className="owner-panel__heading"><p className="owner-kicker">Breakdown</p><h3>{title}</h3></div>
    {rows.length ? <div className="owner-bars__list">{rows.map((row, index) => <div className="owner-bars__row" key={`${row[labelKey]}-${index}`}>
      <div className="owner-bars__labels"><span>{row[labelKey]}</span><strong>{formatCount(row.count)}</strong></div>
      <div className="owner-bars__track"><div style={{ width: `${Math.max(2, Number(row.count || 0) / largest * 100)}%` }} /></div>
    </div>)}</div> : <p className="owner-empty">{empty}</p>}
  </section>;
}
