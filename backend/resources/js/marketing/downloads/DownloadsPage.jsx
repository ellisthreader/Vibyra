import React, { useMemo, useState } from "react";
import { HomeNav, HomeFooter } from "../home/Navigation.jsx";
import { recommendedPlatform } from "../../portal/platform.js";
import DownloadHero from "./DownloadHero.jsx";
import PlatformCards from "./PlatformCards.jsx";
import SetupGuide from "./SetupGuide.jsx";
import DownloadQuestions from "./DownloadQuestions.jsx";
import useReleaseCatalog from "./useReleaseCatalog.js";

export default function DownloadsPage() {
    const { catalog, error, retry } = useReleaseCatalog();
    const recommended = useMemo(() => recommendedPlatform(), []);
    const [setupPlatform, setSetupPlatform] = useState(recommended ?? "windows");
    return (
        <div className="marketing-home downloads-page">
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav homePath="/" />
            <main id="main">
                <DownloadHero version={catalog?.latest} />
                <PlatformCards
                    catalog={catalog}
                    error={error}
                    retry={retry}
                    recommended={recommended}
                    onSetup={setSetupPlatform}
                />
                <SetupGuide catalog={catalog} platform={setupPlatform} onPlatformChange={setSetupPlatform} />
                <DownloadQuestions />
            </main>
            <HomeFooter homePath="/" />
        </div>
    );
}
