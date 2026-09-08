import React from "react";
import { Icon, SectionLabel } from "./shared.jsx";
import Modes from "./Modes.jsx";
import GettingStarted from "./GettingStarted.jsx";

const features = [
    {
        icon: "terminal",
        title: "Your agents, in their element.",
        description:
            "Claude Code on the interface. Codex on the tests. Give each task its own terminal, without losing the bigger picture.",
        tag: "PARALLEL TERMINALS",
        art: "agents",
    },
    {
        icon: "monitor",
        title: "See the thing you’re making.",
        description:
            "Run supported projects right beside your agents. Try phone, tablet, and desktop viewports without leaving your workspace.",
        tag: "LIVE PREVIEW",
        art: "preview",
    },
    {
        icon: "notes",
        title: "Keep the context close.",
        description:
            "Bring in your project notes and Obsidian vault. Keep the decisions, details, and next steps beside the work.",
        tag: "PROJECT MEMORY",
        art: "memory",
    },
    {
        icon: "branch",
        title: "Experiment. Then decide.",
        description:
            "Work in an isolated Git worktree. Read the diff, keep the changes you want, and create a pull request when you’re ready.",
        tag: "GIT & CODE REVIEW",
    },
    {
        icon: "capture",
        title: "Show what you mean.",
        description:
            "Capture your screen, crop and annotate it, then bring a clear visual reference into your coding conversation.",
        tag: "SCREENSHOT TO PROMPT",
    },
    {
        icon: "mic",
        title: "Say the next idea out loud.",
        description:
            "Dictate a prompt while the thought is fresh. Linux voice input uses a configured AI transcription service.",
        tag: "VOICE INPUT",
    },
];

function FeatureArt({ type }) {
    if (type === "agents")
        return (
            <div className="feature-art agents-art" aria-hidden="true">
                <div>
                    <span className="terminal-orange">✳</span>
                    <strong>Build the interface</strong>
                    <small>
                        Claude Code
                        <span className="status-dot" />
                    </small>
                    <i />
                    <i />
                </div>
                <div>
                    <span>›_</span>
                    <strong>Get the details right</strong>
                    <small>
                        Codex
                        <span className="status-dot" />
                    </small>
                    <i />
                    <i />
                </div>
            </div>
        );
    if (type === "preview")
        return (
            <div className="feature-art preview-art" aria-hidden="true">
                <div className="art-browser">
                    <span>o / orbit</span>
                    <div>
                        <i />
                        <i />
                        <i />
                    </div>
                </div>
                <div className="art-phone">
                    <span>o</span>
                    <i />
                    <i />
                    <i />
                </div>
                <span className="art-size">Made to fit.</span>
            </div>
        );
    return (
        <div className="feature-art memory-art" aria-hidden="true">
            <div className="memory-source">
                <Icon name="notes" />
                <span>Project notes</span>
                <small>3 connected notes</small>
            </div>
            <div className="memory-note">
                <span>↗ product-direction.md</span>
                <p>
                    Make the everyday
                    <br />
                    feel a little better.
                </p>
                <small>Simple. Considered. Yours.</small>
            </div>
        </div>
    );
}

export default function Desktop() {
    return (
        <section
            className="desktop-section page-width section-space"
            id="desktop"
            aria-labelledby="desktop-title"
        >
            <SectionLabel number="01">THE DESKTOP WORKSPACE</SectionLabel>
            <div className="section-heading">
                <h2 id="desktop-title">
                    Stay in the flow.
                    <br />
                    <span>Keep the whole picture.</span>
                </h2>
                <p>
                    Less window hopping. More making.
                    <br />
                    Your tools, agents, and ideas finally
                    <br className="desktop-break" /> have a place together.
                </p>
            </div>
            <Modes />
            <div className="feature-grid">
                {features.map((feature) => (
                    <article
                        className={`feature ${feature.art ? "feature-visual" : "feature-compact"}`}
                        key={feature.title}
                    >
                        {feature.art && <FeatureArt type={feature.art} />}
                        <div className="feature-copy">
                            <span className="feature-tag">
                                <Icon name={feature.icon} size={15} />
                                {feature.tag}
                            </span>
                            <h3>{feature.title}</h3>
                            <p>{feature.description}</p>
                        </div>
                    </article>
                ))}
            </div>
            <GettingStarted />
        </section>
    );
}
