import React from "react";
import { Icon } from "../home/shared.jsx";
import { formatBytes } from "../../portal/platform.js";
import { available, fileUrl } from "./catalog.js";

export const platforms = [
    {
        key: "windows",
        label: "Windows",
        icon: "microsoft.svg",
        detail: "For your Windows workspace.",
        variants: [["windows", "Download for Windows", "64-bit · .exe installer"]],
    },
    {
        key: "linux",
        label: "Linux",
        icon: "linux-tux.svg",
        detail: "Your distro. Your way to build.",
        variants: [
            ["linux-deb", "Download .deb", "Debian / Ubuntu · 64-bit"],
            ["linux", "Download AppImage", "AppImage · 64-bit"],
        ],
    },
    {
        key: "macos",
        label: "macOS",
        icon: "apple.svg",
        detail: "A little more time in the making.",
        variants: [
            ["macos-arm64", "Apple Silicon", "M-series Macs"],
            ["macos-x64", "Intel", "Intel-based Macs"],
        ],
    },
];

function PackageLink({ catalog, platform, label, detail, primary }) {
    const release = catalog.releases[platform];
    const href = fileUrl(catalog, platform);
    if (!href) return null;
    return (
        <div className="download-package">
            <a
                className={`action ${primary ? "action-primary" : "action-secondary"}`}
                href={href}
                aria-label={label}
            >
                {label}
                <Icon name="download" size={17} />
            </a>
            <p>
                {detail}
                {release.minimumSystemVersion &&
                    ` · ${platform.startsWith("macos") ? "macOS " : ""}${release.minimumSystemVersion}+`}
            </p>
            <span>
                v{release.version}
                <i>·</i>
                {formatBytes(release.sizeBytes)}
            </span>
        </div>
    );
}

export default function PlatformCards({ catalog, error, retry, recommended, onSetup }) {
    return (
        <section className="download-platforms page-width" id="installers" aria-labelledby="platforms-title">
            <div className="download-section-heading">
                <h2 id="platforms-title">Make yourself at home.</h2>
                <p>Choose your desktop.</p>
            </div>
            {error ? (
                <div className="download-error" role="alert">
                    <Icon name="globe" size={27} />
                    <h3>We couldn’t load the current downloads.</h3>
                    <p>Give it another try to check which installers are available.</p>
                    <button className="action action-primary" onClick={retry}>
                        Try again
                        <Icon />
                    </button>
                </div>
            ) : !catalog ? (
                <div className="download-loading-grid" role="status" aria-label="Loading current downloads">
                    {platforms.map((platform) => (
                        <div key={platform.key}>
                            <span />
                            <i />
                            <i />
                            <b />
                        </div>
                    ))}
                    <span className="download-loading-label">Checking current downloads…</span>
                </div>
            ) : (
                <div className="download-platform-grid">
                    {platforms.map((platform) => {
                        const packages = platform.variants.filter(([key]) =>
                            available(catalog.releases[key]),
                        );
                        const highlighted = recommended === platform.key && packages.length > 0;
                        return (
                            <article
                                className={`download-platform ${highlighted ? "download-platform-recommended" : ""} ${!packages.length ? "download-platform-unavailable" : ""}`}
                                key={platform.key}
                                aria-labelledby={`platform-${platform.key}`}
                            >
                                <div className="download-platform-head">
                                    <span className={`download-os-icon download-os-${platform.key}`}>
                                        <img
                                            src={`/platform-icons/${platform.icon}`}
                                            alt=""
                                            width="35"
                                            height="35"
                                        />
                                    </span>
                                    {highlighted && (
                                        <span className="download-recommended">FOR THIS COMPUTER</span>
                                    )}
                                    {!packages.length && (
                                        <span className="download-soon">
                                            {platform.key === "macos" ? "COMING SOON" : "UNAVAILABLE"}
                                        </span>
                                    )}
                                </div>
                                <h3 id={`platform-${platform.key}`}>{platform.label}</h3>
                                <p>
                                    {platform.key === "macos" && packages.length
                                        ? packages.some(([key]) => catalog.releases[key].notarized === false)
                                            ? "Mac beta — first launch needs approval in macOS settings."
                                            : "Choose the chip inside your Mac."
                                        : platform.detail}
                                </p>
                                <div className="download-platform-actions">
                                    {packages.length ? (
                                        packages.map(([key, label, detail], index) => (
                                            <PackageLink
                                                key={key}
                                                catalog={catalog}
                                                platform={key}
                                                label={label}
                                                detail={detail}
                                                primary={index === 0}
                                            />
                                        ))
                                    ) : (
                                        <div className="download-unavailable-copy">
                                            <Icon
                                                name={platform.key === "macos" ? "spark" : "globe"}
                                                size={20}
                                            />
                                            <p>
                                                {platform.key === "macos"
                                                    ? "We’re getting Vibyra ready for Mac. Public installers aren’t available yet."
                                                    : "This installer is temporarily unavailable. Please check back shortly."}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <a
                                    className="download-install-link"
                                    href={packages.length ? "#setup" : "#download-questions"}
                                    onClick={() => {
                                        if (packages.length) onSetup(platform.key);
                                    }}
                                >
                                    {packages.length ? "Getting set up" : "A few helpful answers"}
                                    <Icon size={15} />
                                </a>
                            </article>
                        );
                    })}
                </div>
            )}
            <div className="download-beta-note">
                <span>BETA, AND GETTING BETTER.</span>
                <p>Vibyra is early software. Expect a few rough edges as we keep improving the workspace.</p>
            </div>
        </section>
    );
}
