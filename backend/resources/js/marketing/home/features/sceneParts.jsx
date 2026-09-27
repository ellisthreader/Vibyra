import React from "react";

/* Small pieces several scenes share: the pointer, a provider mark, the
 * terminal header, and the stage every scene is drawn on. */

export function Stage({ name, children }) {
    return <div className={`fx-stage fx-stage-${name}`}>{children}</div>;
}

export function Pointer({ className = "" }) {
    return (
        <svg className={`fx-pointer ${className}`} width="18" height="22" viewBox="0 0 18 22">
            <path
                d="M2 1.5v16.2l4.3-4 2.8 6.6 3-1.3-2.8-6.4h6z"
                fill="#fff"
                stroke="#171a21"
                strokeWidth="1.4"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function Crosshair({ className = "" }) {
    return (
        <svg className={`fx-crosshair ${className}`} width="22" height="22" viewBox="0 0 22 22">
            <path d="M11 1v8M11 13v8M1 11h8M13 11h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d="M11 1v8M11 13v8M1 11h8M13 11h8" stroke="#171a21" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
    );
}

/* Provider marks are drawn as one-colour silhouettes so the section keeps a
 * single palette; the colour comes from the surrounding `color`. */
export function Mark({ logo, size = 14 }) {
    const style = { width: size, height: size, "--logo": `url(/media/marketing/providers/${logo}.svg)` };
    return <i className="fx-mark" style={style} />;
}

export function TermBar({ logo, name, tag }) {
    return (
        <p className="fx-termbar">
            {logo && <Mark logo={logo} size={12} />}
            <span>{name}</span>
            {tag && <i>{tag}</i>}
            <b />
        </p>
    );
}
