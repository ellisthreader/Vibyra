import React, { useState } from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import { chatEmpty, chatStarters, chatReach } from "./chatData.js";

// Chat Mode's workspace. Mirrors desktop-tauri ChatSurface.tsx: one centred
// column, the prompt as a left-bordered block rather than a right bubble, and
// the answer as plain prose on no surface at all.

const ACCESS = [
    ["plan", "Plan only"],
    ["standard", "Standard"],
    ["full", "Full access"],
];

function Empty({ onStart }) {
    return (
        <div className="vdev-chat-empty">
            <span className="vdev-chat-glyph">
                <DeviceIcon name="chat" size={18} />
            </span>
            <h2>{chatEmpty.title}</h2>
            <p>{chatEmpty.body}</p>
            <div className="vdev-starters">
                {chatStarters.map(([name, detail]) => (
                    <button key={name} type="button" onClick={() => onStart(name)}>
                        <strong>{name}</strong>
                        <span>{detail}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function Answer({ text }) {
    return (
        <div className="vdev-tr-answer">
            {text.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
        </div>
    );
}

export default function DeviceChat({ chat, onSend, onStop, onNew, thinking, access, onAccess }) {
    const [draft, setDraft] = useState("");
    const submit = (text) => {
        onSend(text ?? draft);
        setDraft("");
    };
    const empty = chat.turns.length === 0;
    return (
        <main className="vdev-workspace vdev-chatview">
            <header className="vdev-chat-head">
                <span className="vdev-chat-title">{chat.title || "New chat"}</span>
                <span className="vdev-pill vdev-pill-accent">Detached</span>
                <button type="button" className="vdev-btn vdev-btn-sm" onClick={onNew}>
                    <DeviceIcon name="plus" size={12} />
                    New chat
                </button>
            </header>

            <div className={`vdev-chat-scroll${empty ? " vdev-chat-scroll-empty" : ""}`}>
                {empty ? (
                    <Empty onStart={submit} />
                ) : (
                    <ol className="vdev-transcript" aria-label="Conversation">
                        {chat.turns.map((turn, index) =>
                            turn.role === "you" ? (
                                <li key={index} className="vdev-tr-item">
                                    <p className="vdev-tr-prompt">{turn.text}</p>
                                </li>
                            ) : (
                                <li key={index} className="vdev-tr-item">
                                    <Answer text={turn.text} />
                                    <p className="vdev-turn-foot">
                                        <span>claude · sonnet</span>
                                        <span>4.1s</span>
                                        <span className="vdev-turn-foot-demo">Illustrative</span>
                                    </p>
                                </li>
                            ),
                        )}
                        {thinking && (
                            <li className="vdev-tr-item">
                                <p className="vdev-run">
                                    <span className="vdev-dot vdev-dot-working" />
                                    Thinking…
                                </p>
                            </li>
                        )}
                    </ol>
                )}
            </div>

            <div className="vdev-chat-composer">
                <p className="vdev-chat-reach">{chatReach}</p>
                <div className="vdev-chat-field">
                    <textarea
                        rows={2}
                        value={draft}
                        maxLength={300}
                        placeholder="Ask anything — this chat has no project"
                        aria-label="Message this chat"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <div className="vdev-chat-actions">
                        <label className="vdev-picker">
                            <span className="vdev-label">Access</span>
                            <select value={access} onChange={(event) => onAccess(event.target.value)}>
                                {ACCESS.map(([id, label]) => (
                                    <option key={id} value={id}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="vdev-label vdev-chat-demo">Demo</span>
                        {thinking ? (
                            <button type="button" className="vdev-send" onClick={onStop}>
                                <DeviceIcon name="stop" size={12} /> Stop
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="vdev-send"
                                disabled={!draft.trim()}
                                onClick={() => submit()}
                            >
                                Send <DeviceIcon name="send" size={12} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
