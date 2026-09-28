import React from "react";

// The desktop app draws every glyph on a 24 grid at strokeWidth 2 (iconFactory.tsx).
// The marketing Icon uses 1.6, which reads visibly lighter, so the device keeps its own.
const paths = {
    home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </>
    ),
    bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8M13.7 21a2 2 0 0 1-3.4 0" />,
    gear: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
        </>
    ),
    phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4m-3 14h2" /></>,
    terminal: <path d="m4 17 6-5-6-5m8 10h8" />,
    bot: (
        <>
            <rect x="3" y="8" width="18" height="12" rx="3" />
            <path d="M12 8V4m-4 9v1m8-1v1" />
        </>
    ),
    chat: <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />,
    monitor: (
        <>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8m-4-4v4" />
        </>
    ),
    sparkles: <path d="m12 3 2 5.5L19.5 11 14 13l-2 5.5L10 13l-5.5-2L10 8.5Z" />,
    gauge: (
        <>
            <path d="M4 18a8 8 0 1 1 16 0" />
            <path d="m12 14 4-4" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5.2l3.2 2" />
        </>
    ),
    shield: <path d="M12 3.5 5 6.2v5.1c0 4.4 2.9 7.9 7 9.2 4.1-1.3 7-4.8 7-9.2V6.2Z" />,
    book: (
        <>
            <path d="M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
            <path d="M4 16.5h14" />
        </>
    ),
    trash: <path d="M4.5 7h15M9.5 7V4.5h5V7m-8 0 .8 12a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4L16.5 7" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    branch: (
        <>
            <circle cx="6" cy="5" r="2.5" />
            <circle cx="6" cy="19" r="2.5" />
            <circle cx="18" cy="7" r="2.5" />
            <path d="M6 7.5v9M18 9.5c0 4-6 2.5-6 7" />
        </>
    ),
    file: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Zm0 0v5h5" />,
    moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
    close: <path d="M6 6 18 18M18 6 6 18" />,
    minimize: <path d="M5 12h14" />,
    maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
    send: <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4Z" />,
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
    expand: <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    dockCompact: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
        </>
    ),
    dockWide: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M11 4v16" />
        </>
    ),
    dockFull: <rect x="3" y="4" width="18" height="16" rx="2" />,
    back: <path d="m15 6-6 6 6 6" />,
    arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
    mic: (
        <>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </>
    ),
    pause: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M10 9v6m4-6v6" />
        </>
    ),
    handoff: <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />,
    open: <path d="M8 16 16 8m-7 0h7v7" />,
};

export default function DeviceIcon({ name, size = 16, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {paths[name] ?? paths.file}
        </svg>
    );
}
