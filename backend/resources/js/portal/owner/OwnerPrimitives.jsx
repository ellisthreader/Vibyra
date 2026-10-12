import React from "react";
import { formatCount, readableDimension } from "./format.js";
import OwnerIcon from "./OwnerIcon.jsx";

export function Metric({ label, value, note, scope, onClick, text = false }) {
  const content = <>
    <span className="od-metric-label">{label}{onClick && <OwnerIcon name="arrow" />}</span>
    <strong className="od-metric-value">{text ? value ?? "—" : formatCount(value)}</strong>
    <span className="od-metric-note">{scope && <b>{scope}</b>}{note}</span>
  </>;
  return onClick ? <button className="od-metric" onClick={onClick}>{content}</button>
    : <div className="od-metric">{content}</div>;
}
export function Panel({ title, subtitle, action, children, className = "" }) {
  return <section className={"od-panel " + className}>
    {(title || action) && <header className="od-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
    {children}
  </section>;
}
export function Empty({ title = "No activity recorded", children }) {
  return <div className="od-empty"><span className="od-empty-mark"><OwnerIcon name="tracking" /></span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Facts({ rows }) {
  return <dl className="od-facts">{rows.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
}
export function Breakdown({ title, rows, labelKey = "label", empty = "No records in this period.", note }) {
  const max = Math.max(1, ...(rows || []).map(row => Number(row.count) || 0));
  return <Panel title={title}>
    {!Array.isArray(rows) ? <Empty title="Data unavailable">This breakdown is not included in the report.</Empty>
      : !rows.length ? <p className="od-muted od-empty-line">{empty}</p>
        : <ul className="od-breakdown">{rows.map((row, index) =>
          <li key={String(row[labelKey]) + index}><div><span title={String(row[labelKey] || "")}>{readableDimension(row[labelKey] || "Unknown")}</span><strong>{formatCount(row.count)}</strong></div>
            <span className="od-bar" aria-hidden="true"><i style={{ width: Math.max(0, Number(row.count) / max * 100) + "%" }} /></span>
          </li>)}</ul>}
    {note && <p className="od-note">{note}</p>}
  </Panel>;
}
export function Details({ title = "How these figures are counted", children }) {
  return <details className="od-details"><summary>{title}</summary><div>{children}</div></details>;
}
export function Tabs({ items, value, onChange }) {
  return <nav className="od-tabs" aria-label="Report sections">{items.map(([key, label]) =>
    <button key={key} aria-current={value === key ? "page" : undefined} onClick={() => onChange(key)}>{label}</button>)}</nav>;
}
export function ErrorMessage({ children, onRetry }) {
  return <div className="od-error" role="alert"><div><strong>We couldn’t load the latest information</strong><p>{children}</p></div>
    {onRetry && <button className="od-button" onClick={onRetry}>Try again</button>}</div>;
}
