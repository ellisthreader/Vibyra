import React, { useEffect, useState } from "react";
import Leaderboard from "./Leaderboard.jsx";
import CostPerformance from "./CostPerformance.jsx";
import ScoreTable from "./ScoreTable.jsx";
import HeadToHead from "./HeadToHead.jsx";

const VIEWS = [
    ["leaderboard", "Rankings", Leaderboard],
    ["value", "Cost & performance", CostPerformance],
    ["scores", "All scores", ScoreTable],
    ["compare", "Head to head", HeadToHead],
];
const fromHash = () => VIEWS.some(([id]) => `#${id}` === window.location.hash)
    ? window.location.hash.slice(1) : "leaderboard";

export default function BenchmarkExplorer({ models, focus, onFocus }) {
    const [view, setView] = useState(fromHash);
    useEffect(() => {
        const sync = () => {
            if (VIEWS.some(([id]) => `#${id}` === window.location.hash)) setView(fromHash());
        };
        window.addEventListener("hashchange", sync);
        return () => window.removeEventListener("hashchange", sync);
    }, []);
    return (
        <div className="page-width bm-explorer">
            <div className="bm-explorer-nav">
                <div className="bm-views" role="group" aria-label="Comparison view">
                    {VIEWS.map(([id, label]) => (
                        <button key={id} aria-pressed={view === id} aria-controls={`bm-view-${id}`}
                            onClick={() => setView(id)}>{label}</button>
                    ))}
                </div>
                <a href="#method" className="bm-method-link">How we score <span aria-hidden="true">↗</span></a>
            </div>
            {VIEWS.map(([id, , Component]) => (
                <div key={id} id={`bm-view-${id}`} hidden={view !== id}>
                    <Component models={models} focus={focus} onFocus={onFocus} />
                </div>
            ))}
        </div>
    );
}
