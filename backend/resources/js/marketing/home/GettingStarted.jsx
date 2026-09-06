import React, { useState } from "react";
import { Action } from "./shared.jsx";

const steps = {
    vibecoder: [
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
    developer: [
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
};

export default function GettingStarted() {
    const [developer, setDeveloper] = useState(false);
    return (
        <div className="getting-started" id="workflow">
            <div className="audience-row">
                <div className="audience-switch" aria-label="Choose your coding experience">
                    <button aria-pressed={!developer} onClick={() => setDeveloper(false)}>
                        I’m a vibecoder
                    </button>
                    <button aria-pressed={developer} onClick={() => setDeveloper(true)}>
                        I’m a developer
                    </button>
                </div>
                <div className="audience-copy" aria-live="polite">
                    <h3>
                        {developer
                            ? "Your stack. Your tools. More headroom."
                            : "Start with an idea. Grow into the details."}
                    </h3>
                    <p>
                        {developer
                            ? "Bring an existing repo, your CLI agents, and the way you already work. Here’s where to start."
                            : "Describe what you want, let your agents help build it, and see the result. Here’s how to get going."}
                    </p>
                </div>
                <Action secondary icon="download">
                    Start building
                </Action>
            </div>
            <ol className="getting-started-steps" aria-label="Your first project" aria-live="polite">
                {steps[developer ? "developer" : "vibecoder"].map(([title, copy], index) => (
                    <li key={title}>
                        <span aria-hidden="true">0{index + 1}</span>
                        <h4>{title}</h4>
                        <p>{copy}</p>
                    </li>
                ))}
            </ol>
        </div>
    );
}
