import React, { useEffect, useRef, useState } from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import { validateConfig } from "./projectState.js";

const STARTERS = [
    ["Check my terminals", "See what is running and what needs you", "Check the terminals in this project and briefly tell me what is running and whether anything needs my attention."],
    ["Explain this project", "Find your bearings in the codebase", "Give me a concise overview of this project, its main entry points, and how the pieces fit together."],
    ["Choose the next useful task", "Turn an idea into a clear next step", "Review this project and suggest the smallest useful next task, with a clear reason."],
];

// The Mac Chat surface: one project-scoped thread, Files in the header, and
// one large composer with Send becoming Stop while the sample is answering.
export function ChatPanel({ demo, onFiles }) {
    const [draft, setDraft] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [listening, setListening] = useState(false);
    const [voiceMessage, setVoiceMessage] = useState("");
    const scroll = useRef(null);
    const menu = useRef(null);
    const menuTrigger = useRef(null);
    const recognition = useRef(null);
    const turns = demo.turns ?? [];
    useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [turns, demo.run]);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const outside = (event) => { if (!menu.current?.contains(event.target)) setMenuOpen(false); };
        window.addEventListener("pointerdown", outside);
        return () => window.removeEventListener("pointerdown", outside);
    }, [menuOpen]);
    useEffect(() => () => recognition.current?.abort(), []);
    const toggleVoice = () => {
        if (recognition.current) { recognition.current.stop(); return; }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { setVoiceMessage("Voice input is available in Vibyra Desktop."); return; }
        const session = new SpeechRecognition();
        session.lang = navigator.language || "en-GB";
        session.interimResults = false;
        session.onresult = (event) => {
            const words = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
            if (words) { setDraft((current) => `${current} ${words}`.trim().slice(0, 300)); setVoiceMessage("Voice input added to your message."); }
        };
        session.onerror = (event) => setVoiceMessage(event.error === "not-allowed" ? "Microphone access was declined." : "Voice input could not start. Try typing your message.");
        session.onend = () => { recognition.current = null; setListening(false); };
        recognition.current = session;
        setVoiceMessage("Listening…");
        setListening(true);
        try { session.start(); } catch { recognition.current = null; setListening(false); setVoiceMessage("Voice input could not start. Try typing your message."); }
    };
    const submit = (value = draft) => {
        if (!value.trim() || demo.run) return;
        demo.send(value);
        setDraft("");
    };
    return <div className="vdev-chat-panel">
        <div className="vdev-chat-context">
            <img src="/vibyra-cobalt.png" alt="" width="28" height="28" />
            <div className="vdev-chat-identity"><strong>Vibyra <span>AI</span></strong>
                <small><DeviceIcon name="folder" size={11} />{demo.project.name}</small></div>
            {demo.run && <span className="vdev-chat-working"><i />Working</span>}
            <button type="button" className="vdev-chat-files" onClick={onFiles} aria-label="Open project files">
                <DeviceIcon name="folder" size={14} />Files
            </button>
            {turns.length > 0 && <div className="vdev-chat-menu" ref={menu} onKeyDown={(event) => {
                if (event.key === "Escape" && menuOpen) { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); menuTrigger.current?.focus(); }
            }}>
                <button ref={menuTrigger} type="button" className="vdev-icon-btn" aria-label="Conversation options" aria-expanded={menuOpen}
                    onClick={() => setMenuOpen(!menuOpen)}>···</button>
                {menuOpen && <div className="vdev-chat-menu-pop" role="menu">
                    <button type="button" role="menuitem" onClick={() => { demo.clearTurns?.(); setMenuOpen(false); }}>Clear conversation</button>
                </div>}
            </div>}
        </div>
        <div className="vdev-chat-transcript" ref={scroll} role="log" aria-label="Conversation">
            {turns.length === 0 && <div className="vdev-chat-empty">
                <img src="/vibyra-cobalt.png" alt="" width="40" height="34" />
                <h2>What can I help with?</h2>
                <p>Get a fresh perspective, check your agents, or take the next step.</p>
                <div className="vdev-chat-starters">{STARTERS.map(([label, detail, prompt]) =>
                    <button type="button" key={label} onClick={() => submit(prompt)}>
                        <span><strong>{label}</strong><small>{detail}</small></span><span aria-hidden="true">→</span>
                    </button>)}</div>
            </div>}
            {turns.map((turn, index) => <div key={index} className={`vdev-chat-turn vdev-chat-turn-${turn.role === "you" ? "user" : "assistant"}`}>
                {turn.role !== "you" && <img src="/vibyra-cobalt.png" alt="" width="22" height="22" />}
                <p>{turn.text}</p>
            </div>)}
            {demo.run && <div className="vdev-chat-turn vdev-chat-turn-assistant" aria-busy="true">
                <img src="/vibyra-cobalt.png" alt="" width="22" height="22" />
                <p className="vdev-chat-thinking"><i /><i /><i /></p>
            </div>}
        </div>
        <div className="vdev-chat-composer">
            <textarea rows={2} value={draft} maxLength={300} spellCheck="false" placeholder="Message Vibyra…"
                aria-label="Message Vibyra" onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault(); submit();
                    }
                }} />
            <div className="vdev-chat-compose-tools">
                <button type="button" className="vdev-chat-voice" aria-label={listening ? "Stop voice input" : "Start voice input"}
                    aria-pressed={listening} onClick={toggleVoice}><DeviceIcon name="mic" size={13} />{listening ? "Stop voice" : "Voice"}</button>
                <span className="vdev-chat-hint" role="status">{voiceMessage || (demo.run ? "Working…" : "↵ Send")}</span>
                {demo.run ? <button type="button" className="vdev-chat-send vdev-chat-stop" aria-label="Stop the reply" onClick={demo.stop}>
                    <DeviceIcon name="stop" size={13} />
                </button> : <button type="button" className="vdev-chat-send" aria-label="Send message" disabled={!draft.trim()} onClick={() => submit()}>
                    <DeviceIcon name="send" size={14} />
                </button>}
            </div>
        </div>
    </div>;
}

export function FilesPanel({ data, file, onFile, onWrite, changed }) {
    const [error, setError] = useState(null);
    return <div className="vdev-panel vdev-files-panel">
        <p className="vdev-files-scope">{data.name} · Sample files</p>
        <div className="vdev-tree">{Object.keys(data.files).map((name) => <button
            key={name} type="button" className={`vdev-tree-row${name === file ? " vdev-tree-row-active" : ""}`}
            onClick={() => { setError(null); onFile(name); }}>
            <DeviceIcon name="file" size={13} /><span>{name}</span>{changed.includes(name) && <em>edited</em>}
        </button>)}</div>
        <textarea className="vdev-editor" value={data.files[file]} spellCheck="false" aria-label={`Edit ${file}`}
            onChange={(event) => {
                const next = event.target.value;
                const message = file.endsWith(".json") ? validateConfig(next) : null;
                setError(message);
                if (!message) onWrite(file, next);
            }} />
        {error && <p className="vdev-error">{error}</p>}
    </div>;
}

export function ReviewPanel({ data, changed, onKeep, onDiscard }) {
    if (!changed.length) return <p className="vdev-worktree-quiet">No changes to review in this sample worktree.</p>;
    return <div className="vdev-panel vdev-review-panel">
        <p className="vdev-label">{changed.length} changed file{changed.length === 1 ? "" : "s"}</p>
        {changed.map((name) => <div key={name} className="vdev-diff"><span className="vdev-label">{name}</span>
            <pre>{data.files[name].split("\n").slice(0, 16).map((line, index) => <span
                key={index} className={line === data.baseline[name].split("\n")[index] ? "" : "vdev-diff-add"}>
                {line || " "}{"\n"}
            </span>)}</pre></div>)}
        <div className="vdev-review-actions"><button type="button" className="vdev-btn" onClick={onDiscard}>Discard</button>
            <button type="button" className="vdev-btn vdev-btn-primary" onClick={onKeep}>Keep</button></div>
    </div>;
}
