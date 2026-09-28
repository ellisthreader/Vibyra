import React, { useState } from "react";
import { Action } from "./shared.jsx";

const audiences = {
    vibecoder: {
        title: "Start with an idea. Grow into the details.",
        lede: "Describe what you want, let your agents help build it, and see the result. Here’s how to get going.",
        steps: [
            [
                "Get your workspace ready.",
                "Install Vibyra for Windows or Linux. Connect an installed coding agent and its provider account.",
            ],
            [
                "Start with one idea.",
                "Create or open a project. Tell your agent what you want to build, in your own words.",
            ],
            [
                "See it. Then refine it.",
                "Preview a supported project, ask for changes, and review the code before you keep it.",
            ],
        ],
    },
    developer: {
        title: "Your stack. Your tools. More headroom.",
        lede: "Bring an existing repo, your CLI agents, and the way you already work. Here’s where to start.",
        steps: [
            [
                "Bring your repository.",
                "Open a local project with its usual tooling. Keep your stack, your files, and your Git history.",
            ],
            [
                "Give each agent a task.",
                "Run your installed coding CLIs in separate terminals. Keep the work and its context together.",
            ],
            [
                "Review on your terms.",
                "Preview your project, inspect the diff, and merge or discard your isolated worktree changes.",
            ],
        ],
    },
};

export default function GettingStarted() {
    const [developer, setDeveloper] = useState(false);
    const audience = audiences[developer ? "developer" : "vibecoder"];
    return (
        <div className="getting-started" id="workflow">
            <div className="audience-row">
                <div className="audience-switch" role="group" aria-label="Choose your coding experience">
                    <button type="button" aria-pressed={!developer} onClick={() => setDeveloper(false)}>
                        I’m a vibecoder
                    </button>
                    <button type="button" aria-pressed={developer} onClick={() => setDeveloper(true)}>
                        I’m a developer
                    </button>
                </div>
                <Action secondary icon="download" data-analytics-cta="getting_started_download">
                    Start building
                </Action>
            </div>
            <div className="audience-panel" aria-live="polite">
                <div className="audience-copy">
                    <h3>{audience.title}</h3>
                    <p>{audience.lede}</p>
                </div>
                <ol className="getting-started-steps" aria-label="Your first project">
                    {audience.steps.map(([title, copy], index) => (
                        <li key={title}>
                            <span aria-hidden="true">0{index + 1}</span>
                            <h4>{title}</h4>
                            <p>{copy}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
