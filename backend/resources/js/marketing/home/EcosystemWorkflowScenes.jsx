import React from "react";
import { at, T } from "./EcosystemSceneParts.jsx";

/* 3 · A lane for every agent: Safe mode forks a Git worktree per agent off
 * main; the three commit side by side, then each branch merges back into
 * main without touching the others. Drawn as a branch graph. */
const LANES = [
    { logo: "claude-color", name: "Claude", branch: "claude/dark-mode", y: 72 },
    { logo: "openai", name: "Codex", branch: "codex/api-tests", y: 114 },
    { logo: "gemini-color", name: "Gemini", branch: "gemini/docs", y: 156 },
];
const MAIN_Y = 30;
const COMMITS = [104, 146, 188, 222];
export function LanesScene() {
    return (
        <div className="es es-wt">
            <svg className="es-wt-graph" viewBox="0 0 300 180" width="300" height="180" aria-hidden="true">
                <path className="es-wt-main" d={`M6 ${MAIN_Y}H294`} pathLength="1" />
                {LANES.map((lane, i) => (
                    <g key={lane.name}>
                        <path
                            className="es-wt-fork"
                            d={`M22 ${MAIN_Y}C40 ${MAIN_Y} 40 ${lane.y} 58 ${lane.y}H240`}
                            pathLength="1"
                            style={at(0.5 + i * 0.15)}
                        />
                        {COMMITS.map((x, j) => (
                            <circle key={x} className="es-wt-commit" cx={x} cy={lane.y} r="4" style={at(1.4 + j * 0.5 + i * 0.17)} />
                        ))}
                        <path
                            className="es-wt-merge"
                            d={`M240 ${lane.y}C258 ${lane.y} 258 ${MAIN_Y} 276 ${MAIN_Y}`}
                            pathLength="1"
                            style={at(4.3 + i * 0.35)}
                        />
                    </g>
                ))}
                <circle className="es-wt-root" cx="22" cy={MAIN_Y} r="5" />
                <circle className="es-wt-head" cx="276" cy={MAIN_Y} r="5.5" style={at(4.6)} />
            </svg>
            <p className="es-wt-mainlabel">main</p>
            {LANES.map((lane, i) => (
                <React.Fragment key={lane.name}>
                    <T at={0.8 + i * 0.15} className="es-wt-label" style={{ top: lane.y - 21 }}>
                        <img className={`es-wt-logo es-wt-logo-${lane.logo}`} src={`/media/marketing/providers/${lane.logo}.svg`} alt="" />
                        <b>{lane.name}</b>
                        <code>{lane.branch}</code>
                    </T>
                    <T at={1.0 + i * 0.15} className="es-wt-path" style={{ top: lane.y + 7 }}>
                        <i />
                        worktree · orbit-{lane.name.toLowerCase()}
                    </T>
                </React.Fragment>
            ))}
            <T at={5.6} className="es-wt-done">
                ✓ 3 merged, nothing overwritten
            </T>
        </div>
    );
}

/* 4 · Live preview: a real little site, reflowing as the frame becomes each
 * device. The layout answers to the frame's own width (container queries in
 * home-ecosystem-scenes.css), so it reflows like the real thing. */
const DEVICES = ["iPhone 15", "iPad mini", "MacBook", "TV"];
export function PreviewScene() {
    return (
        <div className="es es-pv">
            <p className="es-pv-bar">
                {DEVICES.map((d) => (
                    <b key={d}>{d}</b>
                ))}
            </p>
            <div className="es-pv-frame">
                <div className="es-pv-site">
                    <p className="es-pv-nav">
                        <i />
                        orbit
                        <span>Features</span>
                        <span>Pricing</span>
                        <em />
                    </p>
                    <div className="es-pv-hero">
                        <div className="es-pv-copy">
                            <p className="es-pv-h">
                                Small steps.
                                <br />
                                <span>Good things.</span>
                            </p>
                            <p className="es-pv-sub">A calmer way to keep habits.</p>
                            <b className="es-pv-cta">Get started</b>
                        </div>
                        <div className="es-pv-week">
                            <p>This week</p>
                            <div>
                                {"MTWTFSS".split("").map((d, i) => (
                                    <span key={i} className={i < 4 ? "on" : i === 4 ? "today" : ""}>
                                        {d}
                                    </span>
                                ))}
                            </div>
                            <em>
                                <i />
                            </em>
                        </div>
                    </div>
                    <div className="es-pv-feats">
                        {["Streaks", "Reminders", "Insights"].map((f) => (
                            <p key={f}>
                                <i />
                                {f}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
