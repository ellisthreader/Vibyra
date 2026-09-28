import React from "react";
import { Mark, Pointer, Stage } from "./sceneParts.jsx";

/* The key field is struck out before anyone pastes into it; the three coding
 * tools sign in with the accounts people already have, one after another. */
const PROVIDERS = [
    { id: "c", name: "Claude", logo: "claude-color" },
    { id: "o", name: "ChatGPT", logo: "openai" },
    { id: "g", name: "Gemini", logo: "gemini-color" },
];

export default function KeysScene() {
    return (
        <Stage name="ky">
            <div className="ky-field">
                <p className="ky-label">API key</p>
                <p className="ky-input">
                    <span>sk-proj-•••••••••••••</span>
                    <i className="fx-caret ky-caret" />
                    <b className="ky-strike" />
                    <em className="ky-tag">Not needed</em>
                </p>
            </div>
            <div className="ky-rows">
                {PROVIDERS.map((provider) => (
                    <p className={`ky-row ky-row-${provider.id}`} key={provider.id}>
                        <Mark logo={provider.logo} size={18} />
                        <strong>{provider.name}</strong>
                        <span className="ky-btn">
                            <i className="ky-in">Sign in</i>
                            <i className="ky-spin" />
                            <i className="ky-ok">✓ Signed in</i>
                        </span>
                    </p>
                ))}
            </div>
            <span className="ky-cursor">
                <Pointer />
            </span>
        </Stage>
    );
}
