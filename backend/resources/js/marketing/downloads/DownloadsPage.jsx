import React, { useMemo } from "react";
import { HomeNav, HomeFooter } from "../home/Navigation.jsx";
import { recommendedPlatform } from "../../portal/platform.js";
import DownloadHero from "./DownloadHero.jsx";
import PlatformCards from "./PlatformCards.jsx";
import useReleaseCatalog from "./useReleaseCatalog.js";

export default function DownloadsPage() {
    const { catalog, error, retry } = useReleaseCatalog();
    const recommended = useMemo(() => recommendedPlatform(), []);
    return (
        <div className="marketing-home downloads-page">
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
                    recommended={recommended}
                />
            </main>
            <HomeFooter homePath="/" />
        </div>
    );
}
