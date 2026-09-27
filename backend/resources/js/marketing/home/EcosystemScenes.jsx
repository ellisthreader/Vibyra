import React from "react";

/* The six scenes in section 03. Each is a short story on a 300×180 stage:
 * the trigger, the agent working, a visible payoff, with as few shapes as
 * possible. `t` elements fade in at `--in` (and out at `--out` with `out`);
 * the stage is re-mounted every cycle by Ecosystem.jsx so the story replays.
 * `Type` types `--n` characters; `Words` lands one word at a time. Styles:
 * home-ecosystem-scenes.css (prefix `es-`). */

const at = (start, end) => ({ "--in": `${start}s`, ...(end != null ? { "--out": `${end}s` } : {}) });
const T = ({ at: t, out, className = "", children, style, tag: Tag = "div" }) => (
    <Tag className={`t ${out != null ? "out " : ""}${className}`} style={{ ...at(t, out), ...style }}>
        {children}
    </Tag>
);
const Type = ({ at: t, text, dur = 1.2, className = "" }) => (
    <span className={`type ${className}`} style={{ ...at(t), "--n": text.length, "--dur": `${dur}s` }}>
        {text}
    </span>
);
const Words = ({ at: t, text, gap = 0.28 }) => (
    <span className="es-words">
        {text.split(" ").map((word, i) => (
            <T key={i} tag="span" at={t + i * gap}>
                {word}
            </T>
        ))}
    </span>
);
const Key = ({ at: t, children, className = "" }) => (
    <kbd className={`es-key ${className}`} style={at(t)}>
        {children}
    </kbd>
);
const Term = ({ children, className = "", name = "Claude Code", tag }) => (
    <div className={`es-term ${className}`}>
        <p className="es-termbar">
            <i className="es-mark" />
            {name}
            {tag && <span>{tag}</span>}
            <b />
        </p>
        <div className="es-termbody">{children}</div>
    </div>
);
const Pointer = ({ className = "" }) => (
    <svg className={`es-pointer ${className}`} viewBox="0 0 18 22" width="16" height="20" aria-hidden="true">
        <path d="M2 1.5v16.2l4.3-4 2.8 6.6 3-1.3-2.8-6.4h6z" fill="#fff" stroke="#171a21" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
);
const Icon = ({ d }) => (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/* 1 · Screenshot to prompt: a real page with a visible bug. F9 dims the
 * screen, you drag around the broken cards, circle the one that's off and
 * Send; the marked-up capture lands in the terminal as an image, the agent
 * fixes it, and the card drops back into line. */
export function ShotScene() {
    return (
        <div className="es es-shot">
            <div className="es-sh-window">
                <p className="es-sh-bar">
                    <i />
                    <i />
                    <i />
                    <span>localhost:3000</span>
                </p>
                <div className="es-sh-page">
                    <p className="es-sh-nav">
                        <i />
                        orbit
                    </p>
                    <p className="es-sh-h">
                        Small steps. <span>Good things.</span>
                    </p>
                    <div className="es-sh-cards">
                        {["Streaks", "Reminders", "Insights"].map((name, i) => (
                            <p key={name} className={i === 1 ? "bug" : ""}>
                                <i />
                                {name}
                                <b />
                            </p>
                        ))}
                    </div>
                </div>
            </div>
            <Key at={0.3} className="es-key-corner">
                F9
            </Key>
            <T at={0.8} out={3.4} className="es-sel">
                <span className="es-sel-size">284 × 60</span>
            </T>
            <T at={1.8} out={3.4} className="es-tools">
                <i>
                    <Icon d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" />
                </i>
                <i>
                    <Icon d="M5 19 19 5m0 0h-8m8 0v8" />
                </i>
                <i className="on">
                    <Icon d="m12 19 7-7 3 3-7 7-3-3zm6-8 3-3-6-6-3 3" />
                </i>
                <em />
                <b className="press" style={at(3.0)}>
                    Send
                </b>
            </T>
            <T at={2.1} out={3.4} className="es-sh-ink">
                <svg viewBox="0 0 120 56" width="120" height="56" aria-hidden="true">
                    <path d="M62 5C30 3 6 13 5 28s27 24 58 23 53-11 52-25S88 4 50 7" pathLength="1" style={at(2.2)} />
                </svg>
            </T>
            <Pointer className="es-pointer-shot" />
            <T at={3.4} className="es-fly" />
            <Term>
                <p className="es-line">
                    <T at={3.9} className="es-sh-chip" tag="span">
                        <span className="es-sh-thumb">
                            <i />
                            <i />
                            <i />
                        </span>
                        image
                    </T>
                    <Type at={4.1} text="fix the spacing here" dur={1.1} />
                    <T at={5.4} className="es-sent" tag="span">
                        ↵
                    </T>
                </p>
                <T at={5.9} className="es-reply">
                    <b>✓</b> Fixed in <code>Features.tsx</code>
                </T>
            </Term>
        </div>
    );
}

/* 2 · Voice to prompt: F8, you talk, and the words land in the terminal as
 * you say them; it sends itself, and the agent gets going. */
export function VoiceScene() {
    return (
        <div className="es es-voice">
            <T at={0.2} out={4.4} className="es-mic-row">
                <Key at={0.2}>F8</Key>
                <span className="es-mic">
                    <i />
                    <i />
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <rect x="9" y="2" width="6" height="13" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
                        <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </span>
                <span className="es-wave">
                    {[0.3, 0.8, 0.5, 1, 0.45, 0.9, 0.6, 0.35, 0.75, 0.5, 1, 0.4, 0.7, 0.3].map((v, i) => (
                        <i key={i} style={{ "--v": v, "--d": `${i * 0.07}s` }} />
                    ))}
                </span>
            </T>
            <Term className="es-voice-term" tag="listening">
                <p className="es-line es-line-wrap">
                    <em>›</em>
                    <Words at={0.9} text="add a dark mode toggle to the settings page" />
                    <T at={4.4} className="es-sent" tag="span">
                        ↵
                    </T>
                </p>
                <T at={4.9} className="es-reply es-dim">
                    Adding the toggle to <code>settings/page.tsx</code>…
                </T>
                <T at={6.4} className="es-reply">
                    <b>✓</b> Done. Try it in Settings.
                </T>
            </Term>
        </div>
    );
}

/* 3 · A lane for every agent: Safe mode forks a Git worktree per agent off
 * main; the three commit side by side, then each branch merges back into
 * main without touching the others. Drawn as a branch graph. */
const LANES = [
    { logo: "claude-color", name: "Claude", branch: "claude/dark-mode", y: 72 },
    { logo: "openai", name: "Codex", branch: "codex/api-tests", y: 114 },
    { logo: "gemini-color", name: "Gemini", branch: "gemini/docs", y: 156 },
];
const MAIN_Y = 30;
const COMMITS = [104, 146, 188, 222];
export function LanesScene() {
    return (
        <div className="es es-wt">
            <svg className="es-wt-graph" viewBox="0 0 300 180" width="300" height="180" aria-hidden="true">
                <path className="es-wt-main" d={`M6 ${MAIN_Y}H294`} pathLength="1" />
                {LANES.map((lane, i) => (
                    <g key={lane.name}>
                        <path
                            className="es-wt-fork"
                            d={`M22 ${MAIN_Y}C40 ${MAIN_Y} 40 ${lane.y} 58 ${lane.y}H240`}
                            pathLength="1"
                            style={at(0.5 + i * 0.15)}
                        />
                        {COMMITS.map((x, j) => (
                            <circle key={x} className="es-wt-commit" cx={x} cy={lane.y} r="4" style={at(1.4 + j * 0.5 + i * 0.17)} />
                        ))}
                        <path
                            className="es-wt-merge"
                            d={`M240 ${lane.y}C258 ${lane.y} 258 ${MAIN_Y} 276 ${MAIN_Y}`}
                            pathLength="1"
                            style={at(4.3 + i * 0.35)}
                        />
                    </g>
                ))}
                <circle className="es-wt-root" cx="22" cy={MAIN_Y} r="5" />
                <circle className="es-wt-head" cx="276" cy={MAIN_Y} r="5.5" style={at(4.6)} />
            </svg>
            <p className="es-wt-mainlabel">main</p>
            {LANES.map((lane, i) => (
                <React.Fragment key={lane.name}>
                    <T at={0.8 + i * 0.15} className="es-wt-label" style={{ top: lane.y - 21 }}>
                        <img className={`es-wt-logo es-wt-logo-${lane.logo}`} src={`/media/marketing/providers/${lane.logo}.svg`} alt="" />
                        <b>{lane.name}</b>
                        <code>{lane.branch}</code>
                    </T>
                    <T at={1.0 + i * 0.15} className="es-wt-path" style={{ top: lane.y + 7 }}>
                        <i />
                        worktree · orbit-{lane.name.toLowerCase()}
                    </T>
                </React.Fragment>
            ))}
            <T at={5.6} className="es-wt-done">
                ✓ 3 merged, nothing overwritten
            </T>
        </div>
    );
}

/* 4 · Live preview: a real little site, reflowing as the frame becomes each
 * device. The layout answers to the frame's own width (container queries in
 * home-ecosystem-scenes.css), so it reflows like the real thing. */
const DEVICES = ["iPhone 15", "iPad mini", "MacBook", "TV"];
export function PreviewScene() {
    return (
        <div className="es es-pv">
            <p className="es-pv-bar">
                {DEVICES.map((d) => (
                    <b key={d}>{d}</b>
                ))}
            </p>
            <div className="es-pv-frame">
                <div className="es-pv-site">
                    <p className="es-pv-nav">
                        <i />
                        orbit
                        <span>Features</span>
                        <span>Pricing</span>
                        <em />
                    </p>
                    <div className="es-pv-hero">
                        <div className="es-pv-copy">
                            <p className="es-pv-h">
                                Small steps.
                                <br />
                                <span>Good things.</span>
                            </p>
                            <p className="es-pv-sub">A calmer way to keep habits.</p>
                            <b className="es-pv-cta">Get started</b>
                        </div>
                        <div className="es-pv-week">
                            <p>This week</p>
                            <div>
                                {"MTWTFSS".split("").map((d, i) => (
                                    <span key={i} className={i < 4 ? "on" : i === 4 ? "today" : ""}>
                                        {d}
                                    </span>
                                ))}
                            </div>
                            <em>
                                <i />
                            </em>
                        </div>
                    </div>
                    <div className="es-pv-feats">
                        {["Streaks", "Reminders", "Insights"].map((f) => (
                            <p key={f}>
                                <i />
                                {f}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

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

export const SCENES = {
    shot: ShotScene,
    voice: VoiceScene,
    lanes: LanesScene,
    preview: PreviewScene,
    notes: NotesScene,
    keys: KeysScene,
};
export const CYCLES = { shot: 8.5, voice: 9, lanes: 8, preview: 8, notes: 8.5, keys: 7.5 };
