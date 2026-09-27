import React, { useState } from "react";
import { Icon, TabKeys } from "./shared.jsx";

const modes = [
    {
        name: "Agent",
        icon: "spark",
        title: "A teammate that keeps the context.",
        text: "Give an agent a purpose, a brief, and the folders it can use. Its memory and skills carry across your conversations, so the next task starts with a little more context.",
        note: "Powered by compatible Claude Code and Codex installations.",
    },
    {
        name: "Code",
        icon: "terminal",
        title: "Get right into the work.",
        text: "Bring your repository, open your favorite CLI agents, and keep the preview beside the code. Move between projects without rebuilding your workspace every time.",
        note: "Your terminal sessions stay mounted when you switch modes.",
    },
    {
        name: "Chat",
        icon: "code",
        title: "Just you and the next possibility.",
        text: "Think through an idea in a standalone conversation. No project setup, teammate brief, or folder access is needed to start talking.",
        note: "Add a folder explicitly when a conversation needs local context.",
    },
];

const capabilities = [
    ["notes", "Teach it once.", "Write reusable skills and choose which teammates can use them."],
    ["globe", "Give it a rhythm.", "Schedule recurring work. Routines run while Vibyra is open."],
    ["shield", "Keep the deciding vote.", "Set access levels and handle supported approval requests in Decisions."],
];

export default function Modes() {
    const [mode, setMode] = useState(0);
    return (
        <div className="modes-block" id="agent-modes">
            <div
                className="modes-tabs"
                role="tablist"
                aria-label="Ways to work in Vibyra"
                onKeyDown={(event) => TabKeys(event, modes, mode, setMode, "mode-tab")}
            >
                {modes.map((item, index) => (
                    <button
                        key={item.name}
                        id={`mode-tab-${index}`}
                        role="tab"
                        aria-selected={mode === index}
                        aria-controls="mode-description"
                        tabIndex={mode === index ? 0 : -1}
                        onClick={() => setMode(index)}
                    >
                        <Icon name={item.icon} size={15} />
                        {item.name}
                    </button>
                ))}
            </div>
            <div
                className="modes-panel"
                role="tabpanel"
                id="mode-description"
                aria-labelledby={`mode-tab-${mode}`}
                tabIndex={0}
            >
                <h3>{modes[mode].title}</h3>
                <div>
                    <p>{modes[mode].text}</p>
                    <p className="modes-note">{modes[mode].note}</p>
                </div>
            </div>
            <ul className="agent-capabilities">
                {capabilities.map(([icon, title, copy]) => (
                    <li key={title}>
                        <Icon name={icon} size={17} />
                        <h4>{title}</h4>
                        <p>{copy}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
