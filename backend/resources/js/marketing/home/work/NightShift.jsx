import React from "react";
import { agents, logoPath } from "../agents.js";
import { Icon } from "../shared.jsx";
import useSceneClock from "./useSceneClock.js";

/* Agents: the night shift. You log off at 11 PM; a playhead runs through the
 * night to 7 AM while four teammates (the vinyl characters) each take their
 * job in turn. A lane fills as the job runs, its line says what it is doing,
 * and it lands as a result. The on-call engineer stops and waits for you.
 * At 7 AM a morning note sums up the night. The scene's `--t` (seconds) maps
 * to hours through `--len`; lanes fill in CSS, words change in React. */

const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));
const LENGTH = 10;
const HOURS = 8; // 11 PM to 7 AM
const hourAt = (t) => (t / LENGTH) * HOURS;

const crew = [
    {
        face: "bugs",
        name: "Bug fixer",
        engine: "claude",
        from: 0.3,
        to: 2.4,
        doing: "Fixing the sign-in bug",
        result: "Fixed, with a test",
    },
    {
        face: "review",
        name: "Code reviewer",
        engine: "codex",
        from: 1.3,
        to: 3.4,
        doing: "Reviewing PR #214",
        result: "2 comments left",
    },
    {
        face: "qa",
        name: "QA tester",
        engine: "codex",
        from: 3.1,
        to: 5.4,
        doing: "Testing checkout",
        result: "38 checks pass",
    },
    {
        face: "oncall",
        name: "On-call engineer",
        engine: "claude",
        from: 5.2,
        to: 7.2,
        doing: "Errors are rising",
        result: "Fix ready for your OK",
        ask: true,
    },
];

const ticks = ["11 PM", "3 AM", "7 AM"];

function clock(t) {
    const minutes = Math.round((hourAt(t) * 60) / 10) * 10;
    const hour24 = (23 + Math.floor(minutes / 60)) % 24;
    const hour = hour24 % 12 || 12;
    return `${hour}:${String(minutes % 60).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function Face({ face, engine }) {
    const mark = byId[engine];
    return (
        <span className="ns-face">
            <img src={`/media/marketing/teammates-256/${face}.webp`} alt="" width="256" height="256" decoding="async" />
            <span className="ns-engine">
                <img className={mark.mono ? "agent-mono" : ""} src={logoPath(mark)} alt="" />
            </span>
        </span>
    );
}

function Lane({ t, face, name, engine, from, to, doing, result, ask }) {
    const h = hourAt(t);
    const state = h >= to ? (ask ? "ask" : "done") : h >= from ? "busy" : "wait";
    const line = { wait: "Up next", busy: doing, done: result, ask: result }[state];
    return (
        <li className={`ns-lane is-${state}`} style={{ "--s": from, "--e": to }}>
            <div className="ns-who">
                <Face face={face} engine={engine} />
                <span>
                    <strong>{name}</strong>
                    <small key={state}>
                        {state === "done" && <Icon name="check" size={11} />}
                        {line}
                    </small>
                </span>
            </div>
            <div className="ns-track">
                <span className="ns-job">
                    <i />
                </span>
            </div>
        </li>
    );
}

function Moon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        </svg>
    );
}

function Sun() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
    );
}

export default function NightShift() {
    const [ref, t] = useSceneClock(LENGTH, { hold: 4.2 });
    const morning = t >= LENGTH - 0.05;
    const dawn = hourAt(t) >= 6.6;
    return (
        <div
            ref={ref}
            className={`wk-stage wk-night${morning ? " is-morning" : ""}`}
            style={{ "--len": LENGTH, "--hours": HOURS }}
            aria-hidden="true"
        >
            <div className="ns">
                <header className="ns-head">
                    <span className={`ns-sky${dawn ? " is-dawn" : ""}`}>{dawn ? <Sun /> : <Moon />}</span>
                    <strong>{clock(t)}</strong>
                </header>

                <div className="ns-board">
                    <ol className="ns-lanes">
                        {crew.map((mate) => (
                            <Lane key={mate.name} t={t} {...mate} />
                        ))}
                    </ol>
                    <div className="ns-axis">
                        {ticks.map((tick) => (
                            <span key={tick}>{tick}</span>
                        ))}
                    </div>
                    <span className="ns-head-line" />
                </div>

                <div className="ns-note">
                    <span className="ns-note-face">
                        <img src="/media/marketing/teammates-256/lead.webp" alt="" width="256" height="256" decoding="async" />
                    </span>
                    {morning ? (
                        <>
                            <span className="ns-note-copy" key="morning">
                                <strong>Good morning</strong>
                                <small>3 jobs done overnight. 1 is waiting for you.</small>
                            </span>
                            <b className="ns-note-btn">Review</b>
                        </>
                    ) : (
                        <span className="ns-note-copy" key="night">
                            <strong>Team lead</strong>
                            <small>Keeping watch while Vibyra is open</small>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
