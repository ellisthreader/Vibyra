import React, { useEffect, useRef, useState } from "react";
import { agents, logoPath } from "./agents.js";

/* Agent Mode, shown as the team itself: six teammates, each with a job and a
 * line that says where it has got to. Not the app window and not six little
 * windows either — just the characters and their work, flat on one surface.
 * Every teammate runs one CSS timeline (`--cycle`, offset by `--offset`)
 * whose base styles are the finished state, so reduced motion simply shows
 * each job done. Copy follows device/agent/agentData.js. */

const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));

function Avatar({ face, engine, size }) {
    const mark = byId[engine];
    return (
        <span
            className="tw-avatar tw-t tw-hop"
            style={size ? { "--size": `${size}px` } : undefined}
        >
            <img
                src={`/media/marketing/teammates-256/${face}.webp`}
                alt=""
                width="256"
                height="256"
                decoding="async"
            />
            {mark && (
                <span className="tw-engine">
                    <img
                        className={mark.mono ? "agent-mono" : ""}
                        src={logoPath(mark)}
                        alt=""
                    />
                </span>
            )}
        </span>
    );
}

/* One teammate: who they are, what they are doing now, how it is going. The
 * three `say` lines cross-fade through the cycle (tw-a, tw-b, tw-c). */
function Mate({ face, name, engine, cycle, offset, say, ask = false }) {
    return (
        <article
            className={`tw-mate${ask ? " tw-mate-ask" : ""}`}
            style={{ "--cycle": `${cycle}s`, "--offset": `${offset}s` }}
        >
            <Avatar face={face} engine={engine} />
            <div className="tw-who">
                <p className="tw-line">
                    <strong>{name}</strong>
                    <span className="tw-state">
                        <span className="tw-busy tw-t">
                            <i />
                            Working
                        </span>
                        {ask && (
                            <span className="tw-ask-pill tw-t">Needs you</span>
                        )}
                        <span className="tw-done tw-t">Done</span>
                    </span>
                </p>
                <small>{byId[engine].name}</small>
                <p className="tw-say">
                    {say.map((line, index) => (
                        <span className={`tw-t tw-${"abc"[index]}`} key={line}>
                            {line}
                        </span>
                    ))}
                </p>
            </div>
        </article>
    );
}

const team = [
    {
        face: "bugs",
        name: "Bug fixer",
        engine: "claude",
        cycle: 11,
        offset: 0,
        say: [
            "Reproducing the sign-in bug",
            "Writing the fix",
            "Fixed, with a test that proves it",
        ],
    },
    {
        face: "site",
        name: "Website helper",
        engine: "codex",
        cycle: 12,
        offset: -3,
        say: [
            "Opening the bakery’s website",
            "Changing Sunday’s hours",
            "Updated on 2 pages",
        ],
    },
    {
        face: "oncall",
        name: "On-call engineer",
        engine: "claude",
        cycle: 12,
        offset: -6,
        ask: true,
        say: [
            "Checkout errors are rising",
            "Fix ready — asking you first",
            "Shipped. Errors back to zero",
        ],
    },
    {
        face: "review",
        name: "Code reviewer",
        engine: "codex",
        cycle: 11,
        offset: -1.5,
        say: [
            "Reading pull request #214",
            "Leaving comments",
            "2 comments · 1 must fix",
        ],
    },
    {
        face: "qa",
        name: "QA tester",
        engine: "codex",
        cycle: 12,
        offset: -4.5,
        say: [
            "Testing checkout on phone and desktop",
            "Found one real bug",
            "Handed it to Bug fixer",
        ],
    },
    {
        face: "assistant",
        name: "Personal assistant",
        engine: "claude",
        cycle: 12,
        offset: -7.5,
        say: [
            "Tidying your Downloads folder",
            "Filing 38 receipts",
            "Receipts 2026.xlsx is ready",
        ],
    },
];

/* `count` shows the first N teammates; `compact` stacks them in one column
 * without the panel or the team lead's line, for a card that holds them. */
export default function TeamAtWork({ count = team.length, compact = false }) {
    const ref = useRef(null);
    const [live, setLive] = useState(false);
    useEffect(() => {
        let inView = false;
        const update = () => setLive(inView && !document.hidden);
        const observer = new IntersectionObserver(
            ([entry]) => {
                inView = entry.isIntersecting;
                update();
            },
            { threshold: 0.1 },
        );
        observer.observe(ref.current);
        document.addEventListener("visibilitychange", update);
        return () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", update);
        };
    }, []);
    return (
        <div
            ref={ref}
            className={`tw${compact ? " tw-compact" : ""} ${live ? "is-live" : ""}`}
            aria-hidden="true"
        >
            {!compact && (
                <p className="tw-top">
                    <Avatar face="lead" engine="claude" size={30} />
                    <span>
                        <strong>Team lead</strong> Here’s what everyone is
                        working on.
                    </span>
                    <span className="tw-pulse-dot" />
                </p>
            )}
            <div className="tw-grid">
                {team.slice(0, count).map((mate) => (
                    <Mate key={mate.name} {...mate} />
                ))}
            </div>
        </div>
    );
}
