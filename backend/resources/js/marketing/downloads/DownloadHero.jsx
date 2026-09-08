import React from "react";

export default function DownloadHero({ version }) {
    return (
        <section className="download-hero page-width" id="top" aria-labelledby="download-title">
            <h1 id="download-title">
                Download Vibyra<span>.</span>
            </h1>
            <p className="download-hero-description">Your AI coding workspace, on your desktop.</p>
            <p className="download-hero-meta">
                <span>Free to download</span>
                <span aria-hidden="true">·</span>
                <span className="download-release-label">Desktop beta{version && ` · v${version}`}</span>
            </p>
        </section>
    );
}
