import React from "react";

export const DOWNLOAD_URL = document.getElementById("marketing-root")?.dataset.downloadUrl || "/downloads";

const paths = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" />,
    play: <path d="m9 5 11 7-11 7Z" />,
    code: <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" />,
    terminal: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="m7 9 3 3-3 3m6 0h4" />
        </>
    ),
    grid: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
    ),
    phone: (
        <>
            <rect x="6" y="2" width="12" height="20" rx="3" />
            <path d="M10 5h4m-3 14h2" />
        </>
    ),
    monitor: (
        <>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8m-4-4v4" />
        </>
    ),
    branch: (
        <>
            <circle cx="6" cy="5" r="2" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="5" r="2" />
            <path d="M6 7v10m12-10c0 7-12 3-12 10" />
        </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    file: <path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8m-8 4h5" />,
    notes: <path d="M5 3h14v18H5zM9 3v18m3-13h4m-4 4h4" />,
    capture: (
        <>
            <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
        </>
    ),
    mic: (
        <>
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6" />
        </>
    ),
    shield: (
        <>
            <path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z" />
            <path d="m8 11 3 3 5-5" />
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18" />
        </>
    ),
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 7h16M4 17h16" />,
    chevron: <path d="m8 5 7 7-7 7" />,
};

export function Icon({ name = "arrow", size = 20, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {paths[name] ?? paths.arrow}
        </svg>
    );
}

export function Brand({ word = true }) {
    return (
        <span className="brand">
            <img src="/vibyra-cobalt.png" alt="" width="32" height="24" />
            {word && (
                <span>
                    vibyra<span className="brand-period">.</span>
                </span>
            )}
        </span>
    );
}

export function Action({ children, href = DOWNLOAD_URL, secondary = false, icon = "arrow", ...props }) {
    return (
        <a className={`action ${secondary ? "action-secondary" : "action-primary"}`} href={href} {...props}>
            {children}
            <Icon name={icon} size={18} />
        </a>
    );
}

export function SectionLabel({ number, children, light = false }) {
    return (
        <p className={`section-label ${light ? "section-label-light" : ""}`}>
            <span>{number}</span>
            {children}
        </p>
    );
}

export function TabKeys(event, items, current, onChange, prefix) {
    const offset = ["ArrowRight", "ArrowDown"].includes(event.key)
        ? 1
        : ["ArrowLeft", "ArrowUp"].includes(event.key)
          ? -1
          : 0;
    const next =
        event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current + offset + items.length) % items.length;
    if (!offset && !["Home", "End"].includes(event.key)) return;
    event.preventDefault();
    onChange(next);
    document.getElementById(`${prefix}-${next}`)?.focus();
}
