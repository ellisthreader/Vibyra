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

function ModeIllustration({ mode }) {
    if (mode === 1)
        return (
            <div className="mode-example">
                <div className="mode-example-heading">
                    <Icon name="terminal" size={16} />
                    <span>YOUR PROJECTS</span>
                    <small>Code</small>
                </div>
                <div className="mode-project-row">
                    <i>o</i>
                    <span>
                        <strong>Orbit</strong>
                        <small>Your habit tracker</small>
                    </span>
                    <span className="mode-status">2 terminals</span>
                </div>
                <div className="mode-project-row">
                    <i className="mode-project-blue">p</i>
                    <span>
                        <strong>Portfolio</strong>
                        <small>Your corner of the internet</small>
                    </span>
                    <span className="mode-status">Ready when you are</span>
                </div>
                <p className="mode-example-footer">
                    <Icon name="branch" size={13} />
                    Your repos. Your workflow.
                </p>
            </div>
        );
    if (mode === 2)
        return (
            <div className="mode-example">
                <div className="mode-example-heading">
                    <Icon name="code" size={16} />
                    <span>A FRESH CONVERSATION</span>
                    <small>Chat</small>
                </div>
                <div className="mode-chat-prompt">What if a habit tracker felt more like encouragement?</div>
                <div className="mode-chat-reply">
                    <Icon name="spark" size={17} />
                    <p>
                        Start with small wins. Make showing up feel good, and let the streaks take care of
                        themselves.
                    </p>
                </div>
                <p className="mode-example-footer">
                    <Icon name="file" size={13} />
                    No folders connected
                </p>
            </div>
        );
    return (
        <div className="mode-example">
            <div className="mode-example-heading">
                <Icon name="spark" size={16} />
                <span>YOUR TEAMMATES</span>
                <small>Agent</small>
            </div>
            <div className="mode-project-row">
                <i>
                    <Icon name="code" size={17} />
                </i>
                <span>
                    <strong>Builder</strong>
                    <small>Turn the idea into a first version</small>
                </span>
                <span className="mode-status">
                    <span className="status-dot" />
                    Working
                </span>
            </div>
            <div className="mode-project-row">
                <i className="mode-project-blue">
                    <Icon name="shield" size={17} />
                </i>
                <span>
                    <strong>Reviewer</strong>
                    <small>Give the details a second look</small>
                </span>
                <span className="mode-status">Ready</span>
            </div>
            <p className="mode-example-footer">
                <Icon name="notes" size={13} />
                Their own brief, memory, and skills.
            </p>
        </div>
    );
}

export default function Modes() {
    const [mode, setMode] = useState(0);
    return (
        <div className="modes-block" id="agent-modes">
            <div className="modes-layout">
                <div className="modes-copy">
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
                                <Icon name={item.icon} size={14} />
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <div
                        role="tabpanel"
                        id="mode-description"
                        aria-labelledby={`mode-tab-${mode}`}
                        tabIndex={0}
                    >
                        <h3>{modes[mode].title}</h3>
                        <p>{modes[mode].text}</p>
                        <small>{modes[mode].note}</small>
                    </div>
                </div>
                <div className="modes-visual">
                    <ModeIllustration mode={mode} />
                    <span className="mode-example-label">ILLUSTRATIVE WORKSPACE</span>
                </div>
            </div>
            <div className="agent-capabilities">
                <div>
                    <Icon name="notes" size={18} />
                    <h4>Teach it once.</h4>
                    <p>Write reusable skills and choose which teammates can use them.</p>
                </div>
                <div>
                    <Icon name="globe" size={18} />
                    <h4>Give it a rhythm.</h4>
                    <p>Schedule recurring work. Routines run while Vibyra is open.</p>
                </div>
                <div>
                    <Icon name="shield" size={18} />
                    <h4>Keep the deciding vote.</h4>
                    <p>Set access levels and handle supported approval requests in Decisions.</p>
                </div>
            </div>
        </div>
    );
}
