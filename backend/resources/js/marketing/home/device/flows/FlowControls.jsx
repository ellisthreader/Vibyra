import React from "react";
export function Row({ label, hint, children }) {
    return <div className="vdev-setting-row"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><div>{children}</div></div>;
}
export function Toggle({ label, value, onChange }) {
    return <button type="button" role="switch" aria-label={label} aria-checked={value} className="vdev-switch" onClick={() => onChange(!value)}><i /></button>;
}
export function Group({ title, children }) {
    return <section className="vdev-setting-group"><h4>{title}</h4><div>{children}</div></section>;
}
export function Segments({ label, value, options, onChange }) {
    return <div className="vdev-segments" role="group" aria-label={label}>{options.map(option => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>;
}
