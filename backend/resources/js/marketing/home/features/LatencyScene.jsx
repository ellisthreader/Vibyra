import React from "react";
import { Mark, Stage } from "./sceneParts.jsx";

/* Three agents pour output into their panes while you type in a fourth. Each
 * key lands on screen as it is pressed: the terminal you are typing in goes
 * first. No numbers — the claim is the behaviour, not a measurement. */
const BUSY = [
    { name: "Codex", logo: "openai", speed: "1.25s" },
    { name: "Gemini CLI", logo: "gemini-color", speed: "0.95s" },
    { name: "Aider", logo: "aider", speed: "1.5s" },
];
const KEYS = ["g", "i", "t", "space", "s", "t", "a", "t", "u", "s"];
const LINES = [72, 54, 88, 40, 66, 80, 48, 92, 58, 36, 76, 62];

export default function LatencyScene() {
    return (
        <Stage name="lat">
            <div className="lat-busy">
                {BUSY.map((pane) => (
                    <div className="lat-pane" key={pane.name}>
                        <p className="lat-pane-bar">
                            <Mark logo={pane.logo} size={11} />
                            {pane.name}
                        </p>
                        <div className="lat-flow" style={{ "--s": pane.speed }}>
                            {[...LINES, ...LINES].map((width, index) => (
                                <i key={index} style={{ "--w": `${width}%` }} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="lat-term">
                <p className="lat-term-bar">
                    Terminal <i>#4</i>
                    <b>typing</b>
                </p>
                <p className="lat-line">
                    <span className="lat-cwd">~/orbit</span>
                    <em>›</em>
                    <span className="lat-typed">git status</span>
                    <i className="fx-caret" />
                </p>
                <p className="lat-out">On branch main · nothing to commit</p>
            </div>
            <p className="lat-keys">
                {KEYS.map((key, index) => (
                    <span
                        className={`fx-key lat-key${key === "space" ? " lat-space" : ""}`}
                        key={index}
                        style={{ "--d": `${(0.6 + index * 0.28).toFixed(2)}s` }}
                    >
                        {key === "space" ? "" : key}
                    </span>
                ))}
                <span className="fx-key lat-key lat-enter" style={{ "--d": "3.6s" }}>
                    ↵
                </span>
            </p>
        </Stage>
    );
}
