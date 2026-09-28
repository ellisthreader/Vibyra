import React from "react";
import { Crosshair, Pointer, Stage, TermBar } from "./sceneParts.jsx";

/* F9 grabs the screen, the editor opens on it, and the capture is cropped,
 * boxed and drawn on with the editor's three real tools. Save drops it in the
 * tray; dragging the thumbnail onto a terminal hands the agent its path.
 * The agent's edit then calms the chart that was circled. */
const WEEK = [38, 56, 44, 70, 60, 92, 78];
const HABITS = ["A little movement", "Stay hydrated", "Wind down"];

function Chart({ className }) {
    return (
        <div className={className}>
            <p className="shot-chart-title">This week</p>
            <p className="shot-bars">
                {WEEK.map((height, day) => (
                    <i key={day} style={{ "--h": `${height}%` }} />
                ))}
            </p>
            <p className="shot-days">
                {"MTWTFSS".split("").map((day, index) => (
                    <span key={index}>{day}</span>
                ))}
            </p>
        </div>
    );
}

function Tools() {
    return (
        <div className="shot-tools">
            <span className="shot-tool shot-tool-crop" title="Crop">
                <svg viewBox="0 0 16 16"><path d="M4 1v11h11M1 4h11v11" /></svg>1
            </span>
            <span className="shot-tool shot-tool-rect" title="Rectangle">
                <svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="9" rx="1" /></svg>2
            </span>
            <span className="shot-tool shot-tool-draw" title="Draw">
                <svg viewBox="0 0 16 16"><path d="M2 13c3-1 3-6 6-6s2 5 6 3" /></svg>3
            </span>
            <span className="shot-sep" />
            <span className="shot-colours">
                <i />
                <i />
                <i />
                <i />
                <i />
            </span>
            <span className="shot-sep" />
            <span className="shot-act">Copy</span>
            <span className="shot-act shot-save">Save</span>
        </div>
    );
}

export default function ShotScene() {
    return (
        <Stage name="shot">
            <div className="shot-screen">
                <p className="shot-top">
                    <i />
                    <i />
                    <i />
                    <span>orbit.localhost</span>
                    <b className="fx-key shot-f9">F9</b>
                </p>
                <div className="shot-side">
                    <p className="shot-title">
                        Small steps.
                        <br />
                        <span>Good things.</span>
                    </p>
                    {HABITS.map((habit) => (
                        <p className="shot-habit" key={habit}>
                            <i />
                            <span>{habit}</span>
                        </p>
                    ))}
                    <p className="shot-progress">
                        <span>2 of 3 today</span>
                        <i />
                    </p>
                </div>
                <Chart className="shot-chart" />
                <span className="shot-flash" />
                <span className="shot-sel">
                    <i />
                    <i />
                    <i />
                    <i />
                    <b className="shot-size" />
                </span>
                <span className="shot-rect" />
                <svg className="shot-ink" viewBox="0 0 404 286">
                    <path pathLength="1" d="M250 176C262 140 290 124 318 118M318 118l-13-3M318 118l-5 12" />
                </svg>
                <Tools />
            </div>

            <div className="shot-thumb">
                <Chart className="shot-thumb-chart" />
                <span className="shot-thumb-box" />
            </div>

            <div className="shot-term">
                <TermBar logo="claude-color" name="Claude Code" tag="#1" />
                <div className="shot-lines">
                    <p className="is-dim">~/projects/orbit</p>
                    <p>
                        <b>›</b> claude
                    </p>
                    <div className="shot-sent">
                        <p>
                            <b>›</b>
                            <span className="shot-path">capture-1432.png</span>
                        </p>
                        <p>make this chart calmer</p>
                    </div>
                    <p className="shot-out is-dim">· Reading WeekChart.tsx</p>
                    <p className="shot-done">
                        ✓ WeekChart.tsx <em>+9 −4</em>
                    </p>
                </div>
                <div className="shot-input">
                    <p>
                        <b>›</b>
                        <span className="shot-path shot-drop">capture-1432.png</span>
                        <i className="fx-caret shot-idle" />
                    </p>
                    <p className="shot-ask">
                        <span className="shot-typed">make this chart calmer</span>
                        <i className="fx-caret" />
                    </p>
                </div>
            </div>

            <span className="shot-cursor">
                <Crosshair />
                <Pointer />
            </span>
        </Stage>
    );
}
