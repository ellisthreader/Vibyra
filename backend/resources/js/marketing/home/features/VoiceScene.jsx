import React from "react";
import { Stage, TermBar } from "./sceneParts.jsx";

/* F8, talk, F8 again. The status line walks through the app's own states,
 * the three-bar meter follows the voice while it listens, and the words are
 * typed into the focused terminal and sent with Enter. The wide waveform and
 * rings around the microphone are decoration, not a picture of the app. */
const WAVE = Array.from({ length: 46 }, (_, index) => {
    const edge = 1 - Math.abs(index - 22.5) / 23;
    const wobble = (Math.sin(index * 2.3) + Math.sin(index * 0.7 + 1)) / 4 + 0.5;
    return {
        height: Math.round(18 + edge * 62 * (0.45 + wobble * 0.55)),
        speed: (0.42 + ((index * 37) % 11) / 16).toFixed(2),
        delay: (-((index * 53) % 17) / 13).toFixed(2),
    };
});

const STATES = [
    ["v-idle", "Press F8 and talk"],
    ["v-open", "Opening microphone"],
    ["v-listen", "Listening · F8 to send"],
    ["v-trans", "Transcribing"],
    ["v-sent", "Sent to terminal"],
];

export default function VoiceScene() {
    return (
        <Stage name="voice">
            <div className="v-wave">
                {WAVE.map((bar, index) => (
                    <i key={index} style={{ "--h": `${bar.height}px`, "--s": `${bar.speed}s`, "--d": `${bar.delay}s` }} />
                ))}
            </div>
            <div className="v-rings">
                <i />
                <i />
                <i />
            </div>
            <span className="v-halo" />
            <div className="v-orb">
                <span className="v-spin" />
                <svg viewBox="0 0 24 24">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v3.5" />
                </svg>
            </div>

            <p className="v-status">
                <b className="fx-key v-f8">F8</b>
                <span className="v-says">
                    {STATES.map(([id, label]) => (
                        <span className={`v-state ${id}`} key={id}>
                            {id === "v-sent" && <em>✓</em>}
                            {label}
                        </span>
                    ))}
                </span>
                <span className="v-meter">
                    <i />
                    <i />
                    <i />
                </span>
            </p>

            <div className="v-term">
                <TermBar logo="claude-color" name="Claude Code" tag="#1 · focused" />
                <div className="v-lines">
                    <p>
                        <b>›</b>
                        <span className="v-typed">add a dark mode toggle to settings</span>
                        <i className="fx-caret" />
                    </p>
                    <p className="v-out">· Reading SettingsView.tsx</p>
                    <p className="v-done">
                        ✓ SettingsView.tsx <em>+18 −2</em>
                    </p>
                </div>
            </div>
        </Stage>
    );
}
