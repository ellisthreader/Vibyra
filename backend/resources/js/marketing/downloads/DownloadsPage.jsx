import React from "react";
import { HomeNav, HomeFooter } from "../home/Navigation.jsx";
import DownloadHero from "./DownloadHero.jsx";
import PlatformCards from "./PlatformCards.jsx";
import useReleaseCatalog from "./useReleaseCatalog.js";

export default function DownloadsPage() {
    const { catalog, error, retry } = useReleaseCatalog();
    return (
        <div className="marketing-home marketing-home-cinematic downloads-page">
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav homePath="/" />
            <main id="main">
                <DownloadHero />
                <PlatformCards
                    catalog={catalog}
                    error={error}
                    retry={retry}
                />
            </main>
            <HomeFooter homePath="/" />
        </div>
    );
}
