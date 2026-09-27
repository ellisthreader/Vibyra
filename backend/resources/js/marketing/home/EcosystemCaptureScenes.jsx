import React from "react";
import { at, T, Type, Words, Key, Term, Pointer, Icon } from "./EcosystemSceneParts.jsx";

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
