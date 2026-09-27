import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared.jsx";
import { agents, logoPath } from "./agents.js";
import TeamAtWork from "./TeamAtWork.jsx";

/* Three scenes, one per mode, all illustrations built from the app's own
 * words rather than copies of its window. They sit side by side as three
 * cards — a word, a line and a small live screen each — so nothing is hidden
 * behind a tab and the section reads at a glance.
 * Agent's scene is the teammates themselves (TeamAtWork.jsx). Timing for
 * Code and Chat lives in CSS via `--at` (when a piece arrives); a scene
 * plays once when it reaches the screen and then holds its finished state. */

const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));

// True while the element is on screen and the tab is visible.
function useLive(ref) {
    const [live, setLive] = useState(false);
    useEffect(() => {
        let inView = false;
        const update = () => setLive(inView && !document.hidden);
        const observer = new IntersectionObserver(
            ([entry]) => {
                inView = entry.isIntersecting;
                update();
            },
            { threshold: 0.2 },
        );
        observer.observe(ref.current);
        document.addEventListener("visibilitychange", update);
        return () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", update);
        };
    }, [ref]);
    return live;
}

// Plays an illustration once it is on screen; pauses again when it leaves.
function Scene({ className, children }) {
    const ref = useRef(null);
    const live = useLive(ref);
    return (
        <div
            ref={ref}
            className={`mf-fig ${className} ${live ? "is-live" : ""}`}
            aria-hidden="true"
        >
            <div className="mf-take">{children}</div>
        </div>
    );
}

const at = (seconds) => ({ "--at": `${seconds}s` });

// Words arrive one after another, like text being streamed back.
function Words({ text, from, step = 0.05 }) {
    return text.split(" ").map((word, index) => (
        <span className="mf-word" style={at(from + index * step)} key={index}>
            {word}{" "}
        </span>
    ));
}

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

function CodeScene() {
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

/* Project Chat: two turns. Yours are cobalt bubbles on the right;
 * Vibyra answers on the left beside its mark, streamed a word at a time. */
function Turn({ you, from, children }) {
    return (
        <div className={`mf-turn${you ? " mf-turn-you" : ""}`} style={at(from)}>
            {!you && (
                <span className="mf-face">
                    <img
                        src="/vibyra-cobalt.png"
                        alt=""
                        width="32"
                        height="24"
                    />
                </span>
            )}
            <div className="mf-bubble">{children}</div>
        </div>
    );
}

function ChatScene() {
    return (
        <Scene className="mf-chatmode">
            <div className="mf-chat">
                <p className="mf-chat-head">
                    <span>Vibyra AI</span>
                    <em>Orbit</em>
                </p>
                <div className="mf-thread">
                    <Turn you from={0.3}>
                        <Words
                            text="We shipped the habit tracker to a few friends. What should I look at first?"
                            from={0.3}
                        />
                    </Turn>
                    <p
                        className="mf-typing"
                        style={{ ...at(1.6), "--gone": "2.4s" }}
                    >
                        <i />
                        <i />
                        <i />
                    </p>
                    <Turn from={2.4}>
                        <Words
                            text="Open it the way a new person would, and write down every moment you had to stop and think."
                            from={2.5}
                        />
                    </Turn>
                    <Turn you from={5.4}>
                        <Words text="Give me three things to try." from={5.4} />
                    </Turn>
                    <p
                        className="mf-typing"
                        style={{ ...at(6.4), "--gone": "7.2s" }}
                    >
                        <i />
                        <i />
                        <i />
                    </p>
                    <Turn from={7.2}>
                        <ol className="mf-steps">
                            <li style={at(7.3)}>
                                Hand it to someone who hasn’t seen it.
                            </li>
                            <li style={at(7.9)}>Watch, don’t help.</li>
                            <li style={at(8.5)}>
                                Fix the first thing they got stuck on.
                            </li>
                        </ol>
                    </Turn>
                </div>
                <div className="mf-composer">
                    <span className="mf-attach">
                        <Icon name="plus" size={14} />
                    </span>
                    <span>Ask anything</span>
                    <span className="mf-send">
                        <Icon name="arrow" size={14} />
                    </span>
                </div>
            </div>
        </Scene>
    );
}

const modes = [
    {
        name: "Code",
        line: "Up to 12 terminals, an agent in each.",
        Scene: CodeScene,
    },
    {
        name: "Agents",
        line: "Teammates with real jobs, on your schedule.",
        Scene: () => <TeamAtWork count={4} compact />,
    },
    {
        name: "Chat",
        line: "Ask about your project beside its terminals.",
        Scene: ChatScene,
    },
];

/* Three cards across, one per way to work: the word, its line, a small screen with
 * the scene. Same surface, same rhythm, nothing to click. */
export default function ModeStories() {
    return (
        <div className="mf">
            {modes.map(({ name, line, Scene: Picture }) => (
                <article className="mf-card" key={name}>
                    <header className="mf-head">
                        <h3>{name}</h3>
                        <p className="mf-line">{line}</p>
                    </header>
                    <div className="mf-screen">
                        <Picture />
                    </div>
                </article>
            ))}
        </div>
    );
}
