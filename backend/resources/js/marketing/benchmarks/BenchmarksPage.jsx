import React, { useState } from "react";
import { HomeNav, HomeFooter } from "../home/Navigation.jsx";
import { MODELS } from "./data.js";
import BenchHero from "./BenchHero.jsx";
import TopPicks from "./TopPicks.jsx";
import BenchmarkExplorer from "./BenchmarkExplorer.jsx";
import Methodology from "./Methodology.jsx";

export default function BenchmarksPage() {
    const [focus, setFocus] = useState(null);
    const pin = (id) => setFocus((current) => (current === id ? null : id));
    const shared = { models: MODELS, focus, onFocus: pin };
    return (
        <div className="marketing-home marketing-home-cinematic benchmarks-page">
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav homePath="/" />
            <main id="main">
                <BenchHero count={MODELS.length} />
                <TopPicks models={MODELS} />
                <BenchmarkExplorer {...shared} />
                <Methodology />
            </main>
            <HomeFooter homePath="/" />
        </div>
    );
}
