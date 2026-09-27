import React from "react";
import { Mark } from "./sceneParts.jsx";

/* The graph of the worktree scene: main along the bottom, one lane per
 * safe-mode terminal forking off it, in three shades of the one blue. Each
 * lane draws in, carries a pulse while its agent works and gains commits;
 * Claude Code's lane merges back once its changes are approved. Coordinates
 * are stage pixels on a 560×320 stage. */
const LANES = [
    {
        id: "c",
        agent: "Claude Code",
        logo: "claude-color",
        branch: "vibyra/weekly-summary",
        file: "WeekSummary.tsx",
        diff: "+64",
        y: 234,
        x: 160,
        path: "M84 292C116 292 120 234 156 234H372",
        commits: [214, 272, 332],
    },
    {
        id: "b",
        agent: "Codex",
        logo: "openai",
        branch: "vibyra/summary-tests",
        file: "week.test.ts",
        diff: "+31",
        y: 176,
        x: 168,
        path: "M84 292C120 292 124 176 164 176H428",
        commits: [226, 306, 386],
    },
    {
        id: "a",
        agent: "Gemini CLI",
        logo: "gemini-color",
        branch: "vibyra/readme",
        file: "README.md",
        diff: "+12",
        y: 118,
        x: 176,
        path: "M84 292C124 292 128 118 172 118H468",
        commits: [236, 322, 408],
    },
];

export default function LanesGraph() {
    return (
        <>
            <p className="ln-safe">
                <span className="ln-toggle">
                    <i />
                </span>
                Safe mode
                <em>Recommended</em>
            </p>
            <svg className="ln-svg" viewBox="0 0 560 320" width="560" height="320">
                <path className="ln-main" d="M56 292H544" />
                <path className="ln-main-glow" pathLength="1" d="M84 292H436" />
                {LANES.map((lane) => (
                    <g className={`ln-lane ln-lane-${lane.id}`} key={lane.id}>
                        <path className="ln-draw" pathLength="1" d={lane.path} />
                        <path className="ln-pulse" pathLength="100" d={lane.path} />
                        {lane.commits.map((x, index) => (
                            <circle className={`ln-commit ln-commit-${index}`} cx={x} cy={lane.y} r="4.5" key={x} />
                        ))}
                    </g>
                ))}
                <path className="ln-merge" pathLength="1" d="M372 234C404 234 404 292 436 292" />
                <circle className="ln-base" cx="84" cy="292" r="5" />
                <circle className="ln-ring" cx="436" cy="292" r="7" />
                <circle className="ln-landed" cx="436" cy="292" r="7" />
                <path className="ln-tick" d="M432.6 292.2l2.3 2.3 4.3-4.6" />
            </svg>
            {LANES.map((lane) => (
                <React.Fragment key={lane.id}>
                    <p className={`ln-label ln-label-${lane.id}`} style={{ "--x": `${lane.x}px`, "--y": `${lane.y - 24}px` }}>
                        <Mark logo={lane.logo} size={12} />
                        <strong>{lane.agent}</strong>
                        <span>{lane.branch}</span>
                    </p>
                    <p className={`ln-chip ln-chip-${lane.id}`} style={{ "--x": `${lane.x + 40}px`, "--y": `${lane.y + 10}px` }}>
                        {lane.file}
                        <b>{lane.diff}</b>
                    </p>
                </React.Fragment>
            ))}
            <p className="ln-ready-tag">Ready to review</p>
            <p className="ln-working">
                <i />
                <i />
                <i />
            </p>
            <p className="ln-mainlabel">main</p>
            <p className="ln-stays">Your current work stays exactly where it is.</p>
        </>
    );
}
