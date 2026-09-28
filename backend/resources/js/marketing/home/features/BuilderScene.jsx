import React from "react";
import { Pointer, Stage } from "./sceneParts.jsx";

/* The new-project dialog as it really runs: one card whose content changes
 * through the rail's four steps, then the build. Kinds, stacks, options and
 * titles are real entries and strings from the app. */
const STEPS = ["Kind", "Stack", "Options", "Where", "Build"];
const KINDS = ["Website", "Web app", "Mobile app", "Desktop app", "Game", "AI app"];
const STACKS = ["Next.js", "Astro", "SvelteKit", "React (Vite)", "Vue (Vite)", "Laravel"];
const OPTIONS = ["Install dependencies", "Start a git repository", "Open a terminal when it is done"];
const TITLES = [
    "What are you making?",
    "Which stack?",
    "How should it be set up?",
    "Name it and place it",
    "Ready when you are",
    "Building your project",
    "Orbit is ready",
];

function Choices({ items, pick }) {
    return (
        <ul className="bd-choices">
            {items.map((item) => (
                <li className={item === pick ? "is-pick" : ""} key={item}>
                    <i />
                    {item}
                </li>
            ))}
        </ul>
    );
}

export default function BuilderScene() {
    return (
        <Stage name="bd">
            <p className="bd-rail">
                <span className="bd-fill" />
                {STEPS.map((step, index) => (
                    <span className={`bd-step bd-step-${index + 1}`} key={step}>
                        <b>{index + 1}</b>
                        {step}
                    </span>
                ))}
            </p>
            <div className="bd-dialog">
                <p className="bd-titles">
                    {TITLES.map((title, index) => (
                        <i className={`bd-t bd-t${index + 1}`} key={title}>
                            {title}
                        </i>
                    ))}
                </p>
                <div className="bd-pane bd-pane-1">
                    <Choices items={KINDS} pick="Web app" />
                </div>
                <div className="bd-pane bd-pane-2">
                    <Choices items={STACKS} pick="React (Vite)" />
                </div>
                <ul className="bd-pane bd-pane-3">
                    {OPTIONS.map((option) => (
                        <li key={option}>
                            <i />
                            {option}
                        </li>
                    ))}
                </ul>
                <div className="bd-pane bd-pane-4">
                    <p className="bd-label">Name</p>
                    <p className="bd-field">
                        <span className="bd-typed">orbit</span>
                    </p>
                    <p className="bd-label bd-where">Folder</p>
                    <p className="bd-field bd-where">~/projects/orbit</p>
                </div>
                <div className="bd-pane bd-pane-5">
                    <p className="bd-picked">
                        <span>Web app</span>
                        <span>React (Vite)</span>
                        <span>~/projects/orbit</span>
                    </p>
                    <span className="bd-bar" />
                    <p className="bd-done">
                        <b>
                            <svg viewBox="0 0 16 16">
                                <path d="m4 8.5 2.5 2.5L12 5.5" />
                            </svg>
                        </b>
                        Terminal opened in ~/projects/orbit
                    </p>
                </div>
            </div>
            <span className="bd-cursor">
                <Pointer />
            </span>
        </Stage>
    );
}
