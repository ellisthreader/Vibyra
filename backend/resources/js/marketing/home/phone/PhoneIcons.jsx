import React from "react";

/* The concept's own icon set, so the phone reads as the product, not as the
 * marketing page's iconography. */
const paths = {
    chat: <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-7a9 9 0 1 1 18-3Z" />,
    terminal: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="m7 9 3 3-3 3m6 0h4" />
        </>
    ),
    search: (
        <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4 4" />
        </>
    ),
    down: <path d="m7 10 5 5 5-5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    settings: (
        <>
            <path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    computer: (
        <>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8m-4-4v4" />
        </>
    ),
    spark: <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" />,
    more: (
        <>
            <circle cx="5" cy="12" r=".8" />
            <circle cx="12" cy="12" r=".8" />
            <circle cx="19" cy="12" r=".8" />
        </>
    ),
    panel: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
        </>
    ),
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    file: <path d="M14 3H5v18h14V8l-5-5Zm0 0v6h5" />,
    branch: (
        <>
            <circle cx="6" cy="5" r="2" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="6" r="2" />
            <path d="M6 7v10m0-2c0-5 12-1 12-7" />
        </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    wifi: (
        <>
            <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0" />
            <circle cx="12" cy="20" r=".5" />
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" />
        </>
    ),
    open: <path d="M14 4h6v6m0-6-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
    refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
};

export default function PIcon({ name, className = "" }) {
    return (
        <svg className={`ph-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
            {paths[name] ?? paths.chat}
        </svg>
    );
}
