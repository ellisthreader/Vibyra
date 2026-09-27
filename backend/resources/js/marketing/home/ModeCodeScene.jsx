import React from "react";
import { Icon } from "./shared.jsx";
import { agents, logoPath } from "./agents.js";
import { Scene, at } from "./ModeStoryFrame.jsx";

const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));

function Logo({ id, size = 15 }) {
    const agent = byId[id];
    // Aider's mark is a wordmark, so it gets a wider box than the square logos.
    const kind = `${agent.mono ? " agent-mono" : ""}${agent.id === "aider" ? " mf-logo-wide" : ""}`;
    return (
        <img
            className={`mf-logo${kind}`}
            src={logoPath(agent)}
            alt=""
            width={size}
            height={size}
        />
    );
}

/* Code: four small terminals, one coding agent in each, the way the app
 * tiles them. The task is typed into each, the task is typed into each
 * one's input box and sent (the box then reads "Working…"), the agent's output streams in a line at a
 * time, and its dot becomes a tick when it is done. It plays again every
 * few seconds while on screen. */
const terminals = [
    {
        id: "claude",
        task: "Build the app",
        start: 0.4,
        out: [
            "Reading app/",
            "+ HabitList.tsx",
            "+ streak.ts",
            "3 files changed",
        ],
    },
    {
        id: "codex",
        task: "Add edge cases",
        start: 0.9,
        out: ["Running tests", "+ empty list", "+ leap year", "5 tests added"],
    },
    {
        id: "gemini",
        task: "Add dark mode",
        start: 0.6,
        out: [
            "Reading theme.ts",
            "~ tokens.css",
            "~ Settings.tsx",
            "2 files changed",
        ],
    },
    {
        id: "qwen",
        task: "Fix streak bug",
        start: 1.2,
        out: [
            "Off by one, found",
            "~ streak.ts",
            "Tests pass",
            "1 file changed",
        ],
    },
];
const CHAR = 0.045; // typing speed, seconds per character
const LINE = 0.55; // seconds between output lines

// A "+ file" or "~ file" line gets its sign coloured like a diff.
function Line({ text }) {
    const sign = text.startsWith("+ ")
        ? "add"
        : text.startsWith("~ ")
          ? "mod"
          : null;
    if (!sign) return text;
    return (
        <>
            <i className={`mf-sign mf-${sign}`}>{text[0]}</i>
            {text.slice(1)}
        </>
    );
}

function Terminal({ id, task, start, out }) {
    const typed = start + task.length * CHAR;
    const sent = typed + 0.35; // Enter: the box clears and the agent starts
    const done = sent + 0.3 + out.length * LINE;
    return (
        <div
            className="mf-term"
            style={{ ...at(start - 0.3), "--done": `${done}s` }}
        >
            <p className="mf-term-bar">
                <span className="mf-lights">
                    <i />
                    <i />
                    <i />
                </span>
                <Logo id={id} size={13} />
                <strong>{byId[id].name}</strong>
                <span className="mf-state">
                    <i className="mf-dot mf-out" />
                    <span className="mf-tick mf-in">
                        <Icon name="check" size={10} />
                    </span>
                </span>
            </p>
            <div className="mf-term-out">
                <span className="mf-echo" style={at(sent)}>
                    <b>❯</b> {task}
                </span>
                {out.map((line, index) => (
                    <span
                        className={`mf-ln${index === out.length - 1 ? " mf-ok" : ""}`}
                        style={{
                            ...at(sent + 0.3 + index * LINE),
                            "--next": `${index === out.length - 1 ? done : sent + 0.3 + (index + 1) * LINE}s`,
                        }}
                        key={line}
                    >
                        <Line text={line} />
                    </span>
                ))}
            </div>
            {/* The input box: the task is typed here, sent, and the box shows
             * the agent working until it is done. */}
            <div className="mf-input" style={at(start - 0.3)}>
                <b>❯</b>
                <span className="mf-field">
                    <span
                        className="mf-cmd"
                        style={{
                            ...at(start),
                            "--next": `${sent}s`,
                            "--gone": `${sent}s`,
                            "--type": `${task.length * CHAR}s`,
                            "--chars": task.length,
                        }}
                    >
                        {task}
                    </span>
                    <span
                        className="mf-ph mf-ph-work"
                        style={{ ...at(sent), "--gone": `${done}s` }}
                    >
                        <i />
                        Working…
                    </span>
                    <span className="mf-ph" style={at(done)}>
                        Ask anything
                    </span>
                </span>
            </div>
        </div>
    );
}

export function CodeScene() {
    const all = Math.max(
        ...terminals.map(
            ({ start, task, out }) =>
                start + task.length * CHAR + 0.65 + out.length * LINE,
        ),
    );
    return (
        <Scene className="mf-code" loop={all + 3.5}>
            <div className="mf-terms">
                {terminals.map((terminal) => (
                    <Terminal key={terminal.id} {...terminal} />
                ))}
            </div>
        </Scene>
    );
}
