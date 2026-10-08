import React, { useState } from "react";
import { HomeNav, HomeFooter } from "../home/Navigation.jsx";
import { ALL_MODELS } from "./data.js";
import BenchHero from "./BenchHero.jsx";
import TopPicks from "./TopPicks.jsx";
import BenchmarkExplorer from "./BenchmarkExplorer.jsx";
import Methodology from "./Methodology.jsx";
import EffortPicker from "./EffortPicker.jsx";
import { selectEffort } from "./effortSelection.js";

export default function BenchmarksPage() {
    const [effort, setEffort] = useState("highest");
    const models = selectEffort(ALL_MODELS, effort);
    const [focus, setFocus] = useState(null);
    const pin = (id) => setFocus((current) => (current === id ? null : id));
    const shared = { models, focus, onFocus: pin };
    return (
        <div className="marketing-home marketing-home-cinematic benchmarks-page">
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <HomeNav homePath="/" />
            <main id="main">
                <BenchHero count={new Set(models.map((m) => m.modelId ?? m.id)).size} />
                <EffortPicker value={effort} models={ALL_MODELS} onChange={(value) => { setEffort(value); setFocus(null); }} />
                <TopPicks models={models} />
                <BenchmarkExplorer {...shared} />
                <Methodology />
            </main>
            <HomeFooter homePath="/" />
        </div>
    );
}
