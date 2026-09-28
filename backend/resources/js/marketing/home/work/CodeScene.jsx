import React, { useLayoutEffect, useRef } from "react";
import useSceneClock from "./useSceneClock.js";
import { GeminiArt } from "../device/CliBanner.jsx";

/* Code: three terminal windows running three coding agents at once, each drawn
 * the way its CLI really prints — Claude Code's coral welcome box, ⏺ tool
 * calls with ⎿ results, an inline diff and the "✻ Pondering…" status above
 * its rounded input box; Codex's ">_ OpenAI Codex" card, › prompts, • steps
 * with └ details and "Working (Ns • esc to interrupt)"; Gemini CLI's pixel
 * banner, boxed ✔ tool calls, braille spinner and ✦ reply. A task types into
 * the input, is sent, and the agent streams its work; output starts at the
 * top and, once the window is full, old lines scroll off it (Output). One
 * clock (useSceneClock) drives all three; the resting frame is every
 * agent finished. Sample text only. */

const LENGTH = 9.4;
const PER_CHAR = 0.038;

const claude = {
    prompt: "Add a streak to each habit",
    typeFrom: 0.35,
    busy: [2.0, 7.7],
    moods: [
        [2.0, "Pondering…"],
        [3.6, "Crafting…"],
        [6.0, "Testing…"],
    ],
    lines: [
        { at: 2.7, kind: "tool", name: "Read", arg: "app/HabitList.tsx" },
        { at: 2.9, kind: "result", text: "Read 64 lines" },
        { at: 3.5, kind: "tool", name: "Write", arg: "lib/streak.ts" },
        { at: 3.7, kind: "result", text: "Wrote 18 lines to lib/streak.ts" },
        { at: 4.4, kind: "tool", name: "Update", arg: "app/HabitRow.tsx" },
        { at: 4.6, kind: "result", text: "Updated app/HabitRow.tsx with 2 additions and 1 removal" },
        { at: 4.8, kind: "diff", n: 13, sign: "-", text: "return <Text>{habit.name}</Text>" },
        { at: 4.95, kind: "diff", n: 13, sign: "+", text: "const days = streak(habit.log)" },
        { at: 5.1, kind: "diff", n: 14, sign: "+", text: "return <Row name={habit.name} days={days} />" },
        { at: 5.9, kind: "tool", name: "Bash", arg: "npm test" },
        { at: 7.1, kind: "result", text: "14 passed (0.8s)", ok: true },
        { at: 7.8, kind: "say", text: "Done. Every habit now shows its streak, and all 14 tests pass." },
    ],
};

const codex = {
    prompt: "Add edge-case tests",
    typeFrom: 0.8,
    busy: [2.4, 8.3],
    lines: [
        { at: 3.2, kind: "step", head: "Explored" },
        { at: 3.35, kind: "sub", text: "Read lib/streak.ts" },
        { at: 4.3, kind: "step", head: "Edited", text: "streak.test.ts", add: 24, del: 0 },
        { at: 5.4, kind: "step", head: "Ran", text: "npm test" },
        { at: 7.0, kind: "sub", text: "19 passed", ok: true },
        { at: 8.3, kind: "rule", text: "Worked for 38s" },
        { at: 8.5, kind: "say", text: "Added 5 edge cases, from an empty log to a leap day." },
    ],
};

const gemini = {
    prompt: "Add a dark mode",
    typeFrom: 1.1,
    busy: [2.2, 7.3],
    lines: [
        { at: 2.9, kind: "tool", name: "ReadFile", arg: "theme.ts" },
        { at: 4.1, kind: "tool", name: "Edit", arg: "tokens.css" },
        { at: 5.4, kind: "tool", name: "Edit", arg: "Settings.tsx" },
        { at: 7.3, kind: "say", text: "Dark mode is on, and it follows the system." },
    ],
};

const typedAt = (agent) => agent.typeFrom + agent.prompt.length * PER_CHAR;
const sentAt = (agent) => typedAt(agent) + 0.3;
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function Typed({ agent, t }) {
    const count = Math.max(0, Math.min(agent.prompt.length, Math.floor((t - agent.typeFrom) / PER_CHAR)));
    return t < sentAt(agent) ? agent.prompt.slice(0, count) : "";
}

// Terminal output: pinned to the newest line once it overflows.
function Output({ children }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        ref.current.scrollTop = ref.current.scrollHeight;
    });
    return (
        <div ref={ref} className="tm-out">
            {children}
        </div>
    );
}

function Window({ title, className, children }) {
    return (
        <div className={`tm ${className}`}>
            <p className="tm-bar">
                <span className="tm-lights">
                    <i />
                    <i />
                    <i />
                </span>
                <span className="tm-title">{title}</span>
            </p>
            {children}
        </div>
    );
}

function ClaudeLine({ line }) {
    if (line.kind === "tool") {
        return (
            <p className="cc-tool">
                <b>⏺</b> <strong>{line.name}</strong>({line.arg})
            </p>
        );
    }
    if (line.kind === "result") {
        return (
            <p className={`cc-result${line.ok ? " is-ok" : ""}`}>
                <span>⎿</span> {line.text}
            </p>
        );
    }
    if (line.kind === "diff") {
        return (
            <p className={`cc-diff ${line.sign === "+" ? "is-add" : "is-del"}`}>
                <span>{line.n}</span>
                <i>{line.sign}</i>
                {line.text}
            </p>
        );
    }
    return (
        <p className="cc-say">
            <b>⏺</b> {line.text}
        </p>
    );
}

function ClaudeCode({ t }) {
    const sent = t >= sentAt(claude);
    const busy = t >= claude.busy[0] && t < claude.busy[1];
    const mood = [...claude.moods].reverse().find(([at]) => t >= at)?.[1];
    const glyph = SPIN[Math.floor(t * 8) % SPIN.length];
    return (
        <Window title="claude — orbit" className="tm-claude">
            <Output>
                <div className="cc-welcome">
                    <p>
                        <b>✻</b> Welcome to <strong>Claude Code</strong>!
                    </p>
                    <p className="tm-dim">/help for help, /status for your current setup</p>
                    <p className="tm-dim">cwd: ~/orbit</p>
                </div>
                {sent && <p className="cc-you">&gt; {claude.prompt}</p>}
                {claude.lines
                    .filter((line) => t >= line.at)
                    .map((line, index) => (
                        <ClaudeLine line={line} key={index} />
                    ))}
                {busy && (
                    <p className="cc-status">
                        <b>{glyph}</b> {mood}{" "}
                        <span>({Math.floor((t - claude.busy[0]) * 4) + 1}s · esc to interrupt)</span>
                    </p>
                )}
            </Output>
            <div className="cc-input">
                <p className="cc-box">
                    <span>&gt;</span> <Typed agent={claude} t={t} />
                    <i className="tm-cursor" />
                </p>
                <p className="cc-hint tm-dim">? for shortcuts</p>
            </div>
        </Window>
    );
}

function CodexLine({ line }) {
    if (line.kind === "step") {
        return (
            <p className="cx-step">
                <b>•</b> <strong>{line.head}</strong>
                {line.text && ` ${line.text}`}
                {line.add !== undefined && (
                    <span>
                        {" "}(<em className="is-add">+{line.add}</em> <em className="is-del">-{line.del}</em>)
                    </span>
                )}
            </p>
        );
    }
    if (line.kind === "sub") {
        return (
            <p className={`cx-sub${line.ok ? " is-ok" : ""}`}>
                <span>└</span> {line.text}
            </p>
        );
    }
    if (line.kind === "rule") {
        return (
            <p className="cx-rule">
                <span>{line.text}</span>
            </p>
        );
    }
    return (
        <p className="cx-say">
            <b>•</b> {line.text}
        </p>
    );
}

function Codex({ t }) {
    const sent = t >= sentAt(codex);
    const busy = t >= codex.busy[0] && t < codex.busy[1];
    const typing = t >= codex.typeFrom && !sent;
    return (
        <Window title="codex — orbit" className="tm-codex">
            <Output>
                <div className="cx-welcome">
                    <p>
                        <b>&gt;_</b> <strong>OpenAI Codex</strong> <span className="tm-dim">(v0.46.0)</span>
                    </p>
                    <p>
                        <span className="tm-dim">model:</span>     gpt-5-codex
                    </p>
                    <p>
                        <span className="tm-dim">directory:</span> ~/orbit
                    </p>
                </div>
                {sent && <p className="cx-you">› {codex.prompt}</p>}
                {codex.lines
                    .filter((line) => t >= line.at)
                    .map((line, index) => (
                        <CodexLine line={line} key={index} />
                    ))}
                {busy && (
                    <p className="cx-status">
                        <b>•</b> <strong className="cx-shimmer">Working</strong>{" "}
                        <span>({Math.floor((t - codex.busy[0]) * 5) + 1}s • esc to interrupt)</span>
                    </p>
                )}
            </Output>
            <div className="cx-input">
                <p className="cx-box">
                    <b>›</b>{" "}
                    {typing ? (
                        <Typed agent={codex} t={t} />
                    ) : !sent || t >= codex.busy[1] ? (
                        <span className="tm-dim">Ask Codex to do anything</span>
                    ) : null}
                    {typing && <i className="tm-cursor" />}
                </p>
                <p className="cx-hint tm-dim">100% context left · ? for shortcuts</p>
            </div>
        </Window>
    );
}

function GeminiCli({ t }) {
    const sent = t >= sentAt(gemini);
    const busy = t >= gemini.busy[0] && t < gemini.busy[1];
    const glyph = BRAILLE[Math.floor(t * 12) % BRAILLE.length];
    return (
        <Window title="gemini — orbit" className="tm-gemini">
            <Output>
                <div className="gm-welcome">
                    <GeminiArt />
                    <p className="tm-dim">Tips for getting started:</p>
                    <p className="tm-dim">1. Ask questions, edit files, or run commands.</p>
                </div>
                {sent && <p className="gm-you">&gt; {gemini.prompt}</p>}
                {gemini.lines
                    .filter((line) => t >= line.at)
                    .map((line, index) =>
                        line.kind === "tool" ? (
                            <p className="gm-tool" key={index}>
                                <b className={t < line.at + 0.6 ? "is-run" : ""}>{t < line.at + 0.6 ? "⊷" : "✔"}</b> <strong>{line.name}</strong> {line.arg}
                            </p>
                        ) : (
                            <p className="gm-say" key={index}>
                                <b>✦</b> {line.text}
                            </p>
                        ),
                    )}
                {busy && (
                    <p className="gm-status">
                        <b>{glyph}</b> Painting <span>(esc to cancel, {Math.floor((t - gemini.busy[0]) * 3) + 1}s)</span>
                    </p>
                )}
            </Output>
            <div className="gm-input">
                <p className="gm-box">
                    <b>&gt;</b>{" "}
                    {t >= gemini.typeFrom && !sent ? (
                        <>
                            <Typed agent={gemini} t={t} />
                            <i className="tm-cursor" />
                        </>
                    ) : (
                        <span className="tm-dim">Type your message or @path/to/file</span>
                    )}
                </p>
                <p className="gm-hint">
                    <span>~/orbit (main*)</span>
                    <span className="tm-dim">gemini-2.5-pro</span>
                </p>
            </div>
        </Window>
    );
}

export default function CodeScene() {
    const [ref, t] = useSceneClock(LENGTH, { hold: 3.6, step: 0.05 });
    return (
        <div ref={ref} className="wk-stage wk-code" aria-hidden="true">
            <div className="tm-stack">
                <ClaudeCode t={t} />
                <Codex t={t} />
                <GeminiCli t={t} />
            </div>
        </div>
    );
}
