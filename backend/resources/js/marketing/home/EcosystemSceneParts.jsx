import React from "react";

export const at = (start, end) => ({ "--in": `${start}s`, ...(end != null ? { "--out": `${end}s` } : {}) });
export const T = ({ at: t, out, className = "", children, style, tag: Tag = "div" }) => (
    <Tag className={`t ${out != null ? "out " : ""}${className}`} style={{ ...at(t, out), ...style }}>
        {children}
    </Tag>
);
export const Type = ({ at: t, text, dur = 1.2, className = "" }) => (
    <span className={`type ${className}`} style={{ ...at(t), "--n": text.length, "--dur": `${dur}s` }}>
        {text}
    </span>
);
export const Words = ({ at: t, text, gap = 0.28 }) => (
    <span className="es-words">
        {text.split(" ").map((word, i) => (
            <T key={i} tag="span" at={t + i * gap}>
                {word}
            </T>
        ))}
    </span>
);
export const Key = ({ at: t, children, className = "" }) => (
    <kbd className={`es-key ${className}`} style={at(t)}>
        {children}
    </kbd>
);
export const Term = ({ children, className = "", name = "Claude Code", tag }) => (
    <div className={`es-term ${className}`}>
        <p className="es-termbar">
            <i className="es-mark" />
            {name}
            {tag && <span>{tag}</span>}
            <b />
        </p>
        <div className="es-termbody">{children}</div>
    </div>
);
export const Pointer = ({ className = "" }) => (
    <svg className={`es-pointer ${className}`} viewBox="0 0 18 22" width="16" height="20" aria-hidden="true">
        <path d="M2 1.5v16.2l4.3-4 2.8 6.6 3-1.3-2.8-6.4h6z" fill="#fff" stroke="#171a21" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
);
export const Icon = ({ d }) => (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
