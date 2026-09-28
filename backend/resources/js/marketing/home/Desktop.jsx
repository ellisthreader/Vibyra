import React from "react";
import CodeScene from "./work/CodeScene.jsx";
import NightShift from "./work/NightShift.jsx";

/* Section 01: the two ways to work, matching the app's two tabs. Two soft
 * cards side by side in the ecosystem's card family: a title and one grey
 * line, then the live scene on a cobalt studio panel that runs off the
 * card's bottom edge. Code shows four agents coding at once; Agents shows the
 * teammates working through the night while you are away. No app window
 * here — the hero is the only place the software appears. */

const modes = [
    {
        id: "code",
        title: "Code with every agent.",
        line: "Claude Code, Codex, Gemini CLI and more, side by side.",
        Scene: CodeScene,
    },
    {
        id: "agents",
        title: "Agents that work while you’re away.",
        line: "Give each teammate a job. Wake up to it done.",
        Scene: NightShift,
    },
];

export default function Desktop() {
    return (
        <section className="workspace-section section-space" id="desktop" aria-labelledby="desktop-title">
            <div className="page-width">
                <div className="section-heading home-section-heading">
                    <h2 id="desktop-title">Two ways to work.</h2>
                </div>
                <div className="wk">
                    {modes.map(({ id, title, line, Scene }) => (
                        <article className={`wk-card wk-card-${id}`} key={id}>
                            <div className="wk-copy">
                                <h3>{title}</h3>
                                <p>{line}</p>
                            </div>
                            <div className="wk-art">
                                <Scene />
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
