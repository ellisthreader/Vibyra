import React, { useState } from "react";
import { Icon } from "./shared.jsx";

import { OrbitApp } from "./OrbitApp.jsx";

function Terminal({ provider, title, children, status, onExplore }) {
    return (
        <div className="demo-terminal">
            <div className="terminal-heading">
                <span className={`terminal-provider provider-${provider}`}>
                    <img src={`/media/marketing/providers/${provider === "claude" ? "claude-color" : "openai"}.svg`} className={provider === "codex" ? "agent-mono" : ""} width="16" height="16" alt="" />
                </span>
                <span>{title}</span>
                <Icon name="plus" size={12} />
            </div>
            <div className="terminal-content">{children}</div>
            <button type="button" className="terminal-input" onClick={onExplore} disabled={!onExplore} aria-label="Try a prompt in the interactive workspace">
                <span>›</span>
                <span>Ask a follow-up…</span>
                <span className="terminal-cursor" />
            </button>
            <div className="terminal-status">
                <span className="status-dot" />
                {status}
                <span>~/projects/orbit</span>
            </div>
        </div>
    );
}

export function TerminalDemo({ onExplore }) {
    return (
        <div className="terminal-layout">
            <div className="terminal-stack">
                <Terminal onExplore={onExplore} provider="claude" title="Claude Code" status="Ready for your next idea">
                    <div className="terminal-request">
                        Build a habit tracker that feels calm.
                        <br />
                        Clean layout. Little moments of delight.
                    </div>
                    <p>
                        <span className="terminal-orange">✳</span> Let’s make something you’ll want to open.
                    </p>
                    <div className="terminal-file">
                        <Icon name="check" size={12} />
                        Created <span>HabitCard.tsx</span>
                        <b>+48</b>
                    </div>
                    <div className="terminal-file">
                        <Icon name="check" size={12} />
                        Updated <span>TodayView.tsx</span>
                        <b>+32</b>
                    </div>
                    <p className="terminal-result">
                        A quiet little home for your daily habits.
                        <br />
                        The preview is ready to explore.
                    </p>
                </Terminal>
                <Terminal onExplore={onExplore} provider="codex" title="Codex" status="Review complete">
                    <div className="terminal-request">Check the habit tracker. Cover the edge cases.</div>
                    <p>Reviewed the components and added coverage.</p>
                    <div className="terminal-tests">
                        <span>✓ 12 tests passed</span>
                        <span>✓ No type errors</span>
                    </div>
                </Terminal>
            </div>
            <div className="terminal-preview">
                <div className="mini-browser">
                    <span className="status-dot" />
                    Preview<span>localhost:5173</span>
                    <Icon name="monitor" size={12} />
                </div>
                <OrbitApp small />
            </div>
        </div>
    );
}

export function PreviewDemo() {
    const [phone, setPhone] = useState(false);
    return (
        <div className="preview-demo">
            <div className="preview-demo-toolbar">
                <span>
                    <span className="status-dot" />
                    Example live preview
                </span>
                <div aria-label="Example preview size">
                    {[
                        [false, "Desktop", "monitor"],
                        [true, "Phone", "phone"],
                    ].map(([value, label, icon]) => (
                        <button key={label} aria-pressed={phone === value} onClick={() => setPhone(value)}>
                            <Icon name={icon} size={13} />
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className={`preview-viewport ${phone ? "preview-viewport-phone" : ""}`}>
                <OrbitApp />
            </div>
        </div>
    );
}

export function ReviewDemo() {
    return (
        <div className="review-demo" role="region" aria-label="Example code review" tabIndex={0}>
            <div className="review-file-list">
                <span className="review-eyebrow">CHANGED FILES</span>
                <span className="review-file-active">
                    <Icon name="file" size={13} />
                    HabitCard.tsx <b>+48</b>
                </span>
                <span>
                    <Icon name="file" size={13} />
                    TodayView.tsx <b>+32</b>
                </span>
                <span>
                    <Icon name="file" size={13} />
                    habits.test.ts <b>+24</b>
                </span>
                <div className="review-isolated">
                    <Icon name="branch" size={19} />
                    <strong>Room to experiment.</strong>
                    <p>Changes in a separate Git worktree.</p>
                </div>
            </div>
            <div className="review-code">
                <div className="review-code-head">
                    <span>HabitCard.tsx</span>
                    <span className="review-additions">
                        +48 <span>−6</span>
                    </span>
                </div>
                <pre tabIndex={0} aria-label="Code changes in HabitCard.tsx">
                    <code>
                        {"  export function HabitCard({ habit }) {\n    const { toggle } = useHabits();\n\n"}
                    </code>
                    <code className="code-removed">{"-   return <div>{habit.name}</div>;\n"}</code>
                    <code className="code-added">
                        {
                            '+   return (\n+     <article className="habit-card">\n+       <HabitIcon type={habit.type} />\n+       <h3>{habit.name}</h3>\n+       <CheckButton\n+         checked={habit.complete}\n+         onChange={() => toggle(habit.id)}\n+       />\n+     </article>\n+   );\n'
                        }
                    </code>
                    <code>{"  }"}</code>
                </pre>
                <div className="review-summary">
                    <Icon name="shield" size={17} />
                    <span>Your idea. Your code. Your call.</span>
                </div>
            </div>
        </div>
    );
}
