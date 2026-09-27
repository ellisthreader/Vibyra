import React from "react";
import { T, Term, Words, Pointer } from "./EcosystemSceneParts.jsx";

/* 5 · Your notes, lent to your agents: an Obsidian vault, its graph, and the
 * agent answering from the note you keep. */
const Gem = () => (
    <svg className="es-ob-gem" viewBox="0 0 14 16" width="10" height="12" aria-hidden="true">
        <path d="M7 0.6 12.6 5 10.8 14.6 3.2 14.6 1.4 5z" fill="url(#es-ob-g)" />
        <path d="M7 0.6 5.2 8.6 3.2 14.6M5.2 8.6 10.8 14.6" fill="none" stroke="#e5dcff" strokeOpacity="0.55" strokeWidth="0.8" />
        <defs>
            <linearGradient id="es-ob-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c4b1ff" />
                <stop offset="1" stopColor="#6d4fe0" />
            </linearGradient>
        </defs>
    </svg>
);
const GRAPH = {
    nodes: [
        [40, 34, "Launch plan", true],
        [16, 16],
        [66, 14],
        [70, 50],
        [18, 56],
        [44, 64],
        [8, 36],
    ],
    edges: [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [3, 5],
        [4, 6],
        [1, 6],
        [2, 3],
    ],
};
export function NotesScene() {
    return (
        <div className="es es-nt">
            <div className="es-ob">
                <p className="es-ob-bar">
                    <Gem />
                    My vault
                    <span>Launch plan</span>
                </p>
                <div className="es-ob-body">
                    <div className="es-ob-side">
                        <p className="dir">Daily notes</p>
                        <p className="dir open">Projects</p>
                        <p className="sub active">Launch plan</p>
                        <p className="sub">Roadmap</p>
                        <p className="sub">Ideas</p>
                    </div>
                    <div className="es-ob-note">
                        <p className="es-ob-h">Launch plan</p>
                        <p>
                            Ship <strong>Oct 3</strong>, <span className="link">[[iOS]]</span> first.
                        </p>
                        <p className="es-ob-task done">
                            <i />
                            Beta on TestFlight
                        </p>
                        <p className="es-ob-task">
                            <i />
                            App Store screenshots
                        </p>
                        <p className="es-ob-tags">
                            <span>#launch</span>
                            <span>#mobile</span>
                        </p>
                    </div>
                </div>
            </div>
            <div className="es-ob-graph">
                <p>Graph</p>
                <svg viewBox="0 0 80 72" width="80" height="72" aria-hidden="true">
                    {GRAPH.edges.map(([a, b], i) => (
                        <line key={i} x1={GRAPH.nodes[a][0]} y1={GRAPH.nodes[a][1]} x2={GRAPH.nodes[b][0]} y2={GRAPH.nodes[b][1]} />
                    ))}
                    {GRAPH.nodes.map(([x, y, , hot], i) => (
                        <circle key={i} className={hot ? "hot" : ""} cx={x} cy={y} r={hot ? 4.5 : 2.6} />
                    ))}
                </svg>
            </div>
            <T at={1.8} className="es-nt-agent">
                <Term>
                    <T at={2.2} out={3.3} className="es-reply es-dim">
                        Reading <code>Launch plan.md</code>…
                    </T>
                    <T at={3.4} className="es-reply es-reply-wrap">
                        <Words at={3.5} text="iOS first, shipping Oct 3. Android can wait." gap={0.16} />
                    </T>
                </Term>
            </T>
        </div>
    );
}

/* 6 · No API keys to paste: sign in to each tool with the account you already
 * have; the key field never comes up. */
const ACCOUNTS = [
    { logo: "claude-color", name: "Claude", plan: "Claude Pro" },
    { logo: "openai", name: "ChatGPT", plan: "ChatGPT Plus" },
    { logo: "gemini-color", name: "Gemini", plan: "Google account" },
];
export function KeysScene() {
    return (
        <div className="es es-ky">
            <div className="es-ky-card">
                {ACCOUNTS.map((a, i) => (
                    <div key={a.name} className="es-ky-row">
                        <img className={`es-ky-logo es-ky-logo-${a.logo}`} src={`/media/marketing/providers/${a.logo}.svg`} alt="" />
                        <p>
                            {a.name}
                            <span>{a.plan}</span>
                        </p>
                        <T at={0} out={0.9 + i} tag="b" className="es-ky-btn">
                            Sign in
                        </T>
                        <T at={0.95 + i} tag="b" className="es-ky-btn done">
                            ✓ Connected
                        </T>
                    </div>
                ))}
            </div>
            <Pointer className="es-pointer-ky" />
            <T at={3.6} className="es-ky-nokey">
                <span>API key</span>
                <s>sk-ant-api03-••••••••</s>
                <b>Not needed</b>
            </T>
        </div>
    );
}
