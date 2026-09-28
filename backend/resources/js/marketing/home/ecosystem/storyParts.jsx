import React from "react";

/* Shared pieces for the ecosystem stories. `T` fades in at `--in` (and out
 * at `--out` when given); `Type` types its text over `dur` seconds; `Words`
 * lands one word at a time. Base styles are always the finished frame, so a
 * still card (reduced motion) shows how the story ends. */

export const at = (start, end) => ({ "--in": `${start}s`, ...(end != null ? { "--out": `${end}s` } : {}) });

export function T({ at: t, out, className = "", children, style, tag: Tag = "div" }) {
    return (
        <Tag className={`t ${out != null ? "out " : ""}${className}`} style={{ ...at(t, out), ...style }}>
            {children}
        </Tag>
    );
}

export function Type({ at: t, text, dur = 1.2, className = "" }) {
    return (
        <span className={`type ${className}`} style={{ ...at(t), "--n": text.length, "--dur": `${dur}s` }}>
            {text}
        </span>
    );
}

export function Words({ at: t, text, gap = 0.3 }) {
    return (
        <span className="ecs-words">
            {text.split(" ").map((word, i) => (
                <T key={i} tag="span" at={t + i * gap}>
                    {word}
                </T>
            ))}
        </span>
    );
}

export function Key({ at: t, children, className = "" }) {
    return (
        <kbd className={`ecs-key ${className}`} style={at(t)}>
            {children}
        </kbd>
    );
}

export function Pointer({ className = "" }) {
    return (
        <svg className={`ecs-pointer ${className}`} viewBox="0 0 18 22" width="17" height="21" aria-hidden="true">
            <path d="M2 1.5v16.2l4.3-4 2.8 6.6 3-1.3-2.8-6.4h6z" fill="#fff" stroke="#111216" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
    );
}

export function Check({ className = "" }) {
    return (
        <svg className={`ecs-check ${className}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="8" />
            <path d="m4.6 8.2 2.2 2.2 4.6-4.8" />
        </svg>
    );
}

/* The title bar every window shares: three quiet dots, then its contents. */
export function Bar({ children, dots = true }) {
    return (
        <div className="ecs-bar">
            {dots && (
                <span className="ecs-dots">
                    <i />
                    <i />
                    <i />
                </span>
            )}
            {children}
        </div>
    );
}

/* Grey placeholder text, the way Grok's scenes keep the eye on what moves. */
export const Skel = ({ w, className = "" }) => <i className={`ecs-skel ${className}`} style={{ width: w }} />;
